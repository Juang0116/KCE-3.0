// src/app/(marketing)/checkout/success/page.tsx
import type { Metadata } from 'next';
import type Stripe from 'stripe';
import Link from 'next/link';
import Image from 'next/image';
import { CheckCircle2, CalendarDays, Users, TicketCheck, ExternalLink } from 'lucide-react';

import OpenChatButton from '@/features/ai/OpenChatButton';
import { TOURS } from '@/features/tours/data.mock';
import { Button } from '@/components/ui/Button';
import { formatCOP, formatISODatePretty } from '@/utils/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

export const metadata: Metadata = {
  title: 'Pago confirmado | KCE',
  description: '¡Gracias por tu reserva! Te enviamos confirmación al correo.',
  robots: { index: false, follow: false },
  alternates: { canonical: '/checkout/success' },
};

const ZERO_DECIMAL = new Set([
  'bif','clp','djf','gnf','jpy','kmf','krw','mga','pyg','rwf','ugx','vnd','vuv','xaf','xof','xpf',
]);

function formatStripeAmount(amountInMinor: number, currency: string) {
  const c = currency.toLowerCase();
  const value = ZERO_DECIMAL.has(c) ? amountInMinor : amountInMinor / 100;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(value);
}

function qrSrc(data: string, size = 200) {
  return `https://chart.googleapis.com/chart?cht=qr&chs=${size}x${size}&chl=${encodeURIComponent(data)}`;
}

const pick = (v?: string | string[]) => (Array.isArray(v) ? v[0] ?? '' : v ?? '');

