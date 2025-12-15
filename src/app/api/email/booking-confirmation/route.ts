// src/app/api/email/booking-confirmation/route.ts
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import crypto from 'node:crypto';
import { Resend } from 'resend';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { buildInvoicePdf, buildInvoiceFileName } from '@/services/invoice';
import { SITE_URL } from '@/lib/env';

export const runtime = 'nodejs';

/* ─────────────────────────────────────────────────────────────
   Config & helpers
   ───────────────────────────────────────────────────────────── */

const ZERO_DECIMAL = new Set([
  'bif','clp','djf','gnf','jpy','kmf','krw','mga','pyg','rwf','ugx','vnd','vuv','xaf','xof','xpf',
]);

const BASE_URL = (SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const LOGO_URL = `${BASE_URL}/logo.png`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
} as const;

function json(data: unknown, status = 200, extra: Record<string,string> = {}) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...CORS_HEADERS,
      ...extra,
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function formatAmount(amountInMinor: number, currency: string) {
  const c = currency.toLowerCase();
  const value = ZERO_DECIMAL.has(c) ? amountInMinor : amountInMinor / 100;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(value);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;' }[m]!));
}

const isStripePlaceholderSession = (id?: string) => {
  const v = (id || '').trim();
  return !v || v === '{CHECKOUT_SESSION_ID}' || /^\{.+\}$/.test(v);
};

const reqId = () => crypto.randomUUID();

/* ─────────────────────────────────────────────────────────────
   Entrada: JSON o FormData + validación con Zod
   ───────────────────────────────────────────────────────────── */

const Input = z.object({
  session_id: z.string().trim().min(1).optional(),
  email: z.string().email().optional(),
  tour: z.string().trim().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // YYYY-MM-DD
  people: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.coerce.number().int().min(1).max(99).optional(),
  ),
});

