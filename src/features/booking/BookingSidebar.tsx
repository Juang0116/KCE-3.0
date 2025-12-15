// src/features/booking/BookingSidebar.tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, Loader2 } from 'lucide-react';
import * as React from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/Button';
import OpenChatButton from '@/features/ai/OpenChatButton';
import { formatCOP } from '@/utils/format';

type MiniTour = {
  slug?: string; // ideal para el webhook / tracking
  title: string;
  short?: string;
  price: number; // COP, sin decimales
};

type BookingSidebarProps = {
  tour: MiniTour;
  datePrefill?: string;           // YYYY-MM-DD (de ?date=)
  qtyPrefill?: string | number;   // de ?q=
};

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const Schema = z.object({
  date: z
    .string()
    .min(1, 'Selecciona una fecha')
    .refine((v) => {
      const d = new Date(`${v}T00:00:00`);
      const t = new Date();
      t.setHours(0, 0, 0, 0);
      return !Number.isNaN(d.getTime()) && d >= t;
    }, 'Selecciona una fecha de hoy o futura'),
  people: z
    .number()
    .int('Debe ser entero')
    .min(1, 'Mínimo 1 persona')
    .max(12, 'Para 13+ contáctanos por chat'),
  name: z.string().min(2, 'Tu nombre'),
  email: z.string().email('Email inválido'),
  phone: z
    .string()
    .optional()
    .refine((v) => !v || /^[+\d()\-.\s]{7,}$/.test(v), {
      message: 'Número no válido',
    }),
});

type FormValues = z.infer<typeof Schema>;

