// src/app/api/itinerary-builder/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
// Opcional (para upsells desde tu catálogo). Si no quieres depender del mock en Edge, comenta:
import { TOURS } from '@/features/tours/data.mock';
import { SITE_URL } from '@/lib/env';

export const runtime = 'edge';
export const maxDuration = 25;

/* ─────────────────────────────────────────────────────────────
   Provider config (env + defaults)
   ───────────────────────────────────────────────────────────── */
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').trim();
const OPENAI_MODEL     = (process.env.OPENAI_MODEL ?? process.env.NEXT_PUBLIC_AI_MODEL ?? 'gpt-4o-mini').trim();
const OPENAI_API_KEY   = (process.env.OPENAI_API_KEY ?? '').trim();

const GEMINI_API_URL = (process.env.GEMINI_API_URL ?? 'https://generativelanguage.googleapis.com').trim();
const GEMINI_MODEL   = (process.env.GEMINI_MODEL ?? 'gemini-1.5-flash-latest').trim();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY ?? '').trim();

type Provider = 'gemini' | 'openai';
const AI_PRIMARY   = ((process.env.AI_PRIMARY   ?? 'gemini').toLowerCase()  as Provider);
const AI_SECONDARY = ((process.env.AI_SECONDARY ?? 'openai').toLowerCase()  as Provider);

/* ─────────────────────────────────────────────────────────────
   CORS / JSON helpers
   ───────────────────────────────────────────────────────────── */
const allowOrigin =
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  SITE_URL ||
  '*';

const corsHeaders: HeadersInit = {
  'Access-Control-Allow-Origin': allowOrigin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-AI-Provider',
  'Access-Control-Expose-Headers': 'X-Provider, X-Elapsed-MS',
};

const json = (data: unknown, status = 200, extra: HeadersInit = {}) =>
  new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders,
      ...extra,
    },
  });

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/* ─────────────────────────────────────────────────────────────
   Utils de fecha / inputs
   ───────────────────────────────────────────────────────────── */
