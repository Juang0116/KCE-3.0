// src/features/tours/components/TourCard.tsx
import clsx from 'clsx';
import Image from 'next/image';
import Link from 'next/link';
import * as React from 'react';

import { formatCOP, hoursLabel } from '@/utils/format';
import type { Tour } from '../../types';

type ImageItem = { url: string; alt?: string | null };

type Props = {
  tour: Tour & Partial<{
    images: unknown;               // Supabase JSONB: [{ url, alt? }, ...]
    base_price: number | null;     // Supabase
    duration_hours: number | null; // Supabase
    summary: string | null;        // Supabase
    rating: number | null;         // opcional (si lo traes precalculado)
  }>;
  /** Da prioridad a la imagen (p. ej. 1ª fila). */
  priority?: boolean;
  className?: string;
};

/* ───────────────── helpers de normalización ───────────────── */

function asImageArray(val: unknown): ImageItem[] {
  if (!Array.isArray(val)) return [];
  return (val as unknown[]).flatMap((x) => {
    const it = x as Record<string, unknown>;
    const url = typeof it?.url === 'string' ? it.url : null;
    if (!url) return [];
    const alt =
      it?.alt == null || typeof it.alt === 'string' || typeof it.alt === 'number'
        ? (it.alt as string | number | null)
        : null;
    return [{ url, alt: alt == null ? null : String(alt) }];
  });
}

function pickCover(tour: Props['tour']): { url: string; alt: string } | null {
  // 1) Mock (tour.image)
  if (typeof (tour as Tour).image === 'string' && (tour as Tour).image.trim()) {
    return {
      url: (tour as Tour).image,
      alt: `${tour.title}${tour.city ? ` — ${tour.city}` : ''}`,
    };
  }
  // 2) Supabase JSONB (tour.images[0]?.url)
  const imgs = asImageArray(tour.images);
  const first = imgs[0];
  if (first?.url) {
    return {
      url: first.url,
      alt: (first.alt?.toString() || `${tour.title}`).trim(),
    };
  }
  return null;
}

function getPriceCOP(tour: Props['tour']): number {
  if (typeof tour.base_price === 'number' && Number.isFinite(tour.base_price)) {
    return tour.base_price || 0;
  }
  const p = (tour as Tour).price;
  return typeof p === 'number' && Number.isFinite(p) ? p : 0;
}

function getDurationHours(tour: Props['tour']): number | null {
  if (typeof tour.duration_hours === 'number' && Number.isFinite(tour.duration_hours)) {
    return tour.duration_hours;
  }
  const d = (tour as Tour).durationHours;
  return typeof d === 'number' && Number.isFinite(d) ? d : null;
}

function getShort(tour: Props['tour']): string {
  if (typeof tour.summary === 'string' && tour.summary.trim()) return tour.summary.trim();
  const short = (tour as Tour).short;
  return typeof short === 'string' && short.trim() ? short.trim() : '';
}

/* ───────────────── Componente ───────────────── */

const TourCard = React.memo(function TourCard({
  tour,
  priority = false,
  className,
}: Props) {
  const tags = Array.isArray(tour.tags) ? (tour.tags.slice(0, 3) as string[]) : [];

  const { cover, priceCOP, dur, desc, hasShort, descId, rating, ratingLabel } = React.useMemo(() => {
    const c = pickCover(tour);
    const price = getPriceCOP(tour);
    const duration = getDurationHours(tour);
    const short = getShort(tour);
    const shortOk = short.length > 0;
    // usa slug (siempre presente) para el id accesible
    const shortId = shortOk ? `tour-desc-${(tour as Tour).slug}` : undefined;

    const rRaw = typeof (tour as any).rating === 'number' ? (tour as any).rating : null;
    const r = Number.isFinite(rRaw) ? (rRaw as number) : undefined;

    return {
      cover: c,
      priceCOP: price,
      dur: duration,
      desc: short,
      hasShort: shortOk,
      descId: shortId,
      rating: r,
      ratingLabel: r != null ? `${r.toFixed(1)} de 5 estrellas` : undefined,
    };
  }, [tour]);

  return (
    <Link
      href={`/tours/${(tour as Tour).slug}`}
      aria-label={`Abrir tour: ${tour.title}`}
      aria-describedby={hasShort ? descId : undefined}
      data-tour-slug={(tour as Tour).slug}
      className={clsx(
        'group overflow-hidden rounded-2xl border border-brand-dark/10 bg-[color:var(--color-surface)] shadow-soft transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:ring-offset-2',
        'hover:shadow-2xl',
        className,
      )}
      prefetch
    >
      {/* Media */}
      <div className="relative aspect-[4/3] w-full bg-black/5">
        {cover ? (
          <Image
            src={cover.url}
            alt={cover.alt || `${tour.title}${tour.city ? ` — ${tour.city}` : ''}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition duration-300 group-hover:scale-[1.03]"
            priority={priority}
            loading={priority ? 'eager' : 'lazy'}
            decoding={priority ? 'sync' : 'async'}
          />
        ) : (
          <div
            className="absolute inset-0 grid place-items-center text-sm text-[color:var(--color-text)]/50"
            role="img"
            aria-label="Sin imagen disponible"
          >
            Sin imagen
          </div>
        )}

        {/* City badge */}
        {(tour as Tour).city && (
          <div className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-1 text-xs text-white">
            <span className="sr-only">Ciudad: </span>
            {(tour as Tour).city}
          </div>
        )}

        {/* Subtle gradient for readability on hover */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>

      {/* Content */}
      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 font-heading text-lg leading-snug text-brand-blue">
            {tour.title}
          </h3>

          {/* Rating (accesible) */}
          {typeof rating === 'number' && (
            <div
              className="shrink-0 rounded-full bg-[color:var(--color-bg)] px-2 py-0.5 text-xs text-[color:var(--color-text)]/80"
              role="img"
              aria-label={ratingLabel}
              title={ratingLabel}
            >
              ★ {rating.toFixed(1)}
            </div>
          )}
        </div>

        {hasShort && (
          <p id={descId} className="line-clamp-2 text-sm text-[color:var(--color-text)]/80">
            {desc}
          </p>
        )}

        <div className="flex items-center justify-between text-sm">
          <span className="text-[color:var(--color-text)]/80">{dur != null ? hoursLabel(dur) : '—'}</span>
          <span className="font-heading text-brand-red">{formatCOP(priceCOP)}</span>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {tags.map((tg) => (
              <span
                key={tg}
                className="rounded-full bg-[color:var(--color-bg)] px-2 py-1 text-xs text-[color:var(--color-text)]/80"
              >
                #{tg}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
});

export default TourCard;
