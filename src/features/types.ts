// src/features/tours/types.ts

/** ─────────────────────────────────────────────────────────────
 *  Catálogo KCE — Tipos y utilidades
 *  - Estrictos, reutilizables y sin dependencias de runtime.
 *  - Mantén este archivo pequeño y estable.
 *  ──────────────────────────────────────────────────────────── */

/* ======================= Moneda ======================= */

/** Códigos ISO-4217 soportados (precios siempre en enteros). */
export const SUPPORTED_CURRENCIES = ['COP'] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export function isCurrencyCode(x: string): x is CurrencyCode {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(x);
}

/* ======================= Orden / Sort ======================= */

export const SORTS = ['popular', 'price-asc', 'price-desc'] as const;
export type TourSort = (typeof SORTS)[number];

export function isTourSort(x: string): x is TourSort {
  return (SORTS as readonly string[]).includes(x);
}

export function coerceTourSort(x: unknown, fallback: TourSort = 'popular'): TourSort {
  const v = String(x ?? '').toLowerCase();
  return isTourSort(v) ? v : fallback;
}

/* ======================= Tags ======================= */

/**
 * Lista canónica de tags conocidos para autocompletado/UX.
 * ⚠️ No bloquea CMS: los tours pueden traer tags libres.
 */
export const KNOWN_TAGS = [
  'coffee',
  'culture',
  'walking',
  'art',
  'history',
  'photo',
  'nature',
  'day-trip',
  'scenic',
  'sunset',
  'romantic',
  'boat',
  'hike',
  'beach',
  'relax',
] as const;

export type KnownTourTag = (typeof KNOWN_TAGS)[number];

/** Tag aceptado por el catálogo (conocido o libre). */
export type TourTag = KnownTourTag | string;

export function isKnownTourTag(x: string): x is KnownTourTag {
  return (KNOWN_TAGS as readonly string[]).includes(x);
}

/** Normaliza un tag arbitrario a minúsculas + trim. */
export function normalizeTag(tag: string): TourTag {
  return tag.trim().toLowerCase();
}

/* ======================= Modelo principal ======================= */

/**
 * Modelo base del catálogo.
 * - Precios en COP (enteros).
 * - `slug` en kebab-case.
 * - `tags` inmutables (evita mutaciones accidentales).
 */
export type Tour = Readonly<{
  /** Id estable (uuid, cuid, etc.) */
  id: string;
  /** Ruta kebab-case (p. ej. "bogota-coffee-culture") */
  slug: string;
  /** Nombre público del tour */
  title: string;
  /** Ciudad de inicio */
  city: string;
  /** Duración en horas (> 0) */
  durationHours: number;
  /** Precio por persona en COP (entero >= 0) */
  price: number;
  /** Calificación promedio (0..5) */
  rating: number;
  /** Imagen principal (ruta pública o URL permitida por next/image) */
  image: string;
  /** Descripción corta (para cards/SEO) */
  short: string;
  /** Tags para filtros y discoverability */
  tags: readonly TourTag[];
}>;

/** Sub-conjunto seguro para flows de reserva/checkout (incluye slug). */
export type TourSummary = Pick<Tour, 'slug' | 'title' | 'short' | 'price'>;
/** Alias retro-compat. */
export type MiniTour = TourSummary;

/** Shape de filtros de lista/URL. */
export type TourFilter = Partial<{
  q: string;
  tag: string;
  city: string;
  sort: TourSort;
}>;

/* ======================= Guards & helpers ======================= */

export function isTour(x: unknown): x is Tour {
  if (x == null || typeof x !== 'object') return false;
  const t = x as Record<string, unknown>;
  const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
  const tagsOk =
    Array.isArray(t.tags) &&
    t.tags.every((v) => typeof v === 'string' && v.length > 0);

  return (
    isStr(t.id) &&
    isStr(t.slug) &&
    isStr(t.title) &&
    isStr(t.city) &&
    isNum(t.durationHours) &&
    (t.durationHours as number) > 0 &&
    isNum(t.price) &&
    (t.price as number) >= 0 &&
    isNum(t.rating) &&
    (t.rating as number) >= 0 &&
    (t.rating as number) <= 5 &&
    isStr(t.image) &&
    isStr(t.short) &&
    tagsOk
  );
}

/** Lanza si el payload no es un `Tour` válido. */
export function assertTour(x: unknown, message = 'Invalid Tour payload'): asserts x is Tour {
  if (!isTour(x)) throw new Error(message);
}

/** Narrow para summaries ligeros (útil en integraciones). */
export function isTourSummary(x: unknown): x is TourSummary {
  if (x == null || typeof x !== 'object') return false;
  const t = x as Record<string, unknown>;
  return (
    typeof t.title === 'string' &&
    t.title.length > 0 &&
    typeof t.price === 'number' &&
    Number.isFinite(t.price) &&
    (t.short == null || typeof t.short === 'string') &&
    typeof t.slug === 'string' &&
    t.slug.length > 0
  );
}

/** Deriva un summary seguro desde un tour completo. */
export function toTourSummary(t: Tour): TourSummary {
  return { slug: t.slug, title: t.title, short: t.short, price: t.price };
}

/** Normaliza filtros (defensive): strings trim, tag en minúsculas, sort válido. */
export function coerceTourFilter(raw: Partial<TourFilter>): TourFilter {
  const q = (raw.q ?? '').toString().trim();
  const tag = (raw.tag ?? '').toString().trim().toLowerCase();
  const city = (raw.city ?? '').toString().trim();
  const sort = coerceTourSort(raw.sort ?? 'popular');
  return { q, tag, city, sort };
}

/** Slug helper: kebab-case muy permisivo (solo a-z0-9 y guiones). */
export function kebabify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Clave canónica (útil para maps/sets/memo) */
export function getTourKey(t: Pick<Tour, 'slug'>): string {
  return kebabify(t.slug);
}

/* ======================= Filtrado/orden (opcional reusable) ======================= */

/** Devuelve `true` si el tour matchea los filtros dados. */
export function matchesFilter(t: Tour, f: TourFilter): boolean {
  const qlc = (f.q ?? '').toLowerCase();
  const tag = (f.tag ?? '').toLowerCase();
  const byQ =
    !qlc ||
    t.title.toLowerCase().includes(qlc) ||
    t.short.toLowerCase().includes(qlc) ||
    (t.tags ?? []).some((x) => String(x).toLowerCase().includes(qlc));
  const byTag = !tag || (t.tags ?? []).some((x) => String(x).toLowerCase() === tag);
  const byCity = !(f.city ?? '') || t.city === f.city;
  return byQ && byTag && byCity;
}

/** Comparator según `TourSort`. */
export function compareBySort(a: Tour, b: Tour, sort: TourSort): number {
  switch (sort) {
    case 'price-asc':
      return a.price - b.price;
    case 'price-desc':
      return b.price - a.price;
    case 'popular':
    default:
      return 0; // mantiene orden original
  }
}

/** Aplica filtro + orden y devuelve nuevo array (no muta el original). */
export function filterAndSort<T extends Tour>(
  items: readonly T[],
  filter: TourFilter,
): T[] {
  const f = coerceTourFilter(filter);
  const list = items.filter((t) => matchesFilter(t, f));
  return f.sort === 'popular' ? list : [...list].sort((a, b) => compareBySort(a, b, f.sort!));
}

/* ======================= Utilidades genéricas ======================= */

/** Marca un tipo como mutable (por si necesitas clonar y mutar). */
export type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
