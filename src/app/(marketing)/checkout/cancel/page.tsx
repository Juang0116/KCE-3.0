import type { Metadata } from 'next';
import Link from 'next/link';
import { XCircle, RotateCcw } from 'lucide-react';

import OpenChatButton from '@/features/ai/OpenChatButton';
import { TOURS } from '@/features/tours/data.mock';
import { Button } from '@/components/ui/Button';
import { formatCOP, formatISODatePretty } from '@/utils/format';

type SearchParams = Record<string, string | string[] | undefined>;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pago cancelado | KCE',
  description:
    'Tu pago fue cancelado. Vuelve a intentar o contáctanos para finalizar tu reserva con ayuda.',
  robots: { index: false, follow: false },
  alternates: { canonical: '/checkout/cancel' },
};

/* ─────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────── */
const pick = (v?: string | string[]) => (Array.isArray(v) ? v[0] ?? '' : v ?? '');
const safeDecode = (s: string) => {
  try { return decodeURIComponent(s); } catch { return s; }
};

const REASON_COPY: Record<string, string> = {
  expired: 'La sesión de pago expiró.',
  session_expired: 'La sesión de pago expiró.',
  user_canceled: 'Cancelaste el flujo de pago.',
  canceled: 'Cancelaste el flujo de pago.',
  bank_declined: 'El banco rechazó la transacción.',
  insufficient_funds: 'Fondos insuficientes.',
  authentication_required: 'El banco solicitó verificación adicional.',
  popup_blocked: 'El navegador bloqueó la ventana del pago.',
  network: 'Un problema de red impidió finalizar el pago.',
  timeout: 'Se agotó el tiempo del pago.',
};

/* ─────────────────────────────────────────────────────────────
   Page
   ───────────────────────────────────────────────────────────── */