function isValidISODate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00`);
  return !Number.isNaN(d.getTime());
}
function isTodayOrFuture(date: string) {
  const d = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d >= today;
}
function withinNextMonths(date: string, months = 18) {
  const d = new Date(`${date}T00:00:00`);
  const max = new Date();
  max.setMonth(max.getMonth() + months);
  return d <= max;
}
function sanitizeInterests(list: string[]) {
  const norm = list.map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 6);
  return Array.from(new Set(norm));
}

/* ─────────────────────────────────────────────────────────────
   Zod Schemas: entrada y salida
   ───────────────────────────────────────────────────────────── */
const Body = z.object({
  city: z.string().min(2),
  days: z.number().int().min(1).max(5),
  date: z.string(),
  interests: z.array(z.string()).max(6),
  budget: z.enum(['low', 'mid', 'high']).default('mid'),
  // Campos opcionales para análisis/segmentación
  pax: z.number().int().min(1).max(20).optional(),
  locale: z.string().max(10).optional(),           // p.ej. 'es-CO' | 'en-US'
  language: z.string().max(5).optional(),          // p.ej. 'es' | 'en'
  pace: z.enum(['relax', 'balanced', 'intense']).optional(),
});

const PlanSchema = z.object({
  city: z.string(),
  startDate: z.string(),
  days: z.number().int().min(1),
  budgetTier: z.enum(['low', 'mid', 'high']),
  budgetCOPPerPersonPerDay: z.object({
    min: z.number().int().nonnegative(),
    max: z.number().int().nonnegative(),
  }),
  itinerary: z.array(
    z.object({
      day: z.number().int().min(1),
      date: z.string(),
      title: z.string(),
      summary: z.string(),
      blocks: z.array(
        z.object({
          time: z.string(),
          title: z.string(),
          neighborhood: z.string().optional(),
          description: z.string(),
          approx_cost_cop: z.number().int().nonnegative().optional(),
          booking_hint: z.string().optional(),
        }),
      ),
      safety: z.string(),
      tips: z.string().optional(),
    }),
  ),
  totals: z.object({ approx_total_cop_per_person: z.number().int().nonnegative() }),
  cta: z
    .object({
      message: z.string(),
      tours: z.array(z.object({ title: z.string(), url: z.string().url() })).max(3).optional(),
    })
    .optional(),
});

/** Bloque extra de Marketing y Growth */
const MarketingSchema = z.object({
  audience: z.object({
    persona: z.string(),                          // p.ej. “Pareja foodie”, “Familia con niños”
    interestsRanked: z.array(z.string()).max(10), // intereses ordenados
    tone: z.enum(['amigable', 'premium', 'experto', 'aventurero', 'familiar']).optional(),
  }),
  copy: z.object({
    headline: z.string(),
    subhead: z.string(),
    emailSubject: z.string(),
    emailPreview: z.string(),
    whatsapp: z.string(),
    seoKeywords: z.array(z.string()).max(12),
  }),
  experiments: z
    .array(
      z.object({
        hypothesis: z.string(),
        metric: z.string(),        // p.ej. CTR, CVR, Reply rate…
        variantA: z.string(),
        variantB: z.string(),
      }),
    )
    .max(4)
    .optional(),
  upsells: z.array(z.object({ title: z.string(), url: z.string().url() })).max(5).optional(),
});

/** Respuesta: plan + marketing */
const OutSchema = z.object({
  plan: PlanSchema,
  marketing: MarketingSchema,
});

/* ─────────────────────────────────────────────────────────────
   Inferencias ligeras (persona, tono, upsells)
   ───────────────────────────────────────────────────────────── */
function inferPersona(pax?: number, interests: string[] = []) {
  if ((pax ?? 1) >= 4 && interests.includes('niños')) return 'Familia con niños';
  if ((pax ?? 1) === 2 && (interests.includes('romance') || interests.includes('vino')))
    return 'Pareja exploradora';
  if (interests.includes('gastronomía') || interests.includes('food')) return 'Foodie';
  if (interests.includes('museos') || interests.includes('arte')) return 'Cultural';
  if (interests.includes('senderismo') || interests.includes('naturaleza')) return 'Aventura';
  return (pax ?? 1) > 1 ? 'Amigos en plan urbano' : 'Viajero solo';
}

function defaultTone(persona: string): 'amigable' | 'premium' | 'experto' | 'aventurero' | 'familiar' {
  if (persona.includes('Familia')) return 'familiar';
  if (persona.includes('Pareja')) return 'premium';
  if (persona.includes('Foodie')) return 'experto';
  if (persona.includes('Aventura')) return 'aventurero';
  return 'amigable';
}

function siteBaseUrl() {
  return (SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

function pickUpsellsFromTours(limit = 3) {
  const base = siteBaseUrl();
  try {
    return TOURS.slice(0, limit).map((t) => ({
      title: t.title,
      url: `${base}/tours/${encodeURIComponent(t.slug)}`,
    }));
  } catch {
    return [] as Array<{ title: string; url: string }>;
  }
}

/* ─────────────────────────────────────────────────────────────
   Providers (JSON strict)
   ───────────────────────────────────────────────────────────── */
async function callGeminiJSON({
  system,
  payloadJSON,
  signal,
}: {
  system: string;
  payloadJSON: object;
  signal: AbortSignal;
}) {
  if (!GEMINI_API_KEY) throw new Error('no_gemini_key');

  const url = `${GEMINI_API_URL}/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(payloadJSON) }] }],
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 1400,
      response_mime_type: 'application/json', // snake_case
      responseMimeType: 'application/json',   // camelCase (fallback)
    },
  };

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!r.ok) throw new Error(`gemini_${r.status}`);
  const data = (await r.json()) as any;
  const raw =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
      .filter(Boolean)
      .join('') ?? '';
  if (!raw) throw new Error('gemini_empty');
  return raw as string;
}

async function callOpenAIJSON({
  system,
  payloadJSON,
  signal,
}: {
  system: string;
  payloadJSON: object;
  signal: AbortSignal;
}) {
  if (!OPENAI_API_KEY) throw new Error('no_openai_key');

  const messages = [
    { role: 'system' as const, content: system },
    { role: 'user'   as const, content: JSON.stringify(payloadJSON) },
  ];

  const attempt = async (useJsonMode: boolean) => {
    const body: Record<string, unknown> = {
      model: OPENAI_MODEL,
      temperature: 0.6,
      messages,
    };
    if (useJsonMode) body.response_format = { type: 'json_object' as const };

    const r = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!r.ok) throw new Error(`openai_${r.status}${useJsonMode ? '_json' : ''}`);
    const data = (await r.json()) as any;
    const raw = data?.choices?.[0]?.message?.content ?? '';
    if (!raw) throw new Error('openai_empty');
    return raw as string;
  };

  try {
    return await attempt(true);   // JSON estricto
  } catch {
    return await attempt(false);  // Fallback sin response_format
  }
}

