// src/app/api/checkout/route.ts
import 'server-only';

import crypto from 'node:crypto';
import type Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { SITE_URL, isStripeMock } from '@/lib/env';
import { getTourBySlug, TOURS } from '@/features/tours/data.mock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ─────────────────────────────────────────────────────────────
   Validación de entrada (server-authoritative)
   ───────────────────────────────────────────────────────────── */

const Schema = z.object({
  tour: z
    .object({
      slug: z.string().min(1).optional(),
      title: z.string().min(1).optional(),
      short: z.string().optional(),
      // ⚠️ el precio que mande el cliente se ignora: el server decide
      price: z.number().int().min(0).optional(),
    })
    .refine((t) => Boolean(t.slug || t.title), {
      message: 'Debes enviar al menos el slug o el título del tour.',
      path: ['slug'],
    }),
  quantity: z.number().int().min(1).max(20),
  customer: z.object({
    email: z.string().email(),
    name: z.string().min(2),
  }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Fecha inválida: usa el formato YYYY-MM-DD.',
  }),
  phone: z.string().optional(),
  currency: z.enum(['COP', 'USD']).default('COP'),
  locale: z.string().max(10).optional(),
});

type Payload = z.infer<typeof Schema>;

/* ─────────────────────────────────────────────────────────────
   Utils
   ───────────────────────────────────────────────────────────── */

function json(data: unknown, status = 200, extra?: Record<string, string>) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...(extra || {}),
    },
  });
}

function parseYMD(ymd: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : ymd;
}

function isTodayOrFuture(ymd: string) {
  const ok = parseYMD(ymd);
  if (!ok) return false;
  const d = new Date(`${ok}T00:00:00Z`).getTime();
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return d >= now.getTime();
}

function copToUsdCents(cop: number) {
  const rate = Number(process.env.STRIPE_COP_USD_RATE || '4000');
  const usd = cop / rate;
  // Stripe usa minor units (cents)
  return Math.max(1, Math.round(usd * 100));
}

function inferLocale(
  req: Request,
  override?: string,
): Stripe.Checkout.SessionCreateParams.Locale {
  if (override) {
    const o = override.toLowerCase();
    if (o.startsWith('es')) return 'es-419';
    if (o.startsWith('en')) return 'en';
  }

  const raw = (req.headers.get('accept-language') || '').toLowerCase();
  const hint = raw.split(',')[0]?.trim();

  if (hint?.startsWith('es')) return 'es-419';
  if (hint?.startsWith('en')) return 'en';
  return 'auto';
}

function buildSuccessUrl({
  sessionPlaceholder,
  slug,
  date,
  qty,
}: {
  sessionPlaceholder: string;
  slug: string;
  date: string;
  qty: number;
}) {
  const u = new URL('/checkout/success', SITE_URL);
  // Stripe reemplaza literalmente {CHECKOUT_SESSION_ID}
  u.searchParams.set('session_id', sessionPlaceholder);
  u.searchParams.set('tour', slug);
  u.searchParams.set('date', date);
  u.searchParams.set('q', String(qty));
  return u.toString();
}

function buildCancelUrl({
  slug,
  date,
  qty,
}: {
  slug: string;
  date: string;
  qty: number;
}) {
  const u = new URL('/checkout/cancel', SITE_URL);
  u.searchParams.set('tour', slug);
  u.searchParams.set('date', date);
  u.searchParams.set('q', String(qty));
  return u.toString();
}

function traceHeaders() {
  const id = crypto.randomUUID();
  return {
    id,
    headers: { 'X-Request-ID': id } as Record<string, string>,
  };
}

/* ─────────────────────────────────────────────────────────────
   Handler
   ───────────────────────────────────────────────────────────── */

