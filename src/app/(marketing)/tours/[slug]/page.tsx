// src/app/(marketing)/tours/[slug]/page.tsx
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import BookingWidget from '@/features/tours/components/BookingWidget';
// import ReviewsList from '@/features/reviews/ReviewsList';
import { getTourBySlug, TOURS } from '@/features/tours/data.mock';
import { formatCOP, hoursLabel } from '@/utils/format';

type Params = { slug: string };
type SearchParams = Record<string, string | string[] | undefined>;

export const revalidate = 86400; // 1 día
export const dynamicParams = false; // Sólo generamos los slugs del mock

export function generateStaticParams() {
  return TOURS.map((t) => ({ slug: t.slug }));
}

const pick = (v?: string | string[]) => (Array.isArray(v) ? v[0] ?? '' : v ?? '');

export async function generateMetadata(
  { params }: { params: Promise<Params> },
): Promise<Metadata> {
  const { slug } = await params;
  const tour = getTourBySlug(slug);
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://kce.travel';
  const canonical = `/tours/${slug}`;

  if (!tour) {
    return {
      title: 'Tour — KCE',
      description: 'Tour de KCE',
      alternates: { canonical },
      openGraph: {
        title: 'Tour — KCE',
        description: 'Tour de KCE',
        url: `${base}${canonical}`,
        siteName: 'KCE',
        locale: 'es_CO',
        type: 'website',
        images: [{ url: `${base}${canonical}/opengraph-image` }],
      },
      twitter: { card: 'summary_large_image' },
    };
  }

  const title = `${tour.title} — KCE`;
  const description = tour.short ?? 'Tour KCE';

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: `${base}${canonical}`,
      siteName: 'KCE',
      locale: 'es_CO',
      type: 'website',
      images: [{ url: `${base}${canonical}/opengraph-image` }],
    },
  };
}

export default async function TourDetailPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams?: Promise<SearchParams>;
}) {
  const { slug } = await params;

  const sp: SearchParams = searchParams ? await searchParams : ({} as SearchParams);
  const datePrefill = pick(sp?.date).trim();
  const qtyPrefill = pick(sp?.q).trim();
  // (por ahora son prefills reservados; podemos usarlos luego en el widget)

  const tour = getTourBySlug(slug);
  if (!tour) return notFound();

  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://kce.travel';
  const canonical = `${base}/tours/${slug}`;
  const priceCOP = tour.price;

  const schemaProduct: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: tour.title,
    image: tour.image ? [`${base}${tour.image}`] : [],
    description: tour.short || 'Tour KCE',
    brand: 'Knowing Cultures Enterprise',
    offers: {
      '@type': 'Offer',
      priceCurrency: 'COP',
      price: priceCOP,
      url: canonical,
      availability: 'https://schema.org/InStock',
    },
    ...(typeof tour.rating === 'number' && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: tour.rating.toFixed(1),
        reviewCount: Math.max(5, Math.round(tour.rating * 10)),
      },
    }),
  };

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Tours', item: `${base}/tours` },
      { '@type': 'ListItem', position: 2, name: tour.title, item: canonical },
    ],
  };

  return (
    <>
      {/* BREADCRUMBS accesibles */}
      <nav aria-label="breadcrumb" className="mx-auto max-w-6xl px-6 pt-6">
        <ol className="flex flex-wrap items-center gap-2 text-sm text-[color:var(--color-text)]/70">
          <li>
            <Link href="/tours" className="underline-offset-4 hover:underline">
              Tours
            </Link>
          </li>
          <li aria-hidden>›</li>
          <li aria-current="page" className="text-[color:var(--color-text)]">
            {tour.title}
          </li>
        </ol>
      </nav>

      {/* HERO */}
      <section className="relative mt-2 h-[48vh] w-full overflow-hidden rounded-none md:rounded-2xl">
        <Image
          src={tour.image}
          alt={`Foto del tour: ${tour.title}`}
          fill
          className="object-cover"
          sizes="100vw"
          priority
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/30 to-transparent"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(60rem_28rem_at_10%_110%,rgba(255,195,0,0.18),transparent)]"
        />
        <div className="absolute bottom-6 left-0 right-0 mx-auto max-w-6xl px-6">
          <h1 className="font-heading text-3xl text-white drop-shadow md:text-4xl">
            {tour.title}
          </h1>
          <p className="mt-2 text-white/90">
            {tour.city} • {hoursLabel(tour.durationHours)} • {formatCOP(tour.price)}
          </p>
        </div>
      </section>

      {/* CONTENIDO */}
      <section className="mx-auto grid max-w-6xl gap-8 px-6 py-10 md:grid-cols-[2fr_1fr]">
        <article className="space-y-6">
          <header>
            {typeof tour.rating === 'number' && (
              <div className="inline-flex items-center gap-2 rounded-full bg-[color:var(--color-surface)]/80 px-3 py-1 text-sm shadow-soft ring-1 ring-black/5 backdrop-blur">
                <span aria-label={`Valoración ${tour.rating} de 5`}>
                  ⭐ {tour.rating.toFixed(1)}
                </span>
                <span className="text-[color:var(--color-text)]/60">(KCE)</span>
              </div>
            )}
          </header>

          <section aria-labelledby="included">
            <h2 id="included" className="font-heading text-xl text-brand-blue">
              Qué incluye
            </h2>
            <ul className="mt-2 list-disc pl-5 text-[color:var(--color-text)]/85">
              <li>Guía local experto</li>
              <li>Entradas principales</li>
              <li>Degustaciones o refrescos (según tour)</li>
            </ul>
          </section>

          <section aria-labelledby="about" className="pt-2">
            <h2 id="about" className="font-heading text-xl text-brand-blue">
              Sobre esta experiencia
            </h2>
            <p className="mt-2 text-[color:var(--color-text)]/85">
              {tour.short}{' '}
              Disfrutarás una ruta cuidadosamente diseñada, con horarios claros, recomendaciones
              locales y puntos de encuentro fáciles de seguir. Ideal para viajeros que quieren vivir
              Colombia como un local, con el respaldo de KCE.
            </p>
          </section>

          {/* Reseñas (cuando esté listo el módulo de reviews) */}
          {/* <div className="pt-2">
            <h2 className="font-heading text-xl text-brand-blue">Reseñas</h2>
            <div className="mt-3">
              <ReviewsList tourSlug={tour.slug} />
            </div>
          </div> */}

          <div className="pt-2">
            <Link
              href="/tours"
              className="text-brand-blue underline underline-offset-4 hover:opacity-90"
              aria-label="Volver a la lista de tours"
            >
              ← Volver a tours
            </Link>
          </div>
        </article>

        {/* Sidebar sticky */}
        <div className="md:sticky md:top-20">
          <BookingWidget
            slug={tour.slug}
            title={tour.title}
            short={tour.short}
            price={tour.price}
            // En el futuro podríamos usar datePrefill y qtyPrefill
          />
        </div>
      </section>

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaProduct) }}
      />
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
    </>
  );
}