/* ─────────────────────────────────────────────────────────────
   Handler principal
   ───────────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  const force = ((new URL(req.url).searchParams.get('provider') ??
    req.headers.get('x-ai-provider') ??
    '') as string)
    .toLowerCase()
    .trim() as Provider | '';

  let body: unknown = null;
  try { body = await req.json(); } catch { /* no-op */ }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return json({ error: 'Invalid body', details: parsed.error.flatten() }, 400);
  }
  const input = parsed.data;

  // Validaciones de fecha
  if (
    !isValidISODate(input.date) ||
    !isTodayOrFuture(input.date) ||
    !withinNextMonths(input.date, 18)
  ) {
    return json(
      { error: 'Invalid date. Formato YYYY-MM-DD; hoy o futuro; dentro de 18 meses.' },
      400,
    );
  }

  // Normalización
  const interests = sanitizeInterests(input.interests);
  const persona = inferPersona(input.pax, interests);
  const tone = defaultTone(persona);

  // Tabla de presupuesto (COP por persona/día)
  const BUDGET_TABLE: Record<'low' | 'mid' | 'high', { min: number; max: number; label: string }> = {
    low:  { min: 120_000, max: 220_000, label: 'Bajo'  },
    mid:  { min: 220_000, max: 420_000, label: 'Medio' },
    high: { min: 420_000, max: 720_000, label: 'Alto'  },
  };
  const budgetBand = BUDGET_TABLE[input.budget];

  // Especificación del JSON esperado (clara y sin backticks)
  const planShapeSpec = `
"plan": {
  "city": "string",
  "startDate": "YYYY-MM-DD",
  "days": ${input.days},
  "budgetTier": "${input.budget}",
  "budgetCOPPerPersonPerDay": { "min": ${budgetBand.min}, "max": ${budgetBand.max} },
  "itinerary": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "title": "string",
      "summary": "string",
      "blocks": [
        {
          "time": "09:00",
          "title": "string",
          "neighborhood": "string (optional)",
          "description": "string",
          "approx_cost_cop": 0,
          "booking_hint": "string (optional)"
        }
      ],
      "safety": "string",
      "tips": "string (optional)"
    }
  ],
  "totals": { "approx_total_cop_per_person": 0 },
  "cta": { "message": "string", "tours": [{ "title":"string", "url":"https://..." }] }
}
`.trim();

  const marketingShapeSpec = `
"marketing": {
  "audience": {
    "persona": "${persona}",
    "interestsRanked": ["..."],
    "tone": "${tone}"
  },
  "copy": {
    "headline": "string",
    "subhead": "string",
    "emailSubject": "string",
    "emailPreview": "string",
    "whatsapp": "string breve y útil (puede usar emojis)",
    "seoKeywords": ["kw1","kw2"]
  },
  "experiments": [
    { "hypothesis": "string", "metric": "CTR|CVR|Reply rate", "variantA": "string", "variantB": "string" }
  ],
  "upsells": [{ "title": "string", "url": "https://..." }]
}
`.trim();

  // Prompt de sistema — orientado a OPERACIÓN + MARKETING
  const lang = (input.language ?? (input.locale?.startsWith('en') ? 'en' : 'es')).toLowerCase();
  const system = `
Eres un Travel Planner senior de Knowing Cultures Enterprise (KCE).
Objetivo: generar un itinerario JSON ejecutable y un bloque de marketing para CRM, email y SEO.

Reglas duras:
1) No inventes disponibilidad ni precios exactos; usa aproximados en COP y marca "reserva recomendada" cuando aplique.
2) Bloques de 1–3h con tiempos realistas y zonas reconocibles. Seguridad y tips diarios.
3) Usa lenguaje claro y local, tono ${tone}. Máximo valor cultural y gastronómico.
4) Devuelve SOLO JSON válido (sin texto adicional, sin backticks). Campos exactamente como en la especificación.

Esquema esperado:
{
  ${planShapeSpec},
  ${marketingShapeSpec}
}

Idioma de salida: ${lang === 'en' ? 'English' : 'Spanish'}.
  `.trim();

  const userPayload = {
    city: input.city,
    days: input.days,
    date: input.date,
    interests,
    budget: input.budget,
    pax: input.pax ?? 1,
    pace: input.pace ?? 'balanced',
    language: lang,
    persona_hint: persona,
    tone_hint: tone,
  };

  // Orden de proveedores (failover)
  const order: Provider[] = (force ? [force] : Array.from(new Set([AI_PRIMARY, AI_SECONDARY]))) as Provider[];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const t0 = Date.now();

  let raw = '';
  let chosen: Provider | '' = '';
  let lastErr: unknown = null;

  try {
    for (const prov of order) {
      try {
        raw = prov === 'gemini'
          ? await callGeminiJSON({ system, payloadJSON: userPayload, signal: controller.signal })
          : await callOpenAIJSON({ system, payloadJSON: userPayload, signal: controller.signal });

        chosen = prov;
        if (raw) break;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`[itinerary] ${prov} failed`, e);
        lastErr = e;
        raw = '';
        continue;
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  if (!raw) {
    // eslint-disable-next-line no-console
    console.error('itinerary-builder: all providers failed', lastErr);
    return json({ error: 'AI request failed' }, 502, {
      'X-Provider': chosen || 'none',
      'X-Elapsed-MS': String(Date.now() - t0),
    });
  }

  // Limpieza de fences ```json ... ```
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '');

  // Parseo y validación
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch {
    return json({ error: 'Non-JSON response from provider', provider: chosen, raw: cleaned.slice(0, 8000) }, 502, {
      'X-Provider': chosen,
      'X-Elapsed-MS': String(Date.now() - t0),
    });
  }

  // Caso A: ya viene con shape completo
  const full = OutSchema.safeParse(data);
  if (full.success) {
    if (!full.data.marketing.upsells || full.data.marketing.upsells.length === 0) {
      full.data.marketing.upsells = pickUpsellsFromTours(3);
    }
    return json(
      {
        provider: chosen,
        ms: Date.now() - t0,
        structured: full.data.plan,
        marketing: full.data.marketing,
        diagnostics: { persona, tone, budgetBand: budgetBand.label },
      },
      200,
      { 'X-Provider': chosen, 'X-Elapsed-MS': String(Date.now() - t0) },
    );
  }

  // Caso B: vino solo el plan → lo validamos y añadimos marketing server-side
  const onlyPlan = PlanSchema.safeParse(data);
  if (onlyPlan.success) {
    const upsells = pickUpsellsFromTours(3);
    const marketing = {
      audience: {
        persona,
        interestsRanked: interests,
        tone,
      },
      copy: {
        headline: `Tu plan a medida en ${input.city}`,
        subhead: `En ${input.days} día(s), mezcla perfecta de cultura, comida y seguridad.`,
        emailSubject: `Itinerario KCE — ${input.city} (${input.date})`,
        emailPreview: `Ideas top + reservas recomendadas + tips locales.`,
        whatsapp: `Hola 👋 Te compartimos tu plan para ${input.city} (${input.days} día/s). Incluye comida local, cultura y seguridad. ¿Agendamos?`,
        seoKeywords: [
          `${input.city} itinerary`,
          `${input.city} tour`,
          `qué hacer en ${input.city}`,
          `mejores planes ${input.city}`,
          `tour guiado ${input.city}`,
        ],
      },
      experiments: [
        {
          hypothesis: 'Un headline con beneficios concretos aumenta CTR',
          metric: 'CTR',
          variantA: `Vive lo mejor de ${input.city} en ${input.days} día(s)`,
          variantB: `Tu plan perfecto en ${input.city}: cultura, comida y seguridad`,
        },
        {
          hypothesis: 'CTA con urgencia suave mejora CVR a checkout',
          metric: 'CVR',
          variantA: 'Reservar ahora',
          variantB: 'Asegura tu cupo hoy',
        },
      ],
      upsells,
    };

    return json(
      {
        provider: chosen,
        ms: Date.now() - t0,
        structured: onlyPlan.data,
        marketing,
        diagnostics: { persona, tone, budgetBand: budgetBand.label },
      },
      200,
      { 'X-Provider': chosen, 'X-Elapsed-MS': String(Date.now() - t0) },
    );
  }

  // Último recurso: devolver crudo para depurar (status 200 para no romper UI durante pruebas)
  return json(
    { provider: chosen, ms: Date.now() - t0, error: 'Schema mismatch', raw: cleaned.slice(0, 8000) },
    200,
    { 'X-Provider': chosen, 'X-Elapsed-MS': String(Date.now() - t0) },
  );
}
