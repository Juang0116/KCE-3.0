// src/features/reviews/ReviewsList.tsx
import { unstable_noStore as noStore } from 'next/cache';
import { getSupabase } from '@/lib/supabase';

type Props = {
  tourSlug: string;
  /** Máximo de reseñas a mostrar (por defecto 20). */
  limit?: number;
};

type ReviewRow = {
  id: string;
  rating: number;
  comment: string;
  created_at: string;
};

type QueryResult = {
  data: ReviewRow[] | null;
  error: { message?: string } | string | null;
};

/* ─────────────────────────────────────────────────────────────
   Utilidades
   ───────────────────────────────────────────────────────────── */

function clampStars(value: number) {
  return Math.max(1, Math.min(5, Math.round(value)));
}

function Stars({ value }: { value: number }) {
  const v = clampStars(value);
  return (
    <span
      aria-label={`${v} de 5 estrellas`}
      role="img"
      className="font-medium tracking-tight text-brand-yellow"
    >
      {'★'.repeat(v)}
      <span className="text-[color:var(--color-text)]/20">{'★'.repeat(5 - v)}</span>
    </span>
  );
}

const DTF = new Intl.DateTimeFormat('es-CO', {
  year: 'numeric',
  month: 'long',
  day: '2-digit',
});

function formatDate(d: string) {
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? '' : DTF.format(date);
}

/* ⏱️ Timeout de la consulta
   - Override por env: NEXT_PUBLIC_REVIEWS_TIMEOUT_MS
   - Defaults conservadores en prod para evitar 500 por latencia */
const ENV_TIMEOUT = Number(process.env.NEXT_PUBLIC_REVIEWS_TIMEOUT_MS || '');
const TIMEOUT_MS =
  Number.isFinite(ENV_TIMEOUT) && ENV_TIMEOUT > 0
    ? ENV_TIMEOUT
    : process.env.NODE_ENV === 'production'
    ? 5000
    : 3500;

/** Acepta PromiseLike para trabajar con el PostgrestFilterBuilder (thenable). */
function withTimeout<T>(p: PromiseLike<T>, ms = TIMEOUT_MS): Promise<T | 'timeout'> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms)),
  ]);
}

/** Evita pegar a Supabase si el público no está configurado. */
function isPublicSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return false;
  if (/XXXXXX|example|your\-project/i.test(url)) return false; // placeholders
  if (key.length < 20) return false;
  return true;
}

function FallbackPanel({ message }: { message: string }) {
  return (
    <div
      className="rounded-2xl border border-brand-dark/10 bg-[color:var(--color-surface)] p-4 shadow-soft"
      role="status"
      aria-live="polite"
    >
      <p className="text-sm text-[color:var(--color-text)]/70">{message}</p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Server Component
   ───────────────────────────────────────────────────────────── */

export default async function ReviewsList({ tourSlug, limit = 20 }: Props) {
  noStore(); // evita caché de Next en este subárbol

  if (!tourSlug) {
    return <FallbackPanel message="Aún no hay reseñas aprobadas." />;
  }

  if (!isPublicSupabaseConfigured()) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[ReviewsList] Supabase público no configurado — mostrando fallback.');
    }
    return <FallbackPanel message="Aún no hay reseñas aprobadas." />;
  }

  try {
    const supabase = getSupabase();

    const baseQuery = supabase
      .from('reviews')
      .select('id, rating, comment, created_at')
      .eq('tour_slug', tourSlug)
      .eq('approved', true)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(50, limit)));

    // Importante: el builder de Supabase es "thenable" (PromiseLike), por eso lo
    // pasamos a withTimeout que acepta PromiseLike<T>.
    const raced = await withTimeout<QueryResult>(
      baseQuery as unknown as PromiseLike<QueryResult>,
    );

    if (raced === 'timeout') {
      return (
        <FallbackPanel message="No pudimos cargar las reseñas ahora mismo (timeout). Intenta de nuevo más tarde." />
      );
    }

    const data = raced?.data ?? null;
    const error = raced?.error ?? null;

    if (error) {
      if (process.env.NODE_ENV !== 'production') {
        const msg = typeof error === 'string' ? error : error.message || String(error);
        console.warn('[ReviewsList] error de carga:', msg);
      }
      return (
        <FallbackPanel message="No pudimos cargar las reseñas ahora mismo. Intenta de nuevo más tarde." />
      );
    }

    if (!data || data.length === 0) {
      return <FallbackPanel message="Aún no hay reseñas aprobadas." />;
    }

    // Calcular un promedio local (sobre el lote mostrado) como referencia visual.
    const avgLocal = Math.round(
      (data.reduce((sum, r) => sum + clampStars(r.rating), 0) / data.length) * 10,
    ) / 10;

    return (
      <section aria-labelledby="reviews-title" className="space-y-3">
        <header className="flex items-baseline justify-between">
          <h3 id="reviews-title" className="font-heading text-lg text-brand-blue">
            Opiniones recientes
          </h3>
          <div className="text-xs text-[color:var(--color-text)]/60" aria-live="polite">
            Promedio (muestra): <span className="font-medium">{avgLocal}</span>/5 •{' '}
            <span className="font-medium">{data.length}</span> reseña
            {data.length > 1 ? 's' : ''}
          </div>
        </header>

        <ul className="space-y-3" role="list">
          {data.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-brand-dark/10 bg-[color:var(--color-surface)] p-4 shadow-soft"
              itemScope
              itemType="https://schema.org/Review"
            >
              <div className="flex items-center justify-between">
                <div itemProp="reviewRating" itemScope itemType="https://schema.org/Rating">
                  <meta itemProp="worstRating" content="1" />
                  <meta itemProp="bestRating" content="5" />
                  <meta itemProp="ratingValue" content={String(clampStars(r.rating))} />
                  <Stars value={r.rating} />
                </div>
                <time
                  className="text-xs text-[color:var(--color-text)]/60"
                  dateTime={new Date(r.created_at).toISOString()}
                  itemProp="datePublished"
                >
                  {formatDate(r.created_at)}
                </time>
              </div>

              <p className="mt-2 text-[color:var(--color-text)]/90" itemProp="reviewBody">
                {r.comment}
              </p>

              {/* Marca mínima del ítem reseñado (por SEO) */}
              <meta itemProp="itemReviewed" content={tourSlug} />
            </li>
          ))}
        </ul>
      </section>
    );
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      const msg =
        err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
      console.warn('[ReviewsList] excepción no controlada:', msg);
    }
    return <FallbackPanel message="Reseñas no disponibles temporalmente." />;
  }
}
