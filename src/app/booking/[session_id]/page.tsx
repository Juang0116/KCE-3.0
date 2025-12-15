// src/app/booking/[session_id]/page.tsx
import 'server-only';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type Stripe from 'stripe';

import { getStripe } from '@/lib/stripe';
import { SITE_URL } from '@/lib/env';
import { Button } from '@/components/ui/Button';
import { formatISODatePretty } from '@/utils/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ───────── Utils ───────── */
const ZERO_DECIMAL = new Set([
  'bif','clp','djf','gnf','jpy','kmf','krw','mga','pyg','rwf','ugx','vnd','vuv','xaf','xof','xpf',
]);

function money(minor: number | null | undefined, currency = 'USD', locale = 'es-CO') {
  if (minor == null) return '';
  const zero = ZERO_DECIMAL.has(currency.toLowerCase());
  const value = zero ? minor : minor / 100;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(value);
}

// Evita pegarle a Stripe con placeholders
function isStripePlaceholderSession(id?: string | null) {
  const v = String(id || '').trim();
  return !v || v === '{CHECKOUT_SESSION_ID}' || /^\{.+\}$/.test(v);
}

type PageProps = { params: Promise<{ session_id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { session_id } = await params; // Next 15: params es Promise
  return {
    title: 'Tu reserva | KCE',
    robots: { index: false, follow: false },
    alternates: { canonical: `/booking/${session_id}` },
  };
}

export default async function BookingPage({ params }: PageProps) {
  const { session_id } = await params;
  const sessionId = session_id?.trim();

  if (!sessionId || isStripePlaceholderSession(sessionId)) notFound();

  // Sin clave → página informativa en vez de 500
  if (!process.env.STRIPE_SECRET_KEY) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-2xl bg-[color:var(--color-surface)] p-8 shadow-soft">
          <h1 className="font-heading text-2xl text-brand-blue">Reserva</h1>
          <p className="mt-2 text-[color:var(--color-text)]/80">
            ID: <code className="rounded bg-black/5 px-1 py-0.5">{sessionId}</code>
          </p>
          <p className="mt-4">
            Configura <code>STRIPE_SECRET_KEY</code> para ver los detalles de tu pago.
          </p>
          <Link href="/" className="mt-6 inline-block text-brand-blue underline">
            ← Volver al inicio
          </Link>
        </div>
      </main>
    );
  }

  // Recuperar sesión Stripe + recibo
  const stripe = getStripe();
  let session: Stripe.Checkout.Session | null = null;

  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent', 'payment_intent.charges.data'],
    });
  } catch {
    notFound();
  }
  if (!session) notFound();

  const md = (session.metadata || {}) as Record<string, string | undefined>;

  const tourTitle = md.tour_title || 'Tour KCE';
  const dateISO = md.date || '';
  const datePretty = dateISO ? formatISODatePretty(dateISO) : '';
  const qty = Number(md.quantity || 1) || 1;
  const amountFmt = money(session.amount_total ?? null, session.currency || 'usd');
  const status = (session.payment_status || 'unpaid') as Stripe.Checkout.Session.PaymentStatus;

  // URL de recibo (si Stripe ya lo generó)
  const pi = session.payment_intent as
    | (Stripe.PaymentIntent & { charges?: { data: Stripe.Charge[] } })
    | null;
  const receiptUrl = pi?.charges?.data?.[0]?.receipt_url || '';

  const baseUrl = (SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(
    /\/+$/,
    '',
  );
  const invoiceUrl = `/api/invoice/${encodeURIComponent(session.id)}`;
  const resendUrl = '/api/email/booking-confirmation';

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="rounded-2xl border border-brand-dark/10 bg-[color:var(--color-surface)] p-8 shadow-soft">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl text-brand-blue">Tu reserva</h1>
            <p className="mt-1 text-sm text-[color:var(--color-text)]/70">
              ID:{' '}
              <code className="rounded bg-black/5 px-1 py-0.5">
                {session.id}
              </code>
            </p>
          </div>
          <Image
            src="/logo.png"
            alt="KCE"
            width={48}
            height={48}
            className="h-10 w-10 rounded-lg object-contain"
            priority
          />
        </div>

        {/* Estado de pago */}
        <div className="mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm ring-1 ring-black/5">
          <span
            className={
              status === 'paid'
                ? 'h-2 w-2 rounded-full bg-green-500'
                : status === 'unpaid' || status === 'no_payment_required'
                ? 'h-2 w-2 rounded-full bg-yellow-500'
                : 'h-2 w-2 rounded-full bg-orange-500'
            }
            aria-hidden
          />
          <span className="text-[color:var(--color-text)]/80">
            {status === 'paid' ? 'Pago confirmado' : status === 'unpaid' ? 'Pago pendiente' : status}
          </span>
        </div>

        {/* Detalle */}
        <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-black/5 p-4">
            <dt className="text-xs uppercase tracking-wide text-[color:var(--color-text)]/60">Tour</dt>
            <dd className="mt-1 font-heading text-[color:var(--color-text)]">{tourTitle}</dd>
          </div>
          <div className="rounded-xl bg-black/5 p-4">
            <dt className="text-xs uppercase tracking-wide text-[color:var(--color-text)]/60">Fecha</dt>
            <dd className="mt-1 text-[color:var(--color-text)]">{datePretty || dateISO || '—'}</dd>
          </div>
          <div className="rounded-xl bg-black/5 p-4">
            <dt className="text-xs uppercase tracking-wide text-[color:var(--color-text)]/60">Personas</dt>
            <dd className="mt-1 text-[color:var(--color-text)]">{qty}</dd>
          </div>
          <div className="rounded-xl bg-black/5 p-4">
            <dt className="text-xs uppercase tracking-wide text-[color:var(--color-text)]/60">Monto</dt>
            <dd className="mt-1 font-heading text-[color:var(--color-text)]">{amountFmt || '—'}</dd>
          </div>
        </dl>

        {/* Acciones */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild className="px-4 py-2">
            <a href={invoiceUrl} target="_blank" rel="noopener noreferrer">
              Ver factura (PDF)
            </a>
          </Button>

          {/* Forzamos descarga si el usuario lo prefiere */}
          <Button asChild variant="outline" className="px-4 py-2">
            <a href={`${invoiceUrl}?download=1`} target="_blank" rel="noopener noreferrer">
              Descargar factura
            </a>
          </Button>

          {/* Reenviar email SIN pedir correo (el API lo deduce por session_id si falta) */}
          <form action={resendUrl} method="post" className="inline-flex">
            <input type="hidden" name="session_id" value={session.id} />
            <input type="hidden" name="tour" value={tourTitle} />
            <input type="hidden" name="date" value={dateISO} />
            <input type="hidden" name="people" value={String(qty)} />
            {/* Si Stripe ya trae el email lo pasamos; si no, el endpoint lo infiere */}
            <input
              type="hidden"
              name="email"
              value={session.customer_details?.email || session.customer_email || ''}
            />
            <Button type="submit" variant="secondary" className="px-4 py-2">
              Reenviar por email
            </Button>
          </form>

          {/* Recibo Stripe (opcional) */}
          {receiptUrl && (
            <Button asChild variant="ghost" className="px-4 py-2">
              <a href={receiptUrl} target="_blank" rel="noopener noreferrer">
                Ver recibo Stripe
              </a>
            </Button>
          )}

          <Link href="/tours" className="text-brand-blue underline">
            ← Ver más tours
          </Link>
        </div>

        {/* Enlace directo para compartir */}
        <p className="mt-6 text-sm text-[color:var(--color-text)]/70">
          Enlace directo:{' '}
          <a className="underline" href={`${baseUrl}/booking/${session.id}`}>
            {baseUrl}/booking/{session.id}
          </a>
        </p>
      </div>
    </main>
  );
}
