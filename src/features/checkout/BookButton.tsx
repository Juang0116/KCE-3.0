// src/features/checkout/BookButton.tsx
'use client';

import * as React from 'react';
import { Button } from '@/components/ui/Button';

type Props = {
  tourSlug: string;
  tourTitle: string;
  defaultDate?: string; // YYYY-MM-DD
};

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function isValidFutureDate(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const d = new Date(`${ymd}T00:00:00`);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return !Number.isNaN(d.getTime()) && d >= t;
}

export default function BookButton({ tourSlug, tourTitle, defaultDate }: Props) {
  const [date, setDate] = React.useState(defaultDate || todayISO());
  const [quantity, setQuantity] = React.useState(1);
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const abortRef = React.useRef<AbortController | null>(null);
  const nameRef = React.useRef<HTMLInputElement | null>(null);
  const emailRef = React.useRef<HTMLInputElement | null>(null);
  const dateRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  function clampQty(n: number) {
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(20, Math.round(n)));
  }

  async function onReserve(e?: React.MouseEvent | React.FormEvent) {
    e?.preventDefault?.();
    setErr(null);

    // Validaciones rápidas en cliente (UX)
    if (!name.trim() || name.trim().length < 2) {
      setErr('Ingresa tu nombre.');
      nameRef.current?.focus();
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErr('Ingresa un correo válido.');
      emailRef.current?.focus();
      return;
    }
    if (!isValidFutureDate(date)) {
      setErr('Selecciona una fecha válida (hoy o futura).');
      dateRef.current?.focus();
      return;
    }

    setLoading(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const locale =
        (typeof navigator !== 'undefined' &&
          (navigator.language || (navigator as any).userLanguage)) ||
        'es-CO';

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        keepalive: true,
        signal: ctrl.signal,
        body: JSON.stringify({
          tour: { slug: tourSlug, title: tourTitle },
          quantity: clampQty(quantity),
          customer: { email: email.trim(), name: name.trim() },
          date,
          currency: 'COP',
          locale,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        throw new Error(
          (data && (data.error as string)) || 'No se pudo iniciar el checkout',
        );
      }
      window.location.assign(data.url as string);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setErr(e?.message || 'Error iniciando el checkout');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onReserve}
      className="rounded-2xl border border-brand-dark/10 bg-[color:var(--color-surface)] p-4 shadow-soft"
      noValidate
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm" htmlFor="book-date">
          <span className="text-[color:var(--color-text)]/70">Fecha</span>
          <input
            id="book-date"
            ref={dateRef}
            type="date"
            min={todayISO()}
            value={date}
            onChange={(e) => setDate(e.currentTarget.value)}
            className="rounded-xl border border-brand-dark/20 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-blue/40"
            required
          />
        </label>

        <label className="flex flex-col gap-1 text-sm" htmlFor="book-qty">
          <span className="text-[color:var(--color-text)]/70">Personas</span>
          <input
            id="book-qty"
            type="number"
            min={1}
            max={20}
            step={1}
            inputMode="numeric"
            pattern="[0-9]*"
            onWheel={(ev) => (ev.currentTarget as HTMLInputElement).blur()}
            value={quantity}
            onChange={(e) => setQuantity(clampQty(Number(e.currentTarget.value || 1)))}
            className="rounded-xl border border-brand-dark/20 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-blue/40"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2" htmlFor="book-name">
          <span className="text-[color:var(--color-text)]/70">Nombre</span>
          <input
            id="book-name"
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="Tu nombre"
            autoComplete="name"
            className="rounded-xl border border-brand-dark/20 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-blue/40"
            required
          />
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2" htmlFor="book-email">
          <span className="text-[color:var(--color-text)]/70">Correo</span>
          <input
            id="book-email"
            ref={emailRef}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            placeholder="tu@correo.com"
            autoComplete="email"
            className="rounded-xl border border-brand-dark/20 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-blue/40"
            required
          />
        </label>
      </div>

      {err && (
        <p
          role="alert"
          aria-live="assertive"
          className="mt-3 rounded-xl border border-brand-red/20 bg-red-50 px-3 py-2 text-sm text-[color:var(--color-text)]"
        >
          {err}
        </p>
      )}

      <Button
        type="submit"
        className="mt-4 w-full"
        isLoading={loading}
        disabled={loading}
        aria-busy={loading || undefined}
      >
        {loading ? 'Creando pago…' : 'Reservar'}
      </Button>

      <p className="mt-2 text-center text-xs text-[color:var(--color-text)]/60">
        Serás llevado a Stripe para completar el pago.
      </p>
    </form>
  );
}
