// src/features/tours/search.ts
import { getSupabase } from '@/lib/supabase';

/* ──────────────────────────── Tipos ──────────────────────────── */

export type TourSearchRow = {
  id: string;
  slug: string;
  title: string;
  city: string | null;
  duration_hours: number | null;
  base_price: number | null; // COP entero
};

export type AvailabilityRow = {
  date: string;     // YYYY-MM-DD
  price: number | null;    // COP entero (si aplica)
  capacity: number | null; // capacidad/aforo restante/total según esquema
};

/* ──────────────────────────── Utils ──────────────────────────── */

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const isIsoDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/* ──────────────────────────── API ──────────────────────────── */

/**
 * Busca tours por relevancia:
 * - Si existe columna `search_tsv` (tsvector), usa `textSearch(websearch)`.
 * - Si no, cae a ILIKE sobre `title|summary|city`.
 * - Filtro opcional por ciudad (incluye filas con `city IS NULL` para catálogos incompletos).
 */
export async function searchTours(query: string, city?: string, limit = 5): Promise<TourSearchRow[]> {
  const sb = getSupabase();
  const q = (query || '').trim();
  const max = clamp(Math.floor(limit), 1, 50);

  // Builder base
  const base = sb
    .from('tours')
    .select('id, slug, title, city, duration_hours, base_price');

  // Filtro de ciudad (AND) — solo si viene
  const withCity = () => {
    let b = base;
    if (city && city.trim()) {
      // (city = X) OR (city IS NULL)  — mantiene tours sin ciudad seteada
      b = b.or(`city.eq.${city.trim()},city.is.null`);
    }
    return b;
  };

  // Sin término → solo filtra por ciudad y limita
  if (!q) {
    const { data, error } = await withCity().limit(max);
    if (error) throw error;
    return (data ?? []) as TourSearchRow[];
  }

  // Intento 1: FTS con tsvector
  const fts = withCity().textSearch('search_tsv', q, { type: 'websearch', config: 'spanish' }).limit(max);
  const { data: ftsData, error: ftsErr } = await fts;

  // Éxito del FTS
  if (!ftsErr) return (ftsData ?? []) as TourSearchRow[];

  // Si falló por columna inexistente u otro motivo, cae a ILIKE amplio
  // Nota: múltiples `.or` se combinan con AND entre sí, que es lo que queremos:
  // (city = X OR city IS NULL) AND (title ILIKE ... OR summary ILIKE ... OR city ILIKE ...)
  const pattern = `%${q.replace(/[%_]/g, '')}%`;
  let fallback = base;
  if (city && city.trim()) {
    fallback = fallback.or(`city.eq.${city.trim()},city.is.null`);
  }
  fallback = fallback.or(
    `title.ilike.${pattern},summary.ilike.${pattern},city.ilike.${pattern}`,
  );

  const { data: likeData, error: likeErr } = await fallback.limit(max);
  if (likeErr) throw likeErr;
  return (likeData ?? []) as TourSearchRow[];
}

/**
 * Consulta disponibilidad/slots de un tour.
 * - Rango opcional [from, to] en formato YYYY-MM-DD (inclusive).
 * - Orden ascendente por fecha.
 */
export async function availabilityFor(
  tourId: string,
  from?: string,
  to?: string,
  limit = 10,
): Promise<AvailabilityRow[]> {
  const sb = getSupabase();
  const max = clamp(Math.floor(limit), 1, 100);

  let q = sb
    .from('tour_availability')
    .select('date, price, capacity')
    .eq('tour_id', tourId);

  if (isIsoDate(from)) q = q.gte('date', from!);
  if (isIsoDate(to)) q = q.lte('date', to!);

  q = q.order('date', { ascending: true }).limit(max);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AvailabilityRow[];
}
