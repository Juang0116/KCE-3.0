// src/features/tours/server.ts
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PostgrestSingleResponse, PostgrestError } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { TOURS } from './data.mock';

/* ─────────────────────────────────────────────────────────────
   Tipos y shape para la UI
   ───────────────────────────────────────────────────────────── */
type RowTour = Database['public']['Tables']['tours']['Row'];

type ImageItem = { url: string; alt?: string | null };

type UxTour = {
  /* UI-friendly (compatible con mocks) */
  id: string;
  slug: string;
  title: string;
  city: string;
  tags: string[];
  price: number;                 // COP entero
  durationHours: number | null;
  image: string;
  images: ImageItem[];
  short: string;

  /* Raw-ish (por si la UI quiere los campos exactos) */
  base_price: number;
  duration_hours: number | null;
  summary: string;
  body_md: string;
};

const COLUMNS =
  'id, slug, title, city, tags, base_price, duration_hours, images, summary, body_md';

/* Timeout corto para no colgar SSR */
const TIMEOUT_MS = process.env.NODE_ENV === 'production' ? 3500 : 2000;

/* Cache en-proceso con TTL (evita doble fetch) */
const CACHE_TTL_MS = 20_000;
type CacheEntry = { expires: number; value: UxTour | null };
const TOUR_CACHE = new Map<string, CacheEntry>();

/* ─────────────────────────────────────────────────────────────
   Supabase público (solo si está bien configurado)
   ───────────────────────────────────────────────────────────── */
function isPublicSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return false;
  if (/XXXXXX|example|your\-project/i.test(url)) return false;
  return key.length >= 20;
}

let sbSingleton: SupabaseClient<Database> | null = null;
function getSb(): SupabaseClient<Database> | null {
  if (!isPublicSupabaseConfigured()) return null;
  if (sbSingleton) return sbSingleton;
  sbSingleton = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    { auth: { persistSession: false } },
  );
  return sbSingleton;
}

/* ─────────────────────────────────────────────────────────────
   Utils
   ───────────────────────────────────────────────────────────── */
function asImageArray(val: unknown): ImageItem[] {
  if (!Array.isArray(val)) return [];
  return (val as unknown[]).flatMap((x) => {
    const it = x as Record<string, unknown>;
    const url = typeof it?.url === 'string' ? it.url : null;
    if (!url) return [];
    const alt =
      it?.alt == null || typeof it.alt === 'string' || typeof it.alt === 'number'
        ? (it.alt as string | number | null)
        : null;
    return [{ url, alt: alt == null ? null : String(alt) }];
  });
}

function normalize(row: RowTour): UxTour {
  const images = asImageArray(row.images);
  const imgUrl = images[0]?.url ?? '';
  const tags = Array.isArray(row.tags)
    ? row.tags.filter((t): t is string => typeof t === 'string')
    : [];

  const basePrice = Number.isFinite(row.base_price) ? Number(row.base_price) : 0;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    city: row.city ?? '',
    tags,
    price: basePrice,
    durationHours: row.duration_hours ?? null,
    image: imgUrl,
    images,
    short: row.summary ?? '',

    base_price: basePrice,
    duration_hours: row.duration_hours ?? null,
    summary: row.summary ?? '',
    body_md: row.body_md ?? '',
  };
}

function now() {
  return Date.now();
}

function getFromCache(slugKey: string): UxTour | null | undefined {
  const hit = TOUR_CACHE.get(slugKey);
  if (!hit) return undefined;
  if (hit.expires < now()) {
    TOUR_CACHE.delete(slugKey);
    return undefined;
  }
  return hit.value;
}

function setCache(slugKey: string, value: UxTour | null) {
  TOUR_CACHE.set(slugKey, { value, expires: now() + CACHE_TTL_MS });
}

/** Promise.race con respuesta tipada y shape completo (incluye `count`) */
function withTimeout<T>(
  p: Promise<PostgrestSingleResponse<T>>,
  ms = TIMEOUT_MS,
): Promise<PostgrestSingleResponse<T>> {
  return Promise.race([
    p,
    new Promise<PostgrestSingleResponse<T>>((resolve) =>
      setTimeout(
        () =>
          resolve({
            data: null,
            error: { message: 'timeout' } as unknown as PostgrestError,
            status: 408,
            statusText: 'Request Timeout',
            count: null, // ← requerido por el tipo Failure
          }),
        ms,
      ),
    ),
  ]);
}

function warnDev(...args: unknown[]) {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.warn(...args);
  }
}

/* ─────────────────────────────────────────────────────────────
   API principal
   ───────────────────────────────────────────────────────────── */
/**
 * Obtiene un tour por slug. Intenta coincidencia exacta y, si no hay resultado,
 * hace un fallback case-insensitive. Si no hay Supabase o falla/timeout, usa el mock.
 */
export async function getTourBySlug(slug: string): Promise<UxTour | null> {
  const raw = (slug ?? '').trim();
  if (!raw) return null;

  const key = raw.toLowerCase();

  // 1) Cache en-proceso (rápido)
  const cached = getFromCache(key);
  if (cached !== undefined) return cached;

  // 2) Supabase (si está configurado)
  const sb = getSb();
  if (sb) {
    // a) Match exacto
    const exact = await withTimeout<RowTour>(
      // Cast a Promise para satisfacer TS (el builder es thenable pero no tipa como Promise)
      (sb
        .from('tours')
        .select(COLUMNS)
        .eq('slug', raw)
        .maybeSingle<RowTour>()) as unknown as Promise<PostgrestSingleResponse<RowTour>>,
    );

    if (exact.error && exact.error.message !== 'timeout') {
      warnDev('[getTourBySlug] eq error:', exact.error.message);
    }
    if (exact.data) {
      const norm = normalize(exact.data);
      setCache(key, norm);
      return norm;
    }

    // b) Fallback case-insensitive (exact string pero sin importar mayúsculas)
    const ci = await withTimeout<RowTour>(
      (sb
        .from('tours')
        .select(COLUMNS)
        .ilike('slug', raw)
        .maybeSingle<RowTour>()) as unknown as Promise<PostgrestSingleResponse<RowTour>>,
    );

    if (ci.error && ci.error.message !== 'timeout') {
      warnDev('[getTourBySlug] ilike error:', ci.error.message);
    }
    if (ci.data) {
      const norm = normalize(ci.data);
      setCache(key, norm);
      return norm;
    }
  }

  // 3) Mock de respaldo (sin SB/timeout o no existe el tour)
  const mock =
    TOURS.find((t) => t.slug === raw) ??
    TOURS.find((t) => t.slug.toLowerCase() === key) ??
    null;

  const value: UxTour | null = mock
    ? {
        id: mock.id,
        slug: mock.slug,
        title: mock.title,
        city: mock.city,
        // copia mutable (evita readonly → string[])
        tags: [...(mock.tags ?? [])],
        price: mock.price,
        durationHours: mock.durationHours ?? null,
        image: mock.image,
        images: mock.image ? [{ url: mock.image, alt: mock.title }] : [],
        short: mock.short ?? '',
        base_price: mock.price,
        duration_hours: mock.durationHours ?? null,
        summary: mock.short ?? '',
        body_md: '',
      }
    : null;

  setCache(key, value);
  return value;
}
