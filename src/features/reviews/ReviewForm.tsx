// src/features/reviews/ReviewForm.tsx
'use client';

import * as React from 'react';
import { z } from 'zod';
import { Loader2, Star } from 'lucide-react';
import { Button } from '@/components/ui/Button';

const MAX_COMMENT_LEN = 800;
const COOLDOWN_MS = 30_000; // 30s entre envíos
const STORAGE_LAST_TS = 'kce:lastReviewSubmittedAt';

// Validación en cliente (refuerzo; el backend valida de nuevo)
const Schema = z.object({
  rating: z.coerce.number().int().min(1, 'Calificación requerida').max(5, 'Máx 5'),
  comment: z
    .string()
    .trim()
    .min(10, 'Cuéntanos un poco más (mín 10 caracteres).')
    .max(MAX_COMMENT_LEN, `Máximo ${MAX_COMMENT_LEN} caracteres.`)
    .refine((v) => !/(https?:\/\/|www\.)/i.test(v), { message: 'No incluyas enlaces.' })
    .refine((v) => !/@\w+/.test(v), { message: 'No incluyas correos o @usuario.' }),
  name: z.string().trim().min(2, 'Tu nombre'),
  email: z
    .string()
    .trim()
    .email('Email inválido')
    .optional()
    .or(z.literal('')),
  // Honeypot real (debe ir vacío)
  honeypot: z.string().optional().refine((v) => !v, { message: 'Spam detectado' }),
});

type Props = { tourSlug: string };
type Msg = { type: 'ok' | 'error'; text: string };

