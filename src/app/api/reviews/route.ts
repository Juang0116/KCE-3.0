// src/app/api/reviews/route.ts
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { SITE_URL } from '@/lib/env';

export const runtime = 'nodejs'; // service-role; no Edge
export const dynamic = 'force-dynamic';

/* ───────────── Config ───────────── */
const RATE_LIMIT_MAX = 5;                 // máx. envíos por ventana
const RATE_LIMIT_WINDOW_MS = 10 * 60_000; // 10 minutos
const TIME_TRAP_MS = 3000;                // 3s mínimos desde render

// CORS (sincronizado con otros endpoints)
const ALLOW_ORIGIN =
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  SITE_URL ||
  '*';

const CORS_HEADERS: HeadersInit = {
  'Access-Control-Allow-Origin': ALLOW_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Expose-Headers': 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Window',
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/* ───────────── Schemas & utils ───────────── */

const Body = z.object({
  tour_slug: z.string().trim().min(2),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().min(10).max(800),
  name: z.string().trim().min(2),
  email: z.string().trim().email().optional(),
  // Honeypot: aceptamos ambos nombres (retrocompat)
  honeypot: z.string().optional(),
  website: z.string().optional(),
  // Time-trap (timestamp ms desde que se renderizó el form)
  startedAt: z.union([z.string(), z.number()]).optional(),
});

const j = (data: unknown, status = 200, headers?: HeadersInit) =>
  new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...CORS_HEADERS,
      ...headers,
    },
  });

const pickClientIP = (req: NextRequest) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('x-real-ip') ||
  '0.0.0.0';

const toKebab = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

function sanitizeComment(input: string): string {
  let s = String(input ?? '');
  // quita etiquetas HTML simples
  s = s.replace(/<[^>]*>/g, ' ');
  // quita URLs y @usuario (refuerzo server-side)
  s = s.replace(/https?:\/\/\S+/gi, '');
  s = s.replace(/www\.\S+/gi, '');
  s = s.replace(/@\w+/g, '');
  // quita caracteres de control
  s = s.replace(/[\u0000-\u001F\u007F]/g, ' ');
  // colapsa espacios y trim
  s = s.replace(/\s+/g, ' ').trim();
  // corta a 800 por seguridad
  if (s.length > 800) s = s.slice(0, 800).trimEnd();
  return s;
}

/* ───────────── Handler ───────────── */

export async function POST(req: NextRequest) {
  // Acepta JSON y también form-data
  const ct = (req.headers.get('content-type') || '').toLowerCase();

  let raw: Record<string, unknown> = {};
  try {
    if (ct.includes('application/json')) {
      raw = (await req.json()) as Record<string, unknown>;
    } else if (
      ct.includes('application/x-www-form-urlencoded') ||
      ct.includes('multipart/form-data')
    ) {
      const form = await req.formData();
      form.forEach((v, k) => (raw[k] = typeof v === 'string' ? v : String(v)));
    } else {
      raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    }
  } catch {
    /* parse error => validará Zod */
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    const msg =
      parsed.error.issues[0]?.message ||
      parsed.error.issues[0]?.path?.join('.') ||
      'Datos inválidos';
    return j(
      { error: msg },
      400,
      {
        'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
        'X-RateLimit-Remaining': String(RATE_LIMIT_MAX),
        'X-RateLimit-Window': String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)),
      },
    );
  }

  const { honeypot, website, startedAt, ...data } = parsed.data;

  // Honeypot activado → respondemos OK sin insertar
  const trap = (honeypot ?? website ?? '').trim();
  if (trap.length > 0) {
    return j(
      { ok: true },
      200,
      {
        'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
        'X-RateLimit-Remaining': String(RATE_LIMIT_MAX),
        'X-RateLimit-Window': String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)),
      },
    );
  }

  // Time-trap: sólo si el cliente envía startedAt (retrocompatible)
  const startedMs = Number(startedAt);
  if (Number.isFinite(startedMs) && startedMs > 0) {
    if (Date.now() - startedMs < TIME_TRAP_MS) {
      return j({ error: 'Por favor, revisa tu reseña antes de enviarla.' }, 400);
    }
  }

  // Normaliza y refuerza datos
  const tourSlug = toKebab(data.tour_slug);
  const rating = Math.max(1, Math.min(5, Math.round(Number(data.rating))));
  const comment = sanitizeComment(data.comment);
  if (comment.length < 10) {
    return j({ error: 'Tu comentario es muy corto.' }, 400);
  }

  const ip = pickClientIP(req);
  const ua = (req.headers.get('user-agent') || '').slice(0, 200);
  const admin = getSupabaseAdmin();

  /* ── Rate limit: máx RATE_LIMIT_MAX por ventana (IP + tour_slug) ── */
  let remaining = RATE_LIMIT_MAX;
  try {
    const sinceISO = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count } = await admin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'review_submitted')
      // tu schema usa created_at
      .gte('created_at', sinceISO)
      .contains('payload', { ip, tour_slug: tourSlug });

    const used = count ?? 0;
    remaining = Math.max(0, RATE_LIMIT_MAX - used);

    if (used >= RATE_LIMIT_MAX) {
      const retry = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000).toString();
      return j(
        { error: 'Demasiadas reseñas en poco tiempo. Intenta más tarde.' },
        429,
        {
          'Retry-After': retry,
          'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Window': String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)),
        },
      );
    }
  } catch {
    // si falla el conteo, no bloqueamos; seguimos
  }

  /* ── Insert reseña en moderación ── */
  try {
    const { error } = await admin.from('reviews').insert({
      tour_slug: tourSlug,
      rating,
      comment,
      approved: false,
      user_id: null,
      // Campos de seguridad/auditoría
      honeypot: '', // explícito (RLS check coalesce(honeypot,'')='')
      ip,           // inet → string (PG lo castea)
      // Si en el futuro agregas columnas para PII, inclúyelas explícitamente:
      // name: data.name,
      // email: data.email ?? null,
    });

    if (error) {
      // FK inválida (tour no existe) → 400 clara
      if ((error as any).code === '23503') {
        return j(
          { error: 'Tour inválido.' },
          400,
          {
            'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
            'X-RateLimit-Remaining': String(Math.max(0, remaining - 1)),
            'X-RateLimit-Window': String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)),
          },
        );
      }
      // eslint-disable-next-line no-console
      console.error('[reviews] insert error:', error);
      return j({ error: 'No pudimos enviar tu reseña' }, 500);
    }

    // Telemetría / auditoría
    await admin.from('events').insert({
      type: 'review_submitted',
      payload: {
        tour_slug: tourSlug,
        rating,
        ip,
        ua,
        startedAt: Number.isFinite(startedMs) ? startedMs : null,
        name: data.name,            // quita si no quieres PII en eventos
        email: Boolean(data.email), // sólo booleano para no exponer el correo
      },
    });

    return j(
      { ok: true, moderation: true },
      200,
      {
        'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
        'X-RateLimit-Remaining': String(Math.max(0, remaining - 1)),
        'X-RateLimit-Window': String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)),
      },
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[reviews] handler exception:', err);
    return j({ error: 'No pudimos enviar tu reseña' }, 500);
  }
}
