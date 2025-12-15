// src/app/api/webhooks/stripe/route.ts
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

import { Resend } from 'resend';
import { buildInvoicePdf, buildInvoiceFileName } from '@/services/invoice';
import { SITE_URL } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const isProd = process.env.NODE_ENV === 'production';
const BASE_URL = (SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const LOGO_URL = `${BASE_URL}/logo.png`;

/* ───────────────── helpers ───────────────── */

function json(data: unknown, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];
const jsonSafe = (value: unknown): Json =>
  JSON.parse(JSON.stringify(value, (_k, v) => (v === undefined ? null : v))) as Json;

const safeStr = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function parseYMD(ymd?: string): string | null {
  if (!ymd) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : `${m[1]}-${m[2]}-${m[3]}`;
}

const toKebab = (str?: string) =>
  safeStr(str || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/* ───────── MONEDA ───────── */
const ZERO_DECIMAL = new Set([
  'BIF','CLP','DJF','GNF','JPY','KMF','KRW','MGA','PYG','RWF','UGX','VND','VUV','XAF','XOF','XPF',
]);

function formatAmountFromMinor(amountMinor: number | null | undefined, currency: string) {
  if (amountMinor == null) return '';
  const cur = currency.toUpperCase();
  const value = ZERO_DECIMAL.has(cur) ? amountMinor : amountMinor / 100;
  try {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${value} ${cur}`;
  }
}

/* ───────── Supabase helpers ───────── */

async function updateBookingStatusBySessionId(
  admin: ReturnType<typeof getSupabaseAdmin>,
  stripe_session_id: string,
  nextStatus: 'pending' | 'paid' | 'canceled',
) {
  const { data: existing, error: exErr } = await admin
    .from('bookings')
    .select('id,status')
    .eq('stripe_session_id', stripe_session_id)
    .maybeSingle();

  if (exErr) throw exErr;
  if (!existing?.id) return;

  if (existing.status !== nextStatus) {
    const { error: updErr } = await admin
      .from('bookings')
      .update({ status: nextStatus })
      .eq('id', existing.id);
    if (updErr) throw updErr;
  }
}

async function upsertBookingFromSession(
  admin: ReturnType<typeof getSupabaseAdmin>,
  session: Stripe.Checkout.Session,
) {
  const meta = (session.metadata ?? {}) as Record<string, string | undefined>;

  const customer_email =
    safeStr(session.customer_details?.email ?? session.customer_email ?? meta.email);
  const customer_name = safeStr(meta.customer_name ?? session.customer_details?.name ?? '');
  const phone = safeStr(meta.phone ?? session.customer_details?.phone ?? '');

  const quantity = Number(meta.quantity ?? 0) || 1;
  const dateStr = parseYMD(safeStr(meta.date)) ?? new Date().toISOString().slice(0, 10);

  const tourSlug = toKebab(meta.tour_slug);
  const tourTitle = safeStr(meta.tour_title);

  // Resolver tour_id (si existe tabla tours)
  let tour_id: string | null = null;
  try {
    if (tourSlug) {
      const { data, error } = await admin.from('tours').select('id').eq('slug', tourSlug).maybeSingle();
      if (!error && data?.id) tour_id = data.id;
    }
    if (!tour_id && tourTitle) {
      const { data, error } = await admin.from('tours').select('id').ilike('title', tourTitle).maybeSingle();
      if (!error && data?.id) tour_id = data.id;
    }
  } catch {
    // noop
  }

  const amount_total = typeof session.amount_total === 'number' ? session.amount_total : null;
  const currency = safeStr(session.currency)?.toUpperCase() || null;

  const origin_currency = safeStr(meta.origin_currency) || safeStr(meta.currency) || 'COP';
  const tour_price_cop = meta.tour_price_cop
    ? Number(meta.tour_price_cop)
    : meta.tour_price
    ? Number(meta.tour_price)
    : null;

  const bookingStatus: 'pending' | 'paid' | 'canceled' =
    session.payment_status === 'paid' ? 'paid' : 'pending';

  const stripe_session_id = safeStr(session.id);
  if (!stripe_session_id) throw new Error('Missing stripe_session_id');

  // Idempotencia por stripe_session_id
  const existing = await admin
    .from('bookings')
    .select('id,status')
    .eq('stripe_session_id', stripe_session_id)
    .maybeSingle();

  if (existing.error) throw existing.error;

  if (existing.data?.id) {
    const { error: updErr } = await admin
      .from('bookings')
      .update({
        status: bookingStatus,
        total: amount_total,
        currency,                     // p.ej. USD
        origin_currency,              // p.ej. COP
        tour_price_cop,               // precio unitario COP (opcional)
        payment_provider: 'stripe',
        customer_email: customer_email || null,
        customer_name: customer_name || null,
        phone: phone || null,
      })
      .eq('id', existing.data.id);
    if (updErr) throw updErr;
    return existing.data.id as string;
  } else {
    const { data: inserted, error: insErr } = await admin
      .from('bookings')
      .insert({
        user_id: null,
        tour_id: tour_id || null,
        date: dateStr,
        persons: quantity,
        extras: jsonSafe({ meta }),
        status: bookingStatus,
        total: amount_total,
        payment_provider: 'stripe',
        stripe_session_id,
        customer_email: customer_email || null,
        customer_name: customer_name || null,
        phone: phone || null,
        currency,
        origin_currency,
        tour_price_cop,
      })
      .select('id')
      .single();
    if (insErr) throw insErr;
    return inserted.id as string;
  }
}

async function logEvent(
  admin: ReturnType<typeof getSupabaseAdmin>,
  type: string,
  payload: Record<string, unknown>,
) {
  try {
    await admin.from('events').insert({
      user_id: null,
      type,
      payload: jsonSafe(payload),
    });
  } catch {
    // noop
  }
}

/** Guardado/chequeo idempotente por event.id (best-effort) */
async function seenOrMarkEvent(admin: ReturnType<typeof getSupabaseAdmin>, eventId: string) {
  try {
    const seen = await admin
      .from('events')
      .select('id')
      .eq('type', 'stripe_event_seen')
      .contains('payload', { event_id: eventId })
      .maybeSingle();

    if (seen.data?.id) return true;

    await admin.from('events').insert({
      type: 'stripe_event_seen',
      payload: { event_id: eventId },
    });
    return false;
  } catch {
    // si falla, no bloqueamos
    return false;
  }
}

/* ───────── Envío de email con PDF al confirmarse el pago ───────── */
async function trySendBookingEmail(
  admin: ReturnType<typeof getSupabaseAdmin>,
  session: Stripe.Checkout.Session,
) {
  try {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) return;

    const to =
      session.customer_details?.email ||
      session.customer_email ||
      '';
    if (!to) return;

    // Idempotencia: ¿ya enviamos para esta sesión?
    const already = await admin
      .from('events')
      .select('id')
      .eq('type', 'invoice_sent')
      .contains('payload', { session_id: session.id })
      .maybeSingle();
    if (already.data) return;

    const md = (session.metadata || {}) as Record<string, string | undefined>;
    const tourTitle = md.tour_title || 'Tour KCE';
    const tourDate = md.date || null;
    const qty = Number(md.quantity || 1) || 1;

    const createdISO = new Date(
      ((session.created ?? Math.floor(Date.now() / 1000)) * 1000)
    ).toISOString();

    const currency = (session.currency || 'usd').toUpperCase();
    const amountFmt = formatAmountFromMinor(session.amount_total ?? null, currency);

    // PDF con logo y QR
    const pdfBuffer = await buildInvoicePdf(
      {
        bookingId: session.id,
        createdAtISO: createdISO,
        customerName: session.customer_details?.name || null,
        customerEmail: to,
        tourTitle,
        tourDate,
        persons: qty,
        totalMinor: session.amount_total ?? null,
        currency,
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

    const filename = buildInvoiceFileName(tourTitle, new Date(createdISO));

    const fromAddr = (process.env.EMAIL_FROM || '').trim() || 'KCE <onboarding@resend.dev>';
    const replyTo = process.env.EMAIL_REPLY_TO || undefined;

    const subject =
      `KCE — Confirmación de reserva` +
      (tourTitle ? `: ${tourTitle}` : '') +
      (tourDate ? ` (${tourDate})` : '');

    const lines = [
      '¡Gracias por tu reserva con KCE!',
      tourTitle && `• Tour: ${tourTitle}`,
      tourDate && `• Fecha: ${tourDate}`,
      qty && `• Personas: ${qty}`,
      amountFmt && `• Monto: ${amountFmt}`,
    ].filter(Boolean) as string[];

    const text = [
      'Te confirmamos tu experiencia con Knowing Cultures Enterprise.',
      ...lines,
      '',
      `Gestiona tu reserva: ${BASE_URL}/booking/${session.id}`,
      'Si necesitas ajustar algo, responde este correo o abre el chat en la web.',
      '— Equipo Knowing Cultures Enterprise',
    ].join('\n');

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5;color:#111827">
        <h1 style="margin:0 0 8px 0;color:#0D5BA1;font-weight:700;font-size:22px">¡Gracias por tu reserva!</h1>
        <p>Te confirmamos tu experiencia con Knowing Cultures Enterprise.</p>
        <ul style="padding-left:16px;margin:8px 0">
          ${tourTitle ? `<li><strong>Tour:</strong> ${tourTitle}</li>` : ''}
          ${tourDate ? `<li><strong>Fecha:</strong> ${tourDate}</li>` : ''}
          ${qty ? `<li><strong>Personas:</strong> ${qty}</li>` : ''}
          ${amountFmt ? `<li><strong>Monto:</strong> ${amountFmt}</li>` : ''}
        </ul>
        <p>Gestiona tu reserva: <a href="${BASE_URL}/booking/${session.id}" target="_blank" rel="noreferrer">${BASE_URL}/booking/${session.id}</a></p>
        <p>Si necesitas ajustar algo, responde este correo o abre el chat en la web.</p>
        <p style="margin-top:16px">— Equipo Knowing Cultures Enterprise</p>
      </div>`.trim();

    const resend = new Resend(RESEND_API_KEY);
    const sendRes = await resend.emails.send({
      from: fromAddr,
      to,
      subject,
      text,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
      attachments: [{ filename, content: pdfBuffer.toString('base64'), contentType: 'application/pdf' }],
    });

    if (sendRes.error) {
      console.warn('[webhook] email send error:', sendRes.error);
      await logEvent(admin, 'invoice_send_error', { session_id: session.id, email: to, error: String(sendRes.error?.message || sendRes.error) });
      return;
    }

    await logEvent(admin, 'invoice_sent', { session_id: session.id, email: to });
  } catch (err) {
    console.warn('[webhook] trySendBookingEmail failed:', err);
    try {
      const sessionId = (err as any)?.session?.id ?? null;
      await logEvent(admin, 'invoice_send_exception', { session_id: sessionId, error: String(err) });
    } catch {}
  }
}

/* ───────────────── handler ───────────────── */

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!webhookSecret || !stripeKey) {
    if (isProd) return json({ error: 'Stripe env not set' }, 500);
    // En dev: permite probar el endpoint sin firma
    return json({ received: true, skipped: true }, 200);
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) return json({ error: 'Missing stripe-signature' }, 400);

  // Cuerpo crudo requerido para verificar la firma
  const rawBody = await req.text();

  const stripe = getStripe();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid signature';
    console.error('[stripe] signature error:', message);
    return json({ error: message }, 400);
  }

  const admin = getSupabaseAdmin();

  // Idempotencia por event.id (best-effort, evita doble proceso en reintentos)
  const seen = await seenOrMarkEvent(admin, event.id);
  if (seen) {
    return json({ received: true, duplicate: true, event_id: event.id });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const bookingId = await upsertBookingFromSession(admin, session);
        await logEvent(admin, 'stripe_checkout_completed', {
          event_id: event.id,
          booking_id: bookingId,
          session_id: session.id,
          amount_total: session.amount_total ?? null,
          currency: session.currency ?? null,
          livemode: session.livemode ?? null,
        });
        await trySendBookingEmail(admin, session);
        break;
      }

      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session;
        const bookingId = await upsertBookingFromSession(admin, session);
        await logEvent(admin, 'stripe_checkout_async_succeeded', {
          event_id: event.id,
          booking_id: bookingId,
          session_id: session.id,
        });
        await trySendBookingEmail(admin, session);
        break;
      }

      case 'checkout.session.async_payment_failed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await logEvent(admin, 'stripe_checkout_async_failed', {
          event_id: event.id,
          session_id: session.id,
          last_payment_error: (session as any)?.last_payment_error ?? null,
        });
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.id) {
          await updateBookingStatusBySessionId(admin, session.id, 'canceled');
        }
        await logEvent(admin, 'stripe_checkout_expired', {
          event_id: event.id,
          session_id: session.id,
        });
        break;
      }

      // Fallback por si no llega el evento de checkout (raro, pero útil)
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        try {
          const list = await getStripe().checkout.sessions.list({ payment_intent: pi.id, limit: 1 });
          const sess = list.data?.[0];
          if (sess?.id) {
            const bookingId = await upsertBookingFromSession(admin, sess);
            await logEvent(admin, 'stripe_pi_succeeded_linked', {
              event_id: event.id,
              pi_id: pi.id,
              booking_id: bookingId,
              session_id: sess.id,
            });
            await trySendBookingEmail(admin, sess);
          } else {
            await logEvent(admin, 'stripe_pi_succeeded_unlinked', {
              event_id: event.id,
              pi_id: pi.id,
            });
          }
        } catch (e) {
          await logEvent(admin, 'stripe_pi_succeeded_lookup_error', {
            event_id: event.id,
            pi_id: pi.id,
            error: String(e),
          });
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        await logEvent(admin, 'stripe_pi_failed', {
          event_id: event.id,
          pi_id: pi.id,
          last_payment_error: pi.last_payment_error ?? null,
        });
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const piId =
          typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : charge.payment_intent?.id;

        if (piId) {
          const sessions = await getStripe().checkout.sessions.list({ payment_intent: piId, limit: 1 });
          const sess = sessions.data?.[0];
          if (sess?.id) {
            await updateBookingStatusBySessionId(admin, sess.id, 'canceled');
            await logEvent(admin, 'stripe_charge_refunded', {
              event_id: event.id,
              session_id: sess.id,
              charge_id: charge.id,
              amount_refunded: charge.amount_refunded,
              currency: charge.currency,
            });
          } else {
            await logEvent(admin, 'stripe_charge_refunded_orphan', {
              event_id: event.id,
              charge_id: charge.id,
              payment_intent: piId,
            });
          }
        }
        break;
      }

      default: {
        await logEvent(admin, 'stripe_unhandled_event', {
          event_id: event.id,
          type: event.type,
        });
        break;
      }
    }
  } catch (err) {
    console.error('[stripe] webhook handler error:', err);
    // En prod → 500 para que Stripe reintente; en dev → 200 para no bloquear
    return isProd ? json({ error: 'Handler failure' }, 500) : json({ received: true, dev: true });
  }

  return json({ received: true });
}

// Opcional: healthcheck rápido (útil en despliegues)
export async function GET() {
  return json({ ok: true, env: { webhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET), key: Boolean(process.env.STRIPE_SECRET_KEY) } });
}
