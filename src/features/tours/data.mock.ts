// src/features/tours/data.mock.ts
import type { Tour } from '../types';

/**
 * 🧪 Mock de tours para la demo.
 * - Precios en COP (enteros, sin decimales).
 * - Tags en minúsculas para filtros consistentes.
 * - El orden del array define “popular”.
 */

export const TOURS: Tour[] = [
  {
    id: 't_001',
    slug: 'bogota-coffee-culture',
    title: 'Bogotá Coffee Culture',
    city: 'Bogotá',
    durationHours: 4,
    price: 120_000,
    rating: 4.8,
    image: '/images/tours/bogota-coffee.jpg',
    short: 'Cata de cafés especiales, tostión artesanal y barrios bohemios.',
    tags: ['coffee', 'culture', 'walking'],
  },
  {
    id: 't_002',
    slug: 'medellin-street-art',
    title: 'Medellín Street Art',
    city: 'Medellín',
    durationHours: 3,
    price: 110_000,
    rating: 4.7,
    image: '/images/tours/medellin.jpg',
    short: 'Graffitis, historia y transformación social en Comuna 13.',
    tags: ['art', 'history', 'photo'],
  },
  {
    id: 't_003',
    slug: 'guatape-day-trip',
    title: 'Guatapé Day Trip',
    city: 'Guatapé',
    durationHours: 8,
    price: 280_000,
    rating: 4.9,
    image: '/images/tours/guatape.jpg',
    short: 'La piedra del Peñol, colores vibrantes y paseo en lancha.',
    tags: ['nature', 'day-trip', 'scenic'],
  },
  {
    id: 't_004',
    slug: 'cartagena-sunset-sail',
    title: 'Cartagena Sunset Sail',
    city: 'Cartagena',
    durationHours: 2,
    price: 240_000,
    rating: 4.6,
    image: '/images/tours/cartagena-sunset.jpg',
    short: 'Navega al atardecer por la bahía con brindis incluido.',
    tags: ['sunset', 'romantic', 'boat'],
  },
  {
    id: 't_005',
    slug: 'cocora-valley-hike',
    title: 'Cocora Valley Hike',
    city: 'Salento',
    durationHours: 6,
    price: 260_000,
    rating: 4.8,
    image: '/images/tours/cocora.jpg',
    short: 'Sendero entre palmas de cera y paisajes cafeteros.',
    tags: ['hike', 'nature', 'coffee'],
  },
  {
    id: 't_006',
    slug: 'tayrona-paradise-beaches',
    title: 'Tayrona Paradise Beaches',
    city: 'Santa Marta',
    durationHours: 9,
    price: 320_000,
    rating: 4.7,
    image: '/images/tours/tayrona.jpg',
    short: 'Caminata suave y playas cristalinas en el Tayrona.',
    tags: ['beach', 'nature', 'relax'],
  },
];

/* ───────────────────────── helpers ───────────────────────── */

const collator = new Intl.Collator('es-CO', { sensitivity: 'base' });

/** Normaliza texto para búsqueda: minúsculas, sin tildes/diacríticos. */
function toSearch(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .trim();
}

/** Garantiza acceso O(1) por slug (case-insensitive). */
export const TOURS_BY_SLUG = new Map<string, Tour>(
  TOURS.map((t) => [t.slug.toLowerCase(), t] as const),
);

/** Conjuntos (ordenados) de tags y ciudades para filtros. */
export const TAGS = Array.from(
  new Set(
    TOURS.flatMap((t) => (t.tags ?? []).map((x) => x.toLowerCase().trim())),
  ),
).sort(collator.compare);

export const CITIES = Array.from(new Set(TOURS.map((t) => t.city))).sort(
  collator.compare,
);

/** Obtiene un tour por slug (case-insensitive). */
export function getTourBySlug(slug: string | undefined | null): Tour | undefined {
  if (!slug) return undefined;
  return TOURS_BY_SLUG.get(String(slug).toLowerCase());
}

export type TourSort = 'popular' | 'price-asc' | 'price-desc';

export function filterAndSortTours({
  q = '',
  tag = '',
  city = '',
  sort = 'popular',
}: {
  q?: string;
  tag?: string;
  city?: string;
  sort?: TourSort;
}): Tour[] {
  const qSearch = toSearch(q);
  const tagLc = tag.trim().toLowerCase();
  const cityCmp = city.trim();

  // Filtrado sin acentos en q; tag y ciudad exactos (pero tag ya está en minúsculas)
  const items = TOURS.filter((t) => {
    const haystack = [
      t.title,
      t.short ?? '',
      ...(t.tags ?? []),
      t.city,
    ]
      .map((s) => toSearch(String(s)))
      .join(' • ');

    const matchQ = !qSearch || haystack.includes(qSearch);
    const matchTag = !tagLc || (t.tags ?? []).some((x) => x.toLowerCase() === tagLc);
    const matchCity = !cityCmp || collator.compare(t.city, cityCmp) === 0;

    return matchQ && matchTag && matchCity;
  });

  // Orden estable y expresivo
  if (sort === 'price-asc') {
    return [...items].sort((a, b) => {
      const pa = a.price ?? 0;
      const pb = b.price ?? 0;
      if (pa !== pb) return pa - pb;
      // desempate por rating desc y título
      if ((b.rating ?? 0) !== (a.rating ?? 0)) return (b.rating ?? 0) - (a.rating ?? 0);
      return collator.compare(a.title, b.title);
    });
  }

  if (sort === 'price-desc') {
    return [...items].sort((a, b) => {
      const pa = a.price ?? 0;
      const pb = b.price ?? 0;
      if (pa !== pb) return pb - pa;
      if ((b.rating ?? 0) !== (a.rating ?? 0)) return (b.rating ?? 0) - (a.rating ?? 0);
      return collator.compare(a.title, b.title);
    });
  }

  // 'popular' → mantiene el orden del mock original (ya es una copia tras filter)
  return items;
}

/* ─────────────── Checks de sanidad en desarrollo ─────────────── */
if (process.env.NODE_ENV !== 'production') {
  const seen = new Set<string>();

  for (const t of TOURS) {
    if (!/^[a-z0-9-]+$/.test(t.slug)) {
      // eslint-disable-next-line no-console
      console.warn(`[TOURS] slug no recomendado: "${t.slug}" (usa kebab-case a-z0-9-)`);
    }
    if (seen.has(t.slug)) {
      // eslint-disable-next-line no-console
      console.warn(`[TOURS] slug duplicado: "${t.slug}"`);
    }
    seen.add(t.slug);

    if (!Number.isFinite(t.price) || t.price < 0) {
      // eslint-disable-next-line no-console
      console.warn(`[TOURS] precio inválido en "${t.slug}": ${t.price}`);
    }
    if (t.tags && t.tags.some((x) => x !== x.toLowerCase())) {
      // eslint-disable-next-line no-console
      console.warn(`[TOURS] tags deben venir en minúsculas en "${t.slug}"`);
    }
  }
}