function isStripePlaceholderSession(id?: string) {
  const v = (id || '').trim();
  return !v || v === '{CHECKOUT_SESSION_ID}' || /^\{.+\}$/.test(v);
}

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  // Params seguros
  const session_id = pick(sp.session_id).trim();
  const mock = pick(sp.mock).trim();
  const tourParamRaw = pick(sp.tour).trim();
  const qParam = pick(sp.q).trim();
  const dateParam = pick(sp.date).trim();

  // 👉 ayudante para el form
  const isPlaceholder = isStripePlaceholderSession(session_id);
  const sessionForForm = isPlaceholder ? '' : session_id;

  let amount_total: number | undefined;
  let currency: string | undefined;
  let receipt_url: string | undefined;
  let customer_email: string | undefined;

  let people = qParam ? Number(qParam) : undefined;
  let dateISO = dateParam || undefined;

  let matchedTour:
    | { slug: string; title: string; price: number; short?: string }
    | undefined;

  // Resolver tour por slug o título
  if (tourParamRaw) {
    const t =
      TOURS.find((x) => x.slug === tourParamRaw) ||
      TOURS.find((x) => x.title.toLowerCase() === tourParamRaw.toLowerCase());
    if (t) matchedTour = { slug: t.slug, title: t.title, price: t.price, short: t.short };
  }

  // Stripe: solo si hay clave y session_id válido (no placeholder)
  const canHitStripe =
    Boolean(process.env.STRIPE_SECRET_KEY) && !isStripePlaceholderSession(session_id);

  if (canHitStripe) {
    try {
      const { getStripe } = await import('@/lib/stripe');
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(session_id, {
        expand: ['payment_intent', 'payment_intent.charges.data'],
      });

      amount_total = session.amount_total ?? undefined;
      currency = session.currency ?? undefined;
      customer_email = session.customer_details?.email || session.customer_email || undefined;

      const pi = session.payment_intent as
        | (Stripe.PaymentIntent & { charges?: { data: Stripe.Charge[] } })
        | null;
      const charge = pi?.charges?.data?.[0];
      receipt_url = charge?.receipt_url ?? undefined;

      const md = (session.metadata || {}) as Record<string, string | undefined>;
      if (!people && md.quantity) {
        const n = Number(md.quantity);
        if (!Number.isNaN(n) && n > 0) people = n;
      }
      if (!dateISO && md.date) dateISO = md.date;
      if (!matchedTour && md.tour_title) {
        const t2 = TOURS.find((x) => x.title.toLowerCase() === md.tour_title!.toLowerCase());
        if (t2) matchedTour = { slug: t2.slug, title: t2.title, price: t2.price, short: t2.short };
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (e == null ? '(no error object)' : String(e));
      // eslint-disable-next-line no-console
      console.error('[success] Stripe read error:', msg);
    }
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      '[success] Skipping Stripe read:',
      !process.env.STRIPE_SECRET_KEY
        ? 'STRIPE_SECRET_KEY missing'
        : `invalid/placeholder session_id="${session_id || '(empty)'}"`,
    );
  }

  const popular = TOURS.slice(0, 3);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      {/* Hero de confirmación */}
      <section
        className="rounded-2xl border border-black/5 bg-gradient-to-br from-brand-blue/10 to-brand-yellow/10 p-6 shadow-soft"
        aria-labelledby="success-title"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--color-surface)] ring-2 ring-brand-blue/30">
            <CheckCircle2 className="h-7 w-7 text-green-600" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <h1 id="success-title" className="font-heading text-2xl text-brand-blue">
              ¡Pago confirmado!
            </h1>
            <p className="mt-1 text-sm text-[color:var(--color-text)]/80">
              {mock
                ? 'Pedido simulado (modo desarrollo).'
                : isStripePlaceholderSession(session_id)
                ? 'Confirmación generada. Si no ves el detalle del cobro, refresca o revisa tu correo.'
                : 'Gracias por tu reserva. Te enviamos la confirmación por correo.'}
            </p>

            {customer_email && (
              <p className="mt-1 text-sm text-[color:var(--color-text)]/70">
                Enviado a: <strong>{customer_email}</strong>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Contenido principal */}
      <section className="mt-8 grid gap-6 md:grid-cols-5">
        {/* Columna izquierda (resumen + acciones) */}
        <div className="md:col-span-3">
          <div className="rounded-2xl border border-black/5 bg-[color:var(--color-surface)] p-6 shadow-soft">
            <h2 className="font-heading text-lg text-brand-blue">Resumen de tu reserva</h2>

            <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Tour */}
              {(matchedTour || tourParamRaw) && (
                <div className="rounded-xl border border-brand-dark/10 bg-[color:var(--color-bg)] p-4">
                  <dt className="flex items-center gap-2 text-sm font-medium text-[color:var(--color-text)]/70">
                    <TicketCheck className="h-4 w-4 text-brand-blue" aria-hidden="true" />
                    Tour
                  </dt>
                  <dd className="mt-1">
                    {matchedTour ? (
                      <Link
                        href={`/tours/${matchedTour.slug}`}
                        className="text-base font-heading text-brand-blue underline-offset-4 hover:underline"
                      >
                        {matchedTour.title}
                      </Link>
                    ) : (
                      <span className="text-base font-heading text-[color:var(--color-text)]">{tourParamRaw}</span>
                    )}
                    {typeof matchedTour?.price === 'number' && (
                      <div className="text-sm text-[color:var(--color-text)]/60">Desde {formatCOP(matchedTour.price)}</div>
                    )}
                  </dd>
                </div>
              )}

              {/* Fecha */}
              {dateISO && (
                <div className="rounded-xl border border-brand-dark/10 bg-[color:var(--color-bg)] p-4">
                  <dt className="flex items-center gap-2 text-sm font-medium text-[color:var(--color-text)]/70">
                    <CalendarDays className="h-4 w-4 text-brand-blue" aria-hidden="true" />
                    Fecha
                  </dt>
                  <dd className="mt-1 text-base font-heading text-[color:var(--color-text)]">
                    {formatISODatePretty(dateISO)}
                  </dd>
                </div>
              )}

              {/* Personas */}
              {typeof people === 'number' && people > 0 && (
                <div className="rounded-xl border border-brand-dark/10 bg-[color:var(--color-bg)] p-4">
                  <dt className="flex items-center gap-2 text-sm font-medium text-[color:var(--color-text)]/70">
                    <Users className="h-4 w-4 text-brand-blue" aria-hidden="true" />
                    Personas
                  </dt>
                  <dd className="mt-1 text-base font-heading text-[color:var(--color-text)]">{people}</dd>
                </div>
              )}

              {/* Monto */}
              {amount_total != null && currency && (
                <div className="rounded-xl border border-brand-dark/10 bg-[color:var(--color-bg)] p-4">
                  <dt className="flex items-center gap-2 text-sm font-medium text-[color:var(--color-text)]/70">
                    <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
                    Monto
                  </dt>
                  <dd className="mt-1 text-base font-heading text-[color:var(--color-text)]">
                    {formatStripeAmount(amount_total, currency)}
                  </dd>
                </div>
              )}
            </dl>

            {/* Acciones */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/tours" className="text-brand-blue underline">
                ← Ver más tours
              </Link>

              {matchedTour && (
                <Button asChild className="px-4 py-2">
                  <Link href={`/tours/${matchedTour.slug}`}>Ver detalles del tour</Link>
                </Button>
              )}

              <OpenChatButton variant="accent" addQueryParam className="px-4 py-2">
                ¿Dudas? Habla con IA
              </OpenChatButton>

              {/* Reenviar confirmación por email (sin pedir correo) */}
              {sessionForForm ? (
                <form action="/api/email/booking-confirmation" method="post" className="inline-flex items-center gap-2 flex-wrap">
                  <input type="hidden" name="session_id" value={sessionForForm} />
                  <input type="hidden" name="tour" value={matchedTour?.title || tourParamRaw || ''} />
                  <input type="hidden" name="date" value={dateISO || ''} />
                  <input
                    type="hidden"
                    name="people"
                    value={typeof people === 'number' ? String(people) : ''}
                  />
                  {/* 👇 no pedimos email; el API lo toma de Stripe */}
                  <Button type="submit" variant="secondary" className="px-4 py-2">
                    Enviar confirmación por email
                  </Button>
                </form>
              ) : (
                <p className="text-xs text-[color:var(--color-text)]/60">
                  No podemos reenviar el correo porque falta un ID de pago válido en la URL.
                </p>
              )}
            </div>
          </div>

          {/* Próximos pasos */}
          <section
            aria-labelledby="next"
            className="mt-6 rounded-2xl border border-black/5 bg-[color:var(--color-surface)] p-6 shadow-soft"
          >
            <h2 id="next" className="font-heading text-lg text-brand-blue">
              Próximos pasos
            </h2>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-[color:var(--color-text)]/80">
              <li>Revisa tu correo: te enviamos confirmación con los detalles.</li>
              <li>¿Cambios de fecha o personas? Escríbenos por el chat o correo.</li>
              <li>Llega 10–15 minutos antes al punto de encuentro indicado en el email.</li>
            </ol>
          </section>
        </div>

        {/* Columna derecha (recibo / QR + recomendados) */}
        <aside className="md:col-span-2 space-y-6">
          {/* Recibo */}
          {receipt_url && (
            <div className="rounded-2xl border border-black/5 bg-[color:var(--color-surface)] p-6 text-center shadow-soft">
              <h3 className="font-heading text-base text-brand-blue">Recibo del pago</h3>
              <div className="mt-4 flex flex-col items-center justify-center gap-3">
                <Image
                  src={qrSrc(receipt_url, 200)}
                  alt="QR del recibo"
                  width={200}
                  height={200}
                  className="rounded-xl border border-brand-dark/10"
                  priority
                />
                <Button asChild variant="outline" className="w-full">
                  <a href={receipt_url} target="_blank" rel="noopener noreferrer">
                    Ver / Descargar recibo <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
          )}

          {/* Recomendados */}
          <div className="rounded-2xl border border-black/5 bg-[color:var(--color-surface)] p-6 shadow-soft">
            <h3 className="font-heading text-base text-brand-blue">También te pueden gustar</h3>
            <div className="mt-4 grid gap-3">
              {TOURS.slice(0, 3).map((t) => (
                <Link
                  key={t.id}
                  href={`/tours/${t.slug}`}
                  className="group rounded-xl border border-brand-dark/10 bg-[color:var(--color-bg)] p-4 transition hover:shadow-2xl"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-heading text-brand-blue">{t.title}</p>
                    <span className="text-sm font-heading text-brand-red">{formatCOP(t.price)}</span>
                  </div>
                  <p className="mt-1 text-sm text-[color:var(--color-text)]/80">{t.short}</p>
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
