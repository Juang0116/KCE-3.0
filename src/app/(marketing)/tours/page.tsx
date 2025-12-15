// src/app/(marketing)/tours/page.tsx
import Link from 'next/link';
import type { Metadata } from 'next';

import TourCard from '@/features/tours/components/TourCard';
import ToursToolbar from '@/features/tours/components/ToursToolbar';
import {
  filterAndSortTours,
  TAGS as ALL_TAGS,
  CITIES as ALL_CITIES,
  type TourSort,
} from '@/features/tours/data.mock';

type Search = {
  q?: string | string[];
  tag?: string | string[];
  city?: string | string[];
  sort?: 'popular' | 'price-asc' | 'price-desc' | string | string[];
};

export const revalidate = 3600; // 1h (mock). Luego: ISR desde BD.

export const metadata: Metadata = {
  title: 'Tours — KCE',
  description: 'Experiencias únicas curadas por expertos locales',
  alternates: { canonical: '/tours' },
};

// Helpers seguros
function toStr(v: string | string[] | undefined, def = '') {
  return Array.isArray(v) ? (v[0] ?? def) : (v ?? def);
}
function toSort(v: string): TourSort {
  return v === 'price-asc' || v === 'price-desc' ? v : 'popular';
}

export default async function ToursPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = (await searchParams) ?? {};

  const q = toStr(sp.q).trim();
  const tag = toStr(sp.tag).trim();
  const city = toStr(sp.city).trim();
  const sort = toSort(toStr(sp.sort, 'popular').trim());

  // Lógica centralizada del mock
  const items = filterAndSortTours({ q, tag, city, sort });

  // Fuentes de datos centralizadas (evita divergencias)
  const tags = ALL_TAGS;
  const cities = ALL_CITIES;

  // Chips visibles (solo display)
  const qLabel = q ? `Buscar: “${q.toLowerCase()}”` : '';
  const tagLabel = tag ? `Tema: ${tag}` : '';
  const cityLabel = city ? `Ciudad: ${city}` : '';
  const sortLabel =
    sort !== 'popular'
      ? sort === 'price-asc'
        ? 'Precio: bajo → alto'
        : 'Precio: alto → bajo'
      : '';

  const chips = [qLabel, tagLabel, cityLabel, sortLabel].filter(Boolean);

  // SEO: ItemList (limita a 24 resultados)
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://kce.travel';
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.slice(0, 24).map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${base}/tours/${t.slug}`,
      name: t.title,
    })),
  };

  const resultCountId = 'tour-results-count';

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-6">
        <h1 className="font-heading text-3xl text-brand-blue">Explora nuestros tours</h1>
        <p className="mt-2 text-[color:var(--color-text)]/80">
          Cultura, café, naturaleza y más. Elige tu experiencia y reserva en minutos.
        </p>

        {/* Chips / contador */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {chips.length > 0 ? (
            <>
              {chips.map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-[color:var(--color-bg)] px-3 py-1 text-sm text-[color:var(--color-text)]/80"
                >
                  {label}
                </span>
              ))}
              <span
                id={resultCountId}
                className="ml-2 text-sm text-[color:var(--color-text)]/60"
                aria-live="polite"
              >
                {items.length} resultado{items.length === 1 ? '' : 's'}
              </span>
            </>
          ) : (
            <span id={resultCountId} className="text-sm text-[color:var(--color-text)]/60" aria-live="polite">
              {items.length} tours disponibles
            </span>
          )}
        </div>
      </header>

      {/* Toolbar (client) */}
      <section aria-label="Filtros y orden" className="mb-2">
        <ToursToolbar
          initial={{ q, tag, city, sort }}
          tags={tags}
          cities={cities}
          aria-describedby={resultCountId}
        />
      </section>

      {items.length === 0 ? (
        <section
          className="mt-8 rounded-2xl border border-brand-dark/10 bg-[color:var(--color-surface)] p-6 text-[color:var(--color-text)]/80 shadow-soft"
          role="status"
          aria-live="polite"
        >
          <p className="mb-2">No encontramos tours con esos filtros.</p>
          <p>
            Prueba otra palabra clave o{' '}
            <Link href="/tours" className="text-brand-blue underline">
              limpia los filtros
            </Link>
            .
          </p>
        </section>
      ) : (
        <section
          className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
          aria-live="polite"
          aria-busy={false}
          aria-label="Listado de tours"
        >
          {items.map((t, i) => (
            <TourCard key={t.id} tour={t} priority={i < 3} />
          ))}
        </section>
      )}

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
      />
    </main>
  );
}