export default function BookingSidebar({
  tour,
  datePrefill,
  qtyPrefill,
}: BookingSidebarProps) {
  // Normalizamos prefill de personas
  const initialPeople = React.useMemo(() => {
    const raw =
      typeof qtyPrefill === 'number'
        ? qtyPrefill
        : qtyPrefill
        ? Number.parseInt(qtyPrefill, 10)
        : NaN;
    if (!Number.isFinite(raw) || raw <= 0) return 2;
    return Math.min(12, Math.max(1, raw));
  }, [qtyPrefill]);

  // Normalizamos prefill de fecha (solo aceptamos YYYY-MM-DD válido)
  const initialDate = React.useMemo(() => {
    if (!datePrefill) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePrefill)) return '';
    return datePrefill;
  }, [datePrefill]);

  const {
    register,
    handleSubmit,
    watch,
    setFocus,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      people: initialPeople,
      date: initialDate,
    },
    mode: 'onSubmit',
  });

  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const people = watch('people') ?? initialPeople;
  const total = React.useMemo(
    () => Math.max(1, Number(people) || 1) * tour.price,
    [people, tour.price],
  );

  // Enfoca el primer campo con error tras enviar
  React.useEffect(() => {
    const keys = Object.keys(errors) as (keyof FormValues)[];
    if (keys.length > 0) setFocus(keys[0]!);
  }, [errors, setFocus]);

  // Limpia cualquier request pendiente al desmontar
  React.useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    if (isSubmitting) return; // evita doble submit
    setSubmitError(null);

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
        signal: ctrl.signal,
        body: JSON.stringify({
          tour, // el server resuelve precio/slug de forma autoritativa
          quantity: values.people,
          customer: { email: values.email, name: values.name },
          date: values.date, // YYYY-MM-DD
          phone: values.phone && values.phone.trim() ? values.phone.trim() : undefined,
          currency: 'COP',
          locale, // el endpoint ya lo soporta (mejor UX en Stripe)
        }),
      });

      const data = await res.json().catch(() => ({} as any));
      if (res.ok && data?.url) {
        window.location.assign(data.url as string);
      } else {
        setSubmitError(
          data?.error ||
            'No pudimos iniciar el checkout. Intenta de nuevo o escríbenos por chat.',
        );
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.error(e);
      setSubmitError('Error de red. Verifica tu conexión e intenta nuevamente.');
    }
  };

  const errId = (name: keyof FormValues) =>
    errors[name] ? `${name}-error` : undefined;

  return (
    <aside className="rounded-2xl border border-brand-dark/10 bg-[color:var(--color-surface)] p-5 shadow-soft">
      {/* Header de precios */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-sm text-[color:var(--color-text)]/70">Desde</div>
          <div className="font-heading text-2xl text-brand-red">
            {formatCOP(tour.price)}
          </div>
        </div>
        <div className="text-right" aria-live="polite">
          <div className="text-xs text-[color:var(--color-text)]/60">Total estimado</div>
          <div className="font-heading text-lg text-brand-blue">
            {formatCOP(total)}
          </div>
          <div className="mt-0.5 text-[11px] text-[color:var(--color-text)]/60">
            {formatCOP(tour.price)} x {Math.max(1, Number(people) || 1)}{' '}
            {Number(people) === 1 ? 'persona' : 'personas'}
          </div>
        </div>
      </div>

      {submitError && (
        <div
          id="checkout-error"
          role="alert"
          aria-live="assertive"
          className="mt-3 rounded-xl border border-brand-red/20 bg-red-50 px-3 py-2 text-sm text-[color:var(--color-text)]"
        >
          {submitError}
        </div>
      )}

      <form
        className="mt-4 space-y-3"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        aria-describedby={submitError ? 'checkout-error' : undefined}
      >
        {/* Fecha */}
        <label className="block text-sm text-[color:var(--color-text)]/80" htmlFor="date">
          Fecha
          <input
            id="date"
            type="date"
            min={todayISO()}
            autoComplete="off"
            className="mt-1 w-full rounded-xl border border-brand-dark/15 px-3 py-2"
            aria-invalid={Boolean(errors.date)}
            aria-describedby={errId('date')}
            {...register('date')}
          />
          {errors.date && (
            <span id="date-error" className="text-xs text-brand-red">
              {errors.date.message}
            </span>
          )}
        </label>

        {/* Personas */}
        <label className="block text-sm text-[color:var(--color-text)]/80" htmlFor="people">
          Personas
          <input
            id="people"
            type="number"
            min={1}
            max={12}
            step={1}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()} // evita scroll accidental
            className="mt-1 w-full rounded-xl border border-brand-dark/15 px-3 py-2"
            aria-invalid={Boolean(errors.people)}
            aria-describedby={errId('people')}
            {...register('people', { valueAsNumber: true })}
          />
          {errors.people && (
            <span id="people-error" className="text-xs text-brand-red">
              {errors.people.message}
            </span>
          )}
        </label>

        {/* Nombre / Email */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm text-[color:var(--color-text)]/80" htmlFor="name">
            Nombre
            <input
              id="name"
              type="text"
              autoComplete="name"
              className="mt-1 w-full rounded-xl border border-brand-dark/15 px-3 py-2"
              placeholder="Tu nombre"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errId('name')}
              {...register('name')}
            />
            {errors.name && (
              <span id="name-error" className="text-xs text-brand-red">
                {errors.name.message}
              </span>
            )}
          </label>

          <label className="block text-sm text-[color:var(--color-text)]/80" htmlFor="email">
            Email
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="mt-1 w-full rounded-xl border border-brand-dark/15 px-3 py-2"
              placeholder="tucorreo@email.com"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errId('email')}
              {...register('email')}
            />
            {errors.email && (
              <span id="email-error" className="text-xs text-brand-red">
                {errors.email.message}
              </span>
            )}
          </label>
        </div>

        {/* WhatsApp */}
        <label className="block text-sm text-[color:var(--color-text)]/80" htmlFor="phone">
          WhatsApp (opcional)
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="mt-1 w-full rounded-xl border border-brand-dark/15 px-3 py-2"
            placeholder="+57 300 000 0000"
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={errId('phone')}
            {...register('phone')}
          />
          {errors.phone && (
            <span id="phone-error" className="text-xs text-brand-red">
              {errors.phone.message}
            </span>
          )}
        </label>

        {/* CTA principal */}
        <Button
          type="submit"
          className="w-full"
          disabled={isSubmitting || isSubmitSuccessful}
          aria-busy={isSubmitting || undefined}
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Iniciando pago…
            </span>
          ) : (
            'Confirmar disponibilidad y pagar'
          )}
        </Button>

        {/* CTA secundaria: IA */}
        <OpenChatButton variant="accent" className="w-full" addQueryParam>
          Hablar con nuestra IA
        </OpenChatButton>

        {/* Confianza / Seguridad */}
        <div className="flex items-center justify-center gap-2 pt-2 text-xs text-[color:var(--color-text)]/60">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          <span>Pagos seguros con Stripe • Cancelación flexible según política</span>
        </div>
      </form>
    </aside>
  );
}
