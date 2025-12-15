// src/app/api/invoice/[session_id]/route.ts
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { buildInvoicePdf, buildInvoiceFileName } from '@/services/invoice';
import { SITE_URL } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ───────── Config ───────── */
const BASE_URL = (SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000')
  .replace(/\/+$/, '');
const LOGO_URL = `${BASE_URL}/logo.png`;

// Exponemos cabeceras útiles para frontends (Content-Disposition, ids, etc.)
const EXPOSE = 'Content-Disposition,Content-Length,X-Invoice-Session,X-Request-ID';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Expose-Headers': EXPOSE,
} as const;

const reqId = () => crypto.randomUUID();

/* ───────── OPTIONS ───────── */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/* ───────── Utils ───────── */
function wantsJson(req: NextRequest) {
  const accept = (req.headers.get('accept') || '').toLowerCase();
  return accept.includes('application/json') || accept.includes('text/json');
}

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

// Evita caracteres problemáticos en Content-Disposition
function sanitizeFilename(name: string) {
  return name.replace(/[^\w.\-() ]+/g, '_').slice(0, 120) || 'archivo.pdf';
}

// Evita pegarle a Stripe si llega {CHECKOUT_SESSION_ID} u otro placeholder
function isStripePlaceholderSession(id?: string | null) {
  const v = String(id || '').trim();
  return !v || v === '{CHECKOUT_SESSION_ID}' || /^\{.+\}$/.test(v);
}

/* ───────── GET ───────── */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ session_id: string }> }, // Next 15: params es Promise
) {
  const { session_id } = await ctx.params;
  const requestId = reqId();

  // ¿Forzar descarga?
  const { searchParams } = new URL(req.url);
  const forceDownload = ['1', 'true', 'yes'].includes((searchParams.get('download') || '').toLowerCase());

  // Stripe requerido
  if (!process.env.STRIPE_SECRET_KEY) {
    return wantsJson(req)
      ? json({ error: 'Stripe not configured', requestId }, 500, { 'X-Request-ID': requestId })
      : new NextResponse('Stripe not configured', {
          status: 500,
          headers: { ...CORS_HEADERS, 'X-Request-ID': requestId },
        });
  }

  // Evitar placeholder {CHECKOUT_SESSION_ID}
  if (isStripePlaceholderSession(session_id)) {
    return wantsJson(req)
      ? json({ error: 'Invalid session_id placeholder', requestId }, 400, { 'X-Request-ID': requestId })
      : new NextResponse('Invalid session_id placeholder', {
          status: 400,
          headers: { ...CORS_HEADERS, 'X-Request-ID': requestId },
        });
  }

  // 1) Recuperar sesión Stripe
  const stripe = getStripe();
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(session_id);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[invoice] stripe retrieve error:', e);
    return wantsJson(req)
      ? json({ error: 'Not found', requestId }, 404, { 'X-Request-ID': requestId })
      : new NextResponse('Not found', {
          status: 404,
          headers: { ...CORS_HEADERS, 'X-Request-ID': requestId },
        });
  }

  // 2) Ensamblar datos de la factura
  const md = (session.metadata || {}) as Record<string, string | undefined>;
  const createdMs = (session.created ?? Math.floor(Date.now() / 1000)) * 1000;
  const createdISO = new Date(createdMs).toISOString();

  const tourTitle = md.tour_title || 'Tour KCE';
  const tourDate = md.date || null;
  const qty = Number(md.quantity || 1) || 1;

  // 3) Construir PDF (servicio centralizado)
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await buildInvoicePdf(
      {
        bookingId: session.id,
        createdAtISO: createdISO,
        customerName: session.customer_details?.name || null,
        customerEmail: session.customer_details?.email || session.customer_email || null,
        tourTitle,
        tourDate,
        persons: qty,
        totalMinor: session.amount_total ?? null,
        currency: (session.currency || 'usd').toUpperCase(),
        siteUrl: BASE_URL,
      },
      {
        logoUrl: LOGO_URL,
        locale: 'es-CO',
        fractionDigits: 0,
        theme: { brandBlue: '#0D5BA1', brandYellow: '#FFC300', textDark: '#111827' },
        showQr: true,
        qrUrl: `${BASE_URL}/booking/${encodeURIComponent(session.id)}`,
        qrLabel: 'Gestiona tu reserva',
      },
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[invoice] build pdf error:', e);
    return wantsJson(req)
      ? json({ error: 'Failed to build PDF', requestId }, 500, { 'X-Request-ID': requestId })
      : new NextResponse('Failed to build PDF', {
          status: 500,
          headers: { ...CORS_HEADERS, 'X-Request-ID': requestId },
        });
  }

  // 4) Salida segura (evita SharedArrayBuffer mismatch)
  const bytes = new Uint8Array(pdfBuffer);
  const filename = sanitizeFilename(buildInvoiceFileName(tourTitle, new Date(createdISO)));

  const headers: Record<string, string> = {
    'Content-Type': 'application/pdf',
    'Cache-Control': 'no-store',
    'Content-Length': String(bytes.byteLength),
    'Content-Disposition': `${forceDownload ? 'attachment' : 'inline'}; filename="${filename}"`,
    'X-Invoice-Session': session.id,
    'X-Request-ID': requestId,
    ...CORS_HEADERS,
  };

  // Info diagnóstica opcional
  if (typeof session.livemode === 'boolean') {
    headers['X-Stripe-Livemode'] = String(session.livemode);
  }

  return new NextResponse(bytes, { status: 200, headers });
}
