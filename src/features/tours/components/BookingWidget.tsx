// src/features/tours/components/BookingWidget.tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

type BookingWidgetProps = {
  slug: string;
  title: string;
  short?: string;
  price: number; // COP por persona
};

const BookingWidget: React.FC<BookingWidgetProps> = ({
  slug,
  title,
  short,
  price,
}) => {
  const router = useRouter();

  const [date, setDate] = React.useState('');
  const [qty, setQty] = React.useState<string>('2'); // 👈 ahora string
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Formatter COP reutilizable
  const formatter = React.useMemo(
    () =>
      new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      }),
    [],
  );

  const unitLabel = React.useMemo(
    () => formatter.format(price),
    [formatter, price],
  );

  // Normalizamos la cantidad SOLO para cálculos, no para el input
  const qtyNumber = React.useMemo(() => {
    const n = Number(qty);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }, [qty]);

  const total = React.useMemo(
    () => qtyNumber * price,
    [qtyNumber, price],
  );

  const totalLabel = React.useMemo(
    () => formatter.format(total),
    [formatter, total],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;

    setError(null);
    setPending(true);

    try {
      // Normalizamos definitivamente la cantidad que mandamos al backend
      const quantity = (() => {
        const n = Number(qty);
        return Number.isFinite(n) && n > 0 ? n : 1;
      })();

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tour: { slug, title, short, price },
          quantity,
          customer: { name, email },
          date,
          phone: phone || undefined,
          currency: 'COP',
          locale:
            typeof navigator !== 'undefined'
              ? (navigator.language ||
                  (navigator as any).userLanguage ||
                  'es-CO')
              : 'es-CO',
        }),
      });

      if (!res.ok) {
        let msg = 'No pudimos iniciar el pago. Intenta de nuevo.';
        try {
          const data = await res.json();
          msg = data?.error || msg;
        } catch {
          // ignore
        }
        throw new Error(msg);
      }

      const data = (await res.json()) as { url?: string };
      if (!data.url) throw new Error('Respuesta sin URL de checkout.');

      router.push(data.url);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Error inesperado. Intenta más tarde.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <aside className="rounded-2xl border border-brand-dark/10 bg-[color:var(--color-surface)] p-5 shadow-soft">
      {/* Header precios */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-sm text-[color:var(--color-text)]/70">Desde</div>
          <div className="font-heading text-2xl text-brand-red">{unitLabel}</div>
          <div className="mt-0.5 text-xs text-[color:var(--color-text)]/60">por persona</div>
        </div>

        <div className="text-right" aria-live="polite">
          <div className="text-xs text-[color:var(--color-text)]/60">Total estimado</div>
          <div className="font-heading text-lg text-brand-blue">{totalLabel}</div>
          <div className="mt-0.5 text-[11px] text-[color:var(--color-text)]/60">
            {unitLabel} × {qtyNumber}{' '}
            {qtyNumber === 1 ? 'persona' : 'personas'}
          </div>
        </div>
      </div>

      {/* Formulario */}
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              className="block text-xs font-medium text-[color:var(--color-text)]/70"
              htmlFor="name"
            >
              Nombre completo
            </label>
            <input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-brand-dark/15 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              className="block text-xs font-medium text-[color:var(--color-text)]/70"
              htmlFor="email"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-brand-dark/15 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              className="block text-xs font-medium text-[color:var(--color-text)]/70"
              htmlFor="date"
            >
              Fecha
            </label>
            <input
              id="date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-brand-dark/15 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              className="block text-xs font-medium text-[color:var(--color-text)]/70"
              htmlFor="qty"
            >
              Personas
            </label>
            <input
              id="qty"
              type="number"
              min={1}
              max={20}
              required
              value={qty}
              onChange={(e) => setQty(e.target.value)} // 👈 ya no forzamos número
              className="mt-1 w-full rounded-xl border border-brand-dark/15 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label
            className="block text-xs font-medium text-[color:var(--color-text)]/70"
            htmlFor="phone"
          >
            Teléfono (opcional)
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-xl border border-brand-dark/15 px-3 py-2 text-sm"
            placeholder="+57 ..."
          />
        </div>

        {error && (
          <p className="text-xs text-red-600" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-blue px-4 py-2.5 font-heading text-sm text-white shadow-soft transition hover:opacity-95 disabled:opacity-60"
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Procesando…
            </>
          ) : (
            'Ir al pago seguro'
          )}
        </button>
      </form>

      <p className="mt-2 text-[11px] text-[color:var(--color-text)]/60">
        No se te cobra nada extra por usar nuestra pasarela. Los detalles finales los verás en la
        página de pago.
      </p>
    </aside>
  );
};

export default BookingWidget;