export async function POST(req: Request) {
  const { id: reqId, headers: trace } = traceHeaders();

  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);

    if (!parsed.success) {
      return json(
        {
          error: parsed.error.issues[0]?.message || 'Datos inválidos.',
          requestId: reqId,
        },
        400,
        trace,
      );
    }

    const data: Payload = parsed.data;

    // 1) Resolver el tour de forma AUTORITATIVA desde el catálogo
    const resolved =
      (data.tour.slug && getTourBySlug(data.tour.slug)) ||
      (data.tour.title &&
        TOURS.find(
          (t) => t.title.toLowerCase() === data.tour.title!.toLowerCase(),
        ));

    if (!resolved) {
      return json(
        { error: 'Tour no encontrado.', requestId: reqId },
        404,
        trace,
      );
    }

    // 2) Validar fecha (formato + no pasada)
    if (!parseYMD(data.date)) {
      return json(
        { error: 'Fecha inválida.', requestId: reqId },
        400,
        trace,
      );
    }
    if (!isTodayOrFuture(data.date)) {
      return json(
        { error: 'La fecha debe ser hoy o futura.', requestId: reqId },
        400,
        trace,
      );
    }

    // 3) URLs de retorno
    const success_url = buildSuccessUrl({
      sessionPlaceholder: '{CHECKOUT_SESSION_ID}',
      slug: resolved.slug,
      date: data.date,
      qty: data.quantity,
    });
    const cancel_url = buildCancelUrl({
      slug: resolved.slug,
      date: data.date,
      qty: data.quantity,
    });

    // 4) MOCK o sin clave → simulación de éxito (útil en dev/local)
    if (isStripeMock || !process.env.STRIPE_SECRET_KEY) {
      const mockUrl = new URL('/checkout/success', SITE_URL);
      mockUrl.searchParams.set('mock', '1');
      mockUrl.searchParams.set('q', String(data.quantity));
      mockUrl.searchParams.set('tour', resolved.slug);
      mockUrl.searchParams.set('date', data.date);

      return json(
        {
          url: mockUrl.toString(),
          requestId: reqId,
        },
        200,
        trace,
      );
    }

    // 5) Stripe real (cuenta US) — cobramos en USD
    const { getStripe } = await import('@/lib/stripe');
    const stripe = getStripe();

    const catalogCurrency =
      process.env.CATALOG_CURRENCY?.toUpperCase() || 'COP';

    const unitAmountCents =
      catalogCurrency === 'USD'
        ? Math.max(1, resolved.price) // asumimos que el precio del catálogo ya está en minor units USD
        : copToUsdCents(resolved.price); // catálogo en COP → convertir a USD

    // Metadatos consistentes para webhook / dashboard / success page
    const metadata: Record<string, string> = {
      date: data.date,
      quantity: String(data.quantity),
      tour_title: resolved.title,
      tour_slug: resolved.slug,
      tour_price_cop: String(resolved.price),
      customer_name: data.customer.name,
      phone: data.phone ?? '',
      origin_currency: (data.currency || 'COP').toUpperCase(),
      catalog_currency: catalogCurrency,
    };

    const stripeLocale = inferLocale(req, data.locale);
    const clientReferenceId = `${resolved.slug}:${data.date}:${data.customer.email}`
      .slice(0, 500);

    // Expiración (opcional): minutos desde env (default 24)
    const expireMinutes = Math.max(
      15,
      Math.min(60, Number(process.env.STRIPE_SESSION_EXPIRES_MIN || 24)),
    );
    const expires_at = Math.floor(Date.now() / 1000) + expireMinutes * 60;

    // Idempotencia: hash estable de parámetros clave
    const idemKey = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          slug: resolved.slug,
          date: data.date,
          qty: data.quantity,
          email: data.customer.email.toLowerCase(),
          unitAmountCents,
          success_url,
          cancel_url,
        }),
      )
      .digest('hex');

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        customer_email: data.customer.email,
        success_url,
        cancel_url,
        client_reference_id: clientReferenceId,
        locale: stripeLocale,
        phone_number_collection: { enabled: !data.phone },
        allow_promotion_codes: true,
        customer_creation: 'always',
        expires_at,
        // recuperación si expira
        after_expiration: { recovery: { enabled: true } },
        // línea de pedido (siempre USD en cuenta US)
        line_items: [
          {
            quantity: data.quantity,
            price_data: {
              currency: 'usd',
              unit_amount: unitAmountCents,
              product_data: {
                name: resolved.title,
                description: `${resolved.short ?? ''}${
                  data.date ? ` — Fecha: ${data.date}` : ''
                }`.trim(),
              },
            },
          },
        ],
        // metadatos en Session y también en PaymentIntent
        metadata,
        payment_intent_data: { metadata },
      },
      { idempotencyKey: `kce_checkout_${idemKey}` },
    );

    if (!session.url) {
      return json(
        { error: 'Stripe session without URL', requestId: reqId },
        500,
        trace,
      );
    }

    return json(
      {
        url: session.url,
        requestId: reqId,
        sessionId: session.id,
      },
      200,
      { ...trace, 'X-Stripe-Locale': String(stripeLocale) },
    );
  } catch (e: any) {
    // Errores de Stripe u otros
    const code =
      e?.raw?.code ||
      e?.code ||
      (e?.type === 'StripeInvalidRequestError'
        ? 'stripe_invalid_request'
        : 'unknown_error');

    const msg =
      e?.message ||
      e?.raw?.message ||
      'Error al iniciar el checkout.';

    // eslint-disable-next-line no-console
    console.error('[checkout] error:', e);

    return json(
      {
        error: msg,
        code,
        requestId: reqId,
      },
      e?.statusCode && Number.isInteger(e.statusCode)
        ? e.statusCode
        : 500,
      trace,
    );
  }
}