export default async function CancelPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  // Query params
  const tourParamRaw = pick(sp.tour).trim();
  const tourParam = tourParamRaw ? safeDecode(tourParamRaw) : '';
  const dateRaw = pick(sp.date).trim();
  const qtyStr = pick(sp.q).trim();
  const qty = qtyStr ? Math.max(1, Number.parseInt(qtyStr, 10) || 0) : undefined;
  const reasonKey = pick(sp.reason).trim().toLowerCase();

  // Match por slug o por título (case-insensitive)
  const matched =
    TOURS.find((t) => t.slug === tourParam) ||
    TOURS.find((t) => t.title.toLowerCase() === tourParam.toLowerCase());

  // Populares (excluye el coincidente)
  const popular = TOURS.filter((t) => (matched ? t.slug !== matched.slug : true)).slice(0, 3);

  // URL para reintentar (si conocemos el tour)
  const retryHref = (() => {
    if (!matched) return '/tours';
    const u = new URL(`/tours/${matched.slug}`, 'http://local'); // base dummy para qs
    if (dateRaw) u.searchParams.set('date', dateRaw);
    if (typeof qty === 'number' && qty > 0) u.searchParams.set('q', String(qty));
    return `${u.pathname}${u.search || ''}`;
  })();

  const reasonText = reasonKey ? (REASON_COPY[reasonKey] ?? `Se canceló el pago (${reasonKey}).`) : null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      {/* Hero de estado */}
      <header className="text-center">
        <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-600">
          <XCircle className="h-7 w-7" aria-hidden="true" />
        </div>

        <h1 className="font-heading text-3xl text-brand-blue">Pago cancelado</h1>

        <p className="mt-3 text-[color:var(--color-text)]/85">
          {reasonText
            ? <>{reasonText} Puedes intentar nuevamente o escribirnos si necesitas ayuda.</>
            : <>Tu pago fue cancelado. Puedes intentar nuevamente o escribirnos si necesitas ayuda.</>}
        </p>

        {/* Sutileza de confianza */}
        <p className="mt-2 text-xs text-[color:var(--color-text)]/60">
          Si tu banco muestra un cargo “pendiente”, suele liberarse automáticamente en minutos.
        </p>
      </header>

      {(tourParam || dateRaw || qty) && (
        <section
          aria-labelledby="resume"
          className="mx-auto mt-8 max-w-xl rounded-2xl border border-brand-dark/10 bg-[color:var(--color-surface)] p-6 shadow-soft"
        >
          <h2 id="resume" className="font-heading text-lg text-brand-blue">
            Resumen del intento
          </h2>

          <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            {tourParam && (
              <div className="rounded-xl bg-black/5 p-3">
                <dt className="text-[color:var(--color-text)]/60">Tour</dt>
                <dd className="mt-0.5">
                  {matched ? (
                    <Link className="text-brand-blue underline underline-offset-4 hover:opacity-90" href={`/tours/${matched.slug}`}>
                      {matched.title}
                    </Link>
                  ) : (
                    <strong className="text-[color:var(--color-text)]">{tourParam}</strong>
                  )}
                  {matched && (
                    <div className="text-[11px] text-[color:var(--color-text)]/60">Desde {formatCOP(matched.price)}</div>
                  )}
                </dd>
              </div>
            )}

            {dateRaw && (
              <div className="rounded-xl bg-black/5 p-3">
                <dt className="text-[color:var(--color-text)]/60">Fecha</dt>
                <dd className="mt-0.5 font-medium">{formatISODatePretty(dateRaw)}</dd>
              </div>
            )}

            {typeof qty === 'number' && qty > 0 && (
              <div className="rounded-xl bg-black/5 p-3">
                <dt className="text-[color:var(--color-text)]/60">Personas</dt>
                <dd className="mt-0.5 font-medium">{qty}</dd>
              </div>
            )}

            {reasonText && (
              <div className="rounded-xl bg-black/5 p-3">
                <dt className="text-[color:var(--color-text)]/60">Motivo</dt>
                <dd className="mt-0.5">
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700 ring-1 ring-red-200">
                    {reasonText}
                  </span>
                </dd>
              </div>
            )}
          </dl>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button asChild variant="primary" className="px-5 py-2.5">
              <Link href={retryHref} prefetch>
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                {matched ? `Reintentar en “${matched.title}”` : 'Ver todos los tours'}
              </Link>
            </Button>

            <OpenChatButton variant="accent" addQueryParam className="px-5 py-2.5">
              Hablar con IA
            </OpenChatButton>

            <Button asChild variant="outline" className="px-5 py-2.5">
              <a
                href={`mailto:hola@kce.travel?subject=${encodeURIComponent('Ayuda con mi pago')}${
                  matched ? `&body=${encodeURIComponent(`Tour: ${matched.title}\nFecha: ${dateRaw || '—'}\nPersonas: ${qty || '—'}`)}` : ''
                }`}
              >
                Escribir por email
              </a>
            </Button>
          </div>
        </section>
      )}

      {/* Ayuda contextual */}
      <section
        aria-labelledby="help"
        className="mx-auto mt-10 max-w-2xl rounded-2xl border border-brand-dark/10 bg-[color:var(--color-surface)] p-6 shadow-soft"
      >
        <h2 id="help" className="font-heading text-lg text-brand-blue">¿Qué pudo pasar?</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[color:var(--color-text)]/80">
          <li>La entidad bancaria rechazó el pago o solicitó verificación adicional.</li>
          <li>La sesión de pago expiró o el navegador bloqueó la ventana.</li>
          <li>Se cerró la página antes de finalizar la confirmación.</li>
        </ul>
        <p className="mt-3 text-sm text-[color:var(--color-text)]/70">
          Si el cargo apareció en tu banco pero no ves confirmación, normalmente se anula en poco tiempo.
          Si tienes dudas, contáctanos y lo revisamos.
        </p>
      </section>

      {/* Recomendados */}
      <section aria-labelledby="popular" className="mx-auto mt-10 max-w-3xl">
        <h2 id="popular" className="font-heading text-lg text-brand-blue">También te pueden gustar</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {popular.map((t) => (
            <Link
              key={t.id}
              href={`/tours/${t.slug}`}
              className="group rounded-2xl border border-brand-dark/10 bg-[color:var(--color-surface)] p-4 shadow-soft transition hover:shadow-2xl"
              prefetch
            >
              <div className="flex items-center justify-between">
                <p className="font-heading text-brand-blue group-hover:underline">{t.title}</p>
                <span className="text-sm font-heading text-brand-red">{formatCOP(t.price)}</span>
              </div>
              <p className="mt-1 text-sm text-[color:var(--color-text)]/80">{t.short}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Navegación secundaria */}
      <nav className="mt-10 text-center">
        <Link href="/tours" className="text-brand-blue underline">
          ← Volver a los tours
        </Link>
      </nav>
    </main>
  );
}
