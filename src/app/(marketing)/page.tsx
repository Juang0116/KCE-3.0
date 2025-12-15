// src/app/(marketing)/page.tsx
import Image from 'next/image';
import Link from 'next/link';

import OpenChatButton from '@/features/ai/OpenChatButton';
import TourCard from '@/features/tours/components/TourCard';
import { TOURS } from '@/features/tours/data.mock';
import { Button } from '@/components/ui/Button';

export const revalidate = 3600; // Rebuild cada hora (home es mostly estático)

export default function HomePage() {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://kce.travel').replace(
    /\/+$/,
    '',
  );

  // Destacados (ajusta el orden en data.mock.ts)
  const featured = TOURS.slice(0, 6);

  // JSON-LD (ItemList). Organization/WebSite viven en (marketing)/layout.tsx
  const schemaList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: featured.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${base}/tours/${t.slug}`,
      name: t.title,
    })),
  };

  return (
    <>
      {/* HERO */}
      <section
        aria-labelledby="home-hero-title"
        className="relative h-[70vh] w-full bg-brand-dark/5 md:h-[78vh]"
      >
        <Image
          src="/images/hero-kce.jpg"
          alt="Paisaje colombiano: experiencias auténticas con KCE"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />

        {/* Overlays para legibilidad */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/20"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-brand-beige to-transparent"
        />

        {/* Contenido */}
        <div className="absolute inset-0 mx-auto flex max-w-6xl flex-col justify-center px-6">
          <p className="mb-2 text-sm font-medium text-white/80">
            KCE • Experiencias únicas en Colombia
          </p>

          <h1
            id="home-hero-title"
            className="font-heading text-4xl leading-tight text-white md:text-6xl"
          >
            More than a trip,&nbsp;
            <span className="text-brand-yellow">a cultural awakening.</span>
          </h1>

          <p className="mt-4 max-w-2xl text-white/90">
            Sumérgete en tradiciones vibrantes, paisajes ocultos y personas auténticas. Reserva con
            seguridad y deja que nuestra IA diseñe tu viaje perfecto.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild className="px-5 py-2.5">
              <Link href="/tours" aria-label="Explorar todos los tours de KCE">
                Explorar tours
              </Link>
            </Button>

            {/* Fallback con ?chat=open cuando el widget aún no montó */}
            <OpenChatButton variant="accent" addQueryParam className="px-5 py-2.5">
              Hablar con nuestra IA
            </OpenChatButton>
          </div>
        </div>
      </section>

      {/* DESTACADOS */}
      <section id="experiences" className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-6 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl text-brand-blue">Experiencias destacadas</h2>
            <p className="mt-2 text-[color:var(--color-text)]/80">
              Curadas por expertos locales: café, historia, naturaleza y más.
            </p>
          </div>
          <Button asChild variant="outline" className="hidden px-4 py-2 sm:inline-block">
            <Link href="/tours">Ver todos los tours →</Link>
          </Button>
        </header>

        {featured.length === 0 ? (
          <div className="rounded-2xl border border-brand-dark/10 bg-[color:var(--color-surface)] p-6 text-[color:var(--color-text)]/80">
            Muy pronto verás aquí tus tours destacados.
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((t, idx) => (
              <TourCard key={t.id} tour={t} priority={idx < 3} />
            ))}
          </div>
        )}

        {/* CTA visible en móvil */}
        <div className="mt-8 sm:hidden">
          <Button asChild variant="outline" className="w-full px-4 py-3">
            <Link href="/tours" className="font-heading text-brand-blue">
              Ver todos los tours →
            </Link>
          </Button>
        </div>
      </section>

      {/* POR QUÉ KCE */}
      <section aria-labelledby="why-kce" className="mx-auto max-w-6xl px-6 pb-12">
        <h2 id="why-kce" className="font-heading text-2xl text-brand-blue">
          ¿Por qué viajar con KCE?
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <li className="card p-5">
            <h3 className="font-heading text-brand-blue">Autenticidad local</h3>
            <p className="mt-2 text-sm text-[color:var(--color-text)]/80">
              Experiencias reales con anfitriones locales, lejos del turismo masivo y de los
              recorridos genéricos.
            </p>
          </li>
          <li className="card p-5">
            <h3 className="font-heading text-brand-blue">Seguro y confiable</h3>
            <p className="mt-2 text-sm text-[color:var(--color-text)]/80">
              Operación profesional, pagos protegidos y soporte en EN/ES antes y durante tu viaje.
            </p>
          </li>
          <li className="card p-5">
            <h3 className="font-heading text-brand-blue">IA a tu favor</h3>
            <p className="mt-2 text-sm text-[color:var(--color-text)]/80">
              Itinerarios personalizados y un travel planner inteligente para resolver dudas y
              optimizar tu experiencia.
            </p>
          </li>
        </ul>
      </section>

      {/* CÓMO FUNCIONA */}
      <section
        aria-labelledby="how-it-works"
        className="mx-auto max-w-6xl px-6 pb-12"
      >
        <h2 id="how-it-works" className="font-heading text-2xl text-brand-blue">
          ¿Cómo funciona KCE?
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="card p-5">
            <p className="text-sm font-medium text-brand-yellow">Paso 1</p>
            <h3 className="mt-1 font-heading text-brand-blue">Cuéntanos sobre tu viaje</h3>
            <p className="mt-2 text-sm text-[color:var(--color-text)]/80">
              Fechas, ciudades que te interesan, presupuesto y tipo de experiencia que buscas.
            </p>
          </div>
          <div className="card p-5">
            <p className="text-sm font-medium text-brand-yellow">Paso 2</p>
            <h3 className="mt-1 font-heading text-brand-blue">Recibe un plan diseñado a tu medida</h3>
            <p className="mt-2 text-sm text-[color:var(--color-text)]/80">
              Combinamos conocimiento local e IA para proponerte tours, alojamientos y rutas
              adaptadas a ti.
            </p>
          </div>
          <div className="card p-5">
            <p className="text-sm font-medium text-brand-yellow">Paso 3</p>
            <h3 className="mt-1 font-heading text-brand-blue">Reserva con confianza</h3>
            <p className="mt-2 text-sm text-[color:var(--color-text)]/80">
              Paga de forma segura y recibe confirmaciones claras con todo lo que necesitas para tu
              viaje.
            </p>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section
        aria-labelledby="home-final-cta"
        className="border-t border-brand-dark/10 bg-[color:var(--color-bg)]/60"
      >
        <div className="mx-auto max-w-6xl px-6 py-12 text-center">
          <h2
            id="home-final-cta"
            className="font-heading text-2xl text-brand-blue md:text-3xl"
          >
            ¿Listo para vivir Colombia como un local?
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-[color:var(--color-text)]/80 md:text-base">
            Cuéntanos tu idea de viaje y en menos de 24 horas tendrás una propuesta personalizada.
            Tú decides si reservas con KCE o solo te inspiras con nuestro plan.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild className="px-5 py-2.5">
              <Link href="/tours">Explorar tours disponibles</Link>
            </Button>
            <OpenChatButton variant="outline" addQueryParam className="px-5 py-2.5">
              Empezar con el Travel Planner IA
            </OpenChatButton>
          </div>
        </div>
      </section>

      {/* JSON-LD (solo ItemList aquí) */}
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaList) }}
      />
    </>
  );
}
