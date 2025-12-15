// src/features/tours/server.ts
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type {
  PostgrestResponse,
  PostgrestSingleResponse,
  PostgrestError,
} from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env';

/* ─────────────────────────────────────────────────────────────
   Tipos (alineados a la tabla `tours`)
   ───────────────────────────────────────────────────────────── */
export type Json = unknown;

export type Tour = {
  id: string;
  slug: string;
  title: string;
  city: string;
  tags: string[] | null;
  base_price: number;
  duration_hours: number | null;
  images: Json | null; // [{ url, alt }, …]
  summary: string | null;
  body_md: string | null;
  created_at: string | null;
  updated_at: string | null;
};

/* ─────────────────────────────────────────────────────────────
   Cliente público (no persiste sesión)
   ───────────────────────────────────────────────────────────── */
function getPublicClient() {
  const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  const anon = publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  return createClient(url, anon, { auth: { persistSession: false } });
}

/* ─────────────────────────────────────────────────────────────
   Select base (evita *; controla orden/paginación)
   ───────────────────────────────────────────────────────────── */
const BASE_COLUMNS = [
  'id',
  'slug',
  'title',
  'city',
  'tags',
  'base_price',
  'duration_hours',
  'images',
  'summary',
  'body_md',
  'created_at',
  'updated_at',
].join(', ');

/* ─────────────────────────────────────────────────────────────
   Filtros, orden y paginación
   ───────────────────────────────────────────────────────────── */
export type ListParams = {
  q?: string;
  city?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  orderBy?: 'created_at' | 'title' | 'base_price';
  ascending?: boolean;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT = process.env.NODE_ENV === 'production' ? 5000 : 3500;
const FTS_COLUMN = 'search_tsv'; // tsvector en tu bd
const FTS_CONFIG = 'spanish';

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function applyBaseFilters(
  q: ReturnType<ReturnType<typeof getPublicClient>['from']>,
  params: ListParams,
) {
  const { city, tags } = params;
  let query = q.select(BASE_COLUMNS, { count: 'exact' });
  if (city) query = query.eq('city', city);
  if (tags && tags.length > 0) query = query.contains('tags', tags);
  return query;
}

function applyOrderingPaging(
  query: any,
  params: Required<Pick<ListParams, 'orderBy' | 'ascending' | 'limit' | 'offset'>>,
) {
  const { orderBy, ascending, limit, offset } = params;
  return query.order(orderBy, { ascending }).range(offset, Math.max(offset + limit - 1, offset));
}

/* ─────────────────────────────────────────────────────────────
   Listado con FTS → fallback ILIKE + timeout “amable”
   ───────────────────────────────────────────────────────────── */
export async function fetchTours(params: ListParams = {}) {
  const supa = getPublicClient();

  const limit = clamp(Math.floor(params.limit ?? 12), 1, 100);
  const offset = Math.max(0, Math.floor(params.offset ?? 0));
  const orderBy: NonNullable<ListParams['orderBy']> = params.orderBy ?? 'created_at';
  const ascending = Boolean(params.ascending ?? false);
  const timeoutMs = Math.max(500, Math.floor(params.timeoutMs ?? DEFAULT_TIMEOUT));
  const qText = (params.q ?? '').trim();

  const base = applyBaseFilters(supa.from('tours'), params);

  let withSearch = base;
  if (qText) {
    withSearch = withSearch.textSearch(FTS_COLUMN, qText, {
      type: 'websearch',
      config: FTS_CONFIG,
    });
  }

  const finalQuery = applyOrderingPaging(withSearch, { orderBy, ascending, limit, offset });

  type Resp = PostgrestResponse<Tour>;

  // 👉 evita el error de tipos usando una función async (que sí es Promise<Resp>)
  const execQuery = async () => (await finalQuery) as Resp;

  const timeoutPromise: Promise<Resp> = new Promise((resolve) =>
    setTimeout(
      () =>
        resolve({
          data: null,
          error: { message: 'timeout' } as PostgrestError,
          count: null,
          status: 408,
          statusText: 'Request Timeout',
        }),
      timeoutMs,
    ),
  );

  let res = (await Promise.race([execQuery(), timeoutPromise])) as Resp;

  // Fallback a ILIKE si falla FTS por columna inexistente o por timeout
  const needFallback =
    qText &&
    (res.error?.code === '42703' || // undefined_column
      res.status === 408 ||
      res.error?.message === 'timeout');

  if (needFallback) {
    const ilike = `%${qText.replace(/[%_]/g, '')}%`;
    const fallbackExec = async () =>
      (await applyOrderingPaging(
        base.or(`title.ilike.${ilike},summary.ilike.${ilike},city.ilike.${ilike}`),
        { orderBy, ascending, limit, offset },
      )) as Resp;

    res = await fallbackExec();
  }

  if (res.error) {
    throw new Error(`[fetchTours] ${res.error.code ?? res.status}: ${res.error.message}`);
  }

  const items = (res.data ?? []) as Tour[];
  const total =
    typeof res.count === 'number'
      ? res.count
      : Array.isArray(res.data)
      ? res.data.length
      : 0;

  return {
    items,
    total,
    limit,
    offset,
    hasMore: offset + items.length < total,
  };
}

/* ─────────────────────────────────────────────────────────────
   Detalle por slug (case-insensitive) — FIX tipos maybeSingle
   ───────────────────────────────────────────────────────────── */
export async function fetchTourBySlug(slug: string): Promise<Tour | null> {
  const supa = getPublicClient();
  const key = String(slug ?? '').toLowerCase();

  // 🛠️ Deja que TS infiera `PostgrestSingleResponse<Tour | null>`
  const { data, error }: PostgrestSingleResponse<Tour | null> = await supa
    .from('tours')
    .select(BASE_COLUMNS)
    .ilike('slug', key)
    .maybeSingle<Tour>();

  if (error) {
    throw new Error(`[fetchTourBySlug] ${error.code ?? ''} ${error.message}`);
  }
  return data ?? null;
}