export default function ReviewForm({ tourSlug }: Props) {
  const [pending, setPending] = React.useState(false);
  const [rating, setRating] = React.useState<number>(5);
  const [hoverRating, setHoverRating] = React.useState<number | null>(null);

  // campo controlado → mejor UX y contador en vivo
  const [comment, setComment] = React.useState('');
  const [chars, setChars] = React.useState(0);

  const [msg, setMsg] = React.useState<Msg | null>(null);
  const [isOnline, setIsOnline] = React.useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  const formRef = React.useRef<HTMLFormElement>(null);
  const commentRef = React.useRef<HTMLTextAreaElement>(null);
  const nameRef = React.useRef<HTMLInputElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  // ⏱️ time-trap: timestamp de cuando se montó el form
  const startedAtRef = React.useRef<number>(Date.now());

  const currentRating = hoverRating ?? rating;

  React.useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      abortRef.current?.abort();
    };
  }, []);

  const liveCommentError = React.useMemo(() => {
    const v = comment.trim();
    if (!v) return null;
    if (/(https?:\/\/|www\.)/i.test(v)) return 'No incluyas enlaces.';
    if (/@\w+/.test(v)) return 'No incluyas correos o @usuario.';
    if (v.length < 10) return 'Mínimo 10 caracteres.';
    if (v.length > MAX_COMMENT_LEN) return `Máximo ${MAX_COMMENT_LEN} caracteres.`;
    return null;
  }, [comment]);

  const onStarsKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (pending) return;
    if (e.key >= '1' && e.key <= '5') setRating(Number(e.key));
    else if (e.key === 'ArrowRight') setRating((r) => Math.min(5, r + 1));
    else if (e.key === 'ArrowLeft') setRating((r) => Math.max(1, r - 1));
  };

  function getErrMsg(err: unknown) {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    try {
      return JSON.stringify(err);
    } catch {
      return 'Error desconocido';
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);

    // Cooldown simple (cliente)
    const last = Number(localStorage.getItem(STORAGE_LAST_TS) || 0);
    const since = Date.now() - last;
    if (since < COOLDOWN_MS) {
      const left = Math.ceil((COOLDOWN_MS - since) / 1000);
      setMsg({ type: 'error', text: `Por favor espera ${left}s antes de enviar otra reseña.` });
      return;
    }

    // Recolecta datos del form
    const fd = new FormData(e.currentTarget);
    fd.set('rating', String(rating)); // rating desde estado
    // usa el valor controlado (comentario)
    fd.set('comment', comment);

    const data = {
      rating: fd.get('rating'),
      comment: fd.get('comment'),
      name: fd.get('name'),
      email: fd.get('email'),
      honeypot: fd.get('honeypot'), // debe ir vacío
    };

    // Validación en cliente (mensaje rápido)
    const parsed = Schema.safeParse(data);
    if (!parsed.success) {
      setMsg({ type: 'error', text: parsed.error.issues[0]?.message || 'Datos inválidos' });
      // Foco heurístico
      const field = parsed.error.issues[0]?.path?.[0];
      if (field === 'comment') commentRef.current?.focus();
      if (field === 'name') nameRef.current?.focus();
      return;
    }

    setPending(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const resp = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          tour_slug: tourSlug,
          rating: parsed.data.rating,
          comment: parsed.data.comment,
          name: parsed.data.name,
          email: parsed.data.email || undefined,
          honeypot: parsed.data.honeypot || '', // humano → vacío
          startedAt: startedAtRef.current, // ⏱️ time-trap para el backend
        }),
      });

      const json = (await resp.json().catch(() => ({}))) as { error?: string; ok?: boolean };
      if (!resp.ok || json?.error) {
        throw new Error(json?.error || 'No pudimos enviar tu reseña');
      }

      localStorage.setItem(STORAGE_LAST_TS, String(Date.now()));
      setMsg({ type: 'ok', text: '¡Gracias! La verás publicada tras una verificación rápida.' });
      formRef.current?.reset();
      setComment('');
      setChars(0);
      setRating(5);
      startedAtRef.current = Date.now(); // reinicia time-trap
    } catch (err) {
      if ((err as any)?.name === 'AbortError') return;
      setMsg({ type: 'error', text: getErrMsg(err) });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="space-y-4 rounded-2xl border border-brand-dark/10 bg-[color:var(--color-surface)] p-4 shadow-soft"
      noValidate
      data-component="review-form"
    >
      <h3 className="font-heading text-lg text-brand-blue">Deja tu reseña</h3>

      {!isOnline && (
        <p role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Estás sin conexión. Puedes escribir tu reseña y enviarla cuando vuelvas a estar online.
        </p>
      )}

      {/* Calificación */}
      <fieldset className="space-y-1" data-rating={currentRating}>
        <legend className="block text-sm text-[color:var(--color-text)]/80">Calificación</legend>
        <div
          className="flex items-center gap-1"
          role="radiogroup"
          aria-label="Calificación"
          tabIndex={0}
          onKeyDown={onStarsKeyDown}
        >
          {[1, 2, 3, 4, 5].map((n) => {
            const active = currentRating >= n;
            return (
              <label
                key={n}
                className="cursor-pointer"
                aria-label={`${n} estrella${n > 1 ? 's' : ''}`}
                onMouseEnter={() => setHoverRating(n)}
                onMouseLeave={() => setHoverRating(null)}
                title={`${n} estrella${n > 1 ? 's' : ''}`}
              >
                <input
                  className="sr-only"
                  type="radio"
                  name="rating"
                  value={n}
                  checked={rating === n}
                  onChange={() => setRating(n)}
                  disabled={pending}
                />
                <Star
                  className={`h-6 w-6 transition ${
                    active ? 'fill-brand-yellow text-brand-yellow' : 'text-[color:var(--color-text)]/20'
                  }`}
                  aria-hidden
                />
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Comentario */}
      <div>
        <label className="block text-sm text-[color:var(--color-text)]/80" htmlFor="comment">
          Comentario
        </label>
        <textarea
          id="comment"
          name="comment"
          ref={commentRef}
          rows={4}
          maxLength={MAX_COMMENT_LEN}
          value={comment}
          onChange={(e) => {
            const v = e.currentTarget.value;
            setComment(v);
            setChars(v.length);
          }}
          placeholder="¿Qué fue lo que más te gustó? ¿Algo por mejorar?"
          className="mt-1 w-full rounded-2xl border border-brand-dark/15 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-blue/30"
          disabled={pending}
          aria-describedby="comment-help"
          aria-invalid={liveCommentError ? true : undefined}
        />
        <div
          id="comment-help"
          className="mt-1 flex items-center justify-between text-xs text-[color:var(--color-text)]/60"
        >
          <span>
            Mínimo 10 caracteres. Máximo {MAX_COMMENT_LEN}.
            {liveCommentError && (
              <strong className="ml-2 text-brand-red">{liveCommentError}</strong>
            )}
          </span>
          <span aria-live="polite">
            {chars}/{MAX_COMMENT_LEN}
          </span>
        </div>
      </div>

      {/* Nombre / Email */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm text-[color:var(--color-text)]/80" htmlFor="name">
          Nombre
          <input
            id="name"
            name="name"
            ref={nameRef}
            placeholder="Tu nombre"
            className="mt-1 w-full rounded-2xl border border-brand-dark/15 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-blue/30"
            disabled={pending}
            autoComplete="name"
            required
          />
        </label>
        <label className="block text-sm text-[color:var(--color-text)]/80" htmlFor="email">
          Email (opcional)
          <input
            id="email"
            name="email"
            type="email"
            placeholder="tucorreo@email.com"
            className="mt-1 w-full rounded-2xl border border-brand-dark/15 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-blue/30"
            disabled={pending}
            autoComplete="email"
          />
        </label>
      </div>

      {/* Honeypot real (debe mantenerse vacío) */}
      <div className="hidden" aria-hidden>
        <label>
          Deja este campo vacío
          <input name="honeypot" autoComplete="off" tabIndex={-1} />
        </label>
      </div>

      <p className="text-xs text-[color:var(--color-text)]/60">
        Tu reseña pasará por una verificación rápida para proteger a la comunidad.
      </p>

      {/* Acciones + estado */}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Enviando…
            </span>
          ) : (
            'Enviar reseña'
          )}
        </Button>

        <div className="min-h-[1.25rem]" aria-live="polite" role="status">
          {msg?.type === 'ok' && <span className="text-sm text-green-700">{msg.text}</span>}
          {msg?.type === 'error' && <span className="text-sm text-brand-red">{msg.text}</span>}
        </div>
      </div>
    </form>
  );
}