/** Convierte cadenas vacías en undefined antes de validar */
function stripEmptyStrings(obj: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      const s = v.trim();
      out[k] = s === '' ? undefined : s;
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function readInput(req: NextRequest) {
  const ct = (req.headers.get('content-type') || '').toLowerCase();
  let raw: Record<string, unknown> = {};
  if (ct.includes('application/json')) {
    try {
      raw = (await req.json()) ?? {};
    } catch {/* ignore */}
  } else {
    try {
      const form = await req.formData();
      form.forEach((v, k) => (raw[k] = String(v)));
    } catch {/* ignore */}
  }
  const cleaned = stripEmptyStrings(raw);
  const parsed = Input.safeParse(cleaned);
  if (!parsed.success) return { error: parsed.error.flatten(), data: null as null };
  return { error: null as null, data: parsed.data };
}

/* ─────────────────────────────────────────────────────────────
   POST /api/email/booking-confirmation
   Reenvía confirmación con PDF adjunto (logo y QR incluidos)
   ───────────────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  const requestId = reqId();

  const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
  if (!RESEND_API_KEY) return json({ error: 'RESEND_API_KEY not set', requestId }, 500, { 'X-Request-ID': requestId });

  // 1) Parse + validar input (ahora vacíos -> undefined)
  const { data: input, error: inputErr } = await readInput(req);
  if (inputErr) {
    return json({ error: 'Invalid body', details: inputErr, requestId }, 400, { 'X-Request-ID': requestId });
  }

  let { session_id, email, tour, date, people } = input;

  // No aceptamos el placeholder de Stripe
  if (isStripePlaceholderSession(session_id)) {
    session_id = undefined;
  }

  // 2) Completar desde Stripe (ideal) — NO pedimos correo en UI, lo sacamos de Stripe
  let chargedAmount: string | undefined;
  let currency: string | undefined;
  let session: Stripe.Checkout.Session | null = null;
  let to = (email || '').trim();

  try {
    if (process.env.STRIPE_SECRET_KEY && session_id) {
      const stripe = getStripe();
      session = await stripe.checkout.sessions.retrieve(session_id, { expand: ['payment_intent'] });

      to = to || session.customer_details?.email || session.customer_email || '';

      if (session.amount_total != null && session.currency) {
        chargedAmount = formatAmount(session.amount_total, session.currency);
        currency = session.currency.toUpperCase();
      }

      const md = (session.metadata || {}) as Record<string, string | undefined>;
      tour = tour || md.tour_title || undefined;
      date = date || md.date || undefined;
      people = people || (md.quantity ? Number(md.quantity) : undefined) || undefined;
    }
  } catch (e) {
    // No bloqueamos por Stripe; seguimos con lo que tengamos
    // eslint-disable-next-line no-console
    console.error('[email] stripe lookup error:', e);
  }

  // Si seguimos sin correo, no podemos enviar
  if (!to) {
    return json(
      {
        error: 'No email available',
        hint: 'Se requiere un session_id válido de Stripe para obtener el correo del cliente.',
        requestId,
      },
      400,
      { 'X-Request-ID': requestId },
    );
  }

  // 3) Componer asunto + cuerpo (HTML y texto)
  const safeTour = tour ? escapeHtml(tour) : '';
  const safeDate = date ? escapeHtml(date) : '';
  const qty = typeof people === 'number' && people > 0 ? people : undefined;

  const subject =
    `KCE — Confirmación de reserva` +
    (safeTour ? `: ${safeTour}` : '') +
    (safeDate ? ` (${safeDate})` : '');

  const manageUrl = `${BASE_URL}/booking/${encodeURIComponent(session_id || 'manual')}`;

  const text = [
    '¡Gracias por tu reserva con Knowing Cultures Enterprise!',
    safeTour ? `• Tour: ${safeTour}` : undefined,
    safeDate ? `• Fecha: ${safeDate}` : undefined,
    qty ? `• Personas: ${qty}` : undefined,
    chargedAmount ? `• Monto: ${chargedAmount}` : undefined,
    '',
    'Adjuntamos tu factura en PDF.',
    `Puedes gestionar tu reserva aquí: ${manageUrl}`,
    'Si necesitas ajustar algo, responde este correo o abre el chat en la web.',
    '— Equipo KCE',
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7FAFC;padding:24px 0">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;box-shadow:0 4px 16px rgba(17,24,39,.08);overflow:hidden">
          <tr>
            <td style="background:#0D5BA1;color:#fff;padding:20px 24px">
              <div style="display:flex;align-items:center;justify-content:space-between">
                <div style="font-weight:700;font-size:18px;letter-spacing:.2px">Knowing Cultures Enterprise</div>
                <img src="${LOGO_URL}" alt="KCE" height="28" style="display:block;border:0;outline:none"/>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827">
              <h1 style="margin:0 0 12px 0;font-size:22px;color:#0D5BA1">¡Gracias por tu reserva!</h1>
              <p style="margin:0 0 12px 0">Te confirmamos tu experiencia con KCE.</p>
              <ul style="margin:0;padding-left:18px;line-height:1.6">
                ${safeTour ? `<li><strong>Tour:</strong> ${safeTour}</li>` : ''}
                ${safeDate ? `<li><strong>Fecha:</strong> ${safeDate}</li>` : ''}
                ${qty ? `<li><strong>Personas:</strong> ${qty}</li>` : ''}
                ${chargedAmount ? `<li><strong>Monto:</strong> ${chargedAmount}</li>` : ''}
                ${currency ? `<li><strong>Moneda:</strong> ${currency}</li>` : ''}
              </ul>

              <p style="margin:16px 0">Adjuntamos tu factura en PDF. También puedes gestionar tu reserva desde el botón:</p>
              <p style="margin:0 0 20px 0">
                <a href="${manageUrl}" target="_blank" rel="noreferrer"
                   style="display:inline-block;background:#FFC300;color:#111827;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:700">
                  Abrir mi reserva
                </a>
              </p>

              <p style="margin:0;color:#4B5563">Si necesitas ajustar algo, responde este correo o abre el chat en la web.</p>
              <p style="margin:16px 0 0 0;color:#4B5563">— Equipo Knowing Cultures Enterprise</p>
            </td>
          </tr>
          <tr>
            <td style="background:#F3F4F6;color:#6B7280;padding:14px 24px;font-size:12px;text-align:center">
              KCE • ${BASE_URL.replace(/^https?:\/\//,'')}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`.trim();

  // 4) Construir el PDF (si falla, enviamos sin adjunto)
  let pdfBuffer: Buffer | null = null;
  let filename = 'Factura.pdf';
  try {
    const createdAt =
      session
        ? new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000)
        : (date ? new Date(`${date}T00:00:00`) : new Date());

    pdfBuffer = await buildInvoicePdf(
      {
        bookingId: session_id || 'manual',
        createdAtISO: createdAt.toISOString(),
        customerName: (session?.customer_details?.name || null) as string | null,
        customerEmail: to,
        tourTitle: tour || 'Tour KCE',
        tourDate: date || null,
        persons: qty || 1,
        totalMinor: session?.amount_total ?? null,
        currency: currency || session?.currency?.toUpperCase() || 'USD',
        siteUrl: BASE_URL,
      },
      {
        logoUrl: LOGO_URL,
        locale: 'es-CO',
        fractionDigits: 0,
        theme: { brandBlue: '#0D5BA1', brandYellow: '#FFC300', textDark: '#111827' },
        showQr: true,
        qrUrl: manageUrl,
        qrLabel: 'Gestiona tu reserva',
      },
    );
    filename = buildInvoiceFileName(tour || 'Tour KCE', createdAt);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[email] PDF build failed, sending without attachment:', err);
  }

  // 5) Envío con Resend (con fallback del remitente)
  const fromEnv = (process.env.EMAIL_FROM || '').trim();
  const fallbackFrom = 'KCE <onboarding@resend.dev>';
  const initialFrom = fromEnv || fallbackFrom;
  const replyTo = process.env.EMAIL_REPLY_TO || undefined;

  const resend = new Resend(RESEND_API_KEY);

  async function sendWith(fromAddr: string) {
    const options: Parameters<typeof resend.emails.send>[0] = {
      from: fromAddr,
      to,
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(pdfBuffer
        ? {
            attachments: [
              {
                filename,
                content: pdfBuffer.toString('base64'),
                contentType: 'application/pdf',
              },
            ],
          }
        : {}),
    };
    return await resend.emails.send(options);
  }

  let firstFrom = initialFrom;
  let res = await sendWith(firstFrom);

  if (res.error && firstFrom !== fallbackFrom) {
    // eslint-disable-next-line no-console
    console.warn('[email] first send failed with from="%s": %s', firstFrom, res.error.message);
    firstFrom = fallbackFrom;
    res = await sendWith(firstFrom);
  }

  if (res.error) {
    // eslint-disable-next-line no-console
    console.error('[email] resend error (after fallback):', res.error);
    return json({ error: res.error.message, triedFrom: firstFrom, requestId }, 500, { 'X-Request-ID': requestId });
  }

  // 6) Responder: redirect (UX) si el cliente es navegador, o JSON
  const accept = (req.headers.get('accept') || '').toLowerCase();
  const wantsJson = accept.includes('application/json') || accept.includes('text/json');

  const url = new URL('/checkout/success', req.url);
  url.searchParams.set('sent', '1');
  if (session_id) url.searchParams.set('session_id', session_id);
  if (tour) url.searchParams.set('tour', tour);
  if (date) url.searchParams.set('date', date);
  if (qty) url.searchParams.set('q', String(qty));

  return wantsJson
    ? json({ ok: true, redirect: url.pathname + url.search, requestId }, 200, { 'X-Request-ID': requestId })
    : NextResponse.redirect(url, { status: 303, headers: { 'X-Request-ID': requestId } });
}
