// src/app/api/ai/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

// 👇 IMPORTAMOS EL CATÁLOGO MOCK DE KCE
import { TOURS, CITIES } from '@/features/tours/data.mock';

export const runtime = 'edge';
export const maxDuration = 25; // Vercel Edge sugerido

/* ─────────────────────────────────────────────────────────────
   Config por entorno (normalizada con defaults seguros)
   ───────────────────────────────────────────────────────────── */
const OPENAI_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').trim();
const OPENAI_MODEL_DEFAULT =
  (process.env.OPENAI_MODEL || process.env.NEXT_PUBLIC_AI_MODEL || 'gpt-4o-mini').trim();

const GEMINI_URL = (process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com').trim();
const GEMINI_MODEL_DEFAULT =
  (process.env.GEMINI_MODEL || process.env.NEXT_PUBLIC_AI_MODEL || 'gemini-1.5-flash').trim();

type Provider = 'gemini' | 'openai';
const normalizeProvider = (v?: string | null): Provider | null => {
  const s = String(v || '').trim().toLowerCase();
  return s === 'gemini' || s === 'openai' ? s : null;
};

const AI_PRIMARY = normalizeProvider(process.env.AI_PRIMARY) ?? 'gemini';
const AI_SECONDARY = normalizeProvider(process.env.AI_SECONDARY) ?? 'openai';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-AI-Provider, X-Locale, X-Hint',
} as const;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  ...CORS_HEADERS,
} as const;

/* ─────────────────────────────────────────────────────────────
   Catálogo para el prompt de sistema
   ───────────────────────────────────────────────────────────── */

// Ciudades únicas legibles para humanos
const TOUR_CITIES_FOR_PROMPT = Array.from(new Set(CITIES.filter(Boolean))).join(', ');

// Resumen corto de tours para el modelo (no muy largo)
const TOUR_SUMMARY_FOR_PROMPT = TOURS.map((t) => {
  const city = t.city || 'Colombia';
  const hours = t.durationHours ? `${t.durationHours}h` : '';
  const price =
    typeof t.price === 'number'
      ? `${t.price.toLocaleString('es-CO')} COP`
      : 'precio a consultar';

  const meta = [city, hours].filter(Boolean).join(' • ');
  return `- ${t.title} — ${meta ? `${meta} • ` : ''}desde ${price}`;
}).join('\n');

/* ─────────────────────────────────────────────────────────────
   Zod: validación del cuerpo
   ───────────────────────────────────────────────────────────── */
const MsgSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1),
});

const Body = z.object({
  messages: z.array(MsgSchema).min(1).max(50),
  hint: z.string().max(280).optional(),
  locale: z.string().max(10).optional(),
  // overrides opcionales
  maxTokens: z.number().int().min(16).max(4096).optional(),
  temperature: z.number().min(0).max(2).optional(),
  model: z.string().min(1).max(100).optional(),
  provider: z.enum(['gemini', 'openai']).optional(), // opcional: forzar proveedor en body
});

/* ─────────────────────────────────────────────────────────────
   Utils
   ───────────────────────────────────────────────────────────── */
function json(
  data: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...(extraHeaders || {}) },
  });
}

function sanitizeHistory(incoming: z.infer<typeof MsgSchema>[]) {
  // no pasamos mensajes de system del cliente; nosotros generamos el nuestro
  const filtered = incoming.filter((m) => m.role !== 'system');
  const last = filtered.slice(-16).map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content.slice(0, 4000),
  }));
  return last.filter((m) => m.content.trim().length > 0);
}

function toGeminiContents(history: Array<{ role: 'user' | 'assistant'; content: string }>) {
  return history.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}

function detectLocale(req: NextRequest, explicit?: string | null) {
  if (explicit && explicit.trim()) return explicit.trim();
  const h =
    req.headers.get('x-locale') ||
    (req.headers.get('accept-language') || '').split(',')[0] ||
    '';
  return h.trim() || 'es-CO';
}

/**
 * Prompt de sistema alineado con:
 * - Marca KCE
 * - Catálogo real de tours (mock)
 * - Foco en seguridad, cultura y claridad
 */
function buildSystemPrompt(locale?: string, hint?: string) {
  const baseLines = [
    'Eres el AI Travel Planner de KCE (Knowing Cultures Enterprise), una empresa de turismo cultural en Colombia.',
    `Trabajas con un catálogo pequeño y curado de experiencias en ciudades como: ${TOUR_CITIES_FOR_PROMPT}.`,
    'Tu objetivo es ayudar al viajero a elegir entre estas experiencias, combinarlas en itinerarios y aclarar dudas, siempre de forma clara y honesta.',

    'Catálogo actual (resumen):',
    TOUR_SUMMARY_FOR_PROMPT,

    'Reglas clave:',
    '1) Antes de recomendar, haz entre 3 y 6 preguntas clave: fechas, número de personas, ciudad base, intereses (café, cultura, naturaleza, playa), presupuesto aproximado y nivel de actividad física.',
    '2) Cuando hables de productos de KCE, usa SOLO tours del catálogo anterior. Puedes combinarlos en planes de 1–7 días, pero no inventes tours nuevos con precio y reserva directa.',
    '3) Puedes sugerir lugares adicionales (barrios, miradores, restaurantes, plazas), pero preséntalos como recomendaciones generales del destino, no como productos KCE con reserva directa.',
    '4) No inventes disponibilidad ni precios exactos. Usa expresiones como "desde" o "aprox." y aclara que la confirmación final se hace en el checkout o por chat con una persona del equipo KCE.',
    '5) Prioriza siempre la seguridad del viajero: menciona horarios recomendados, zonas más seguras y la importancia de seguir indicaciones del equipo local.',
    '6) Mantén el tono cercano, profesional y empático: el viajero debe sentir que habla con un anfitrión local experto.',
  ];

  const langLine = locale?.toLowerCase().startsWith('en')
    ? 'Respond in English if the user writes in English. Be clear, friendly and culturally informative. Avoid slang that could confuse non-native speakers.'
    : 'Responde en español de forma clara, cercana y profesional. Si el usuario escribe en inglés, puedes responderle en inglés con la misma calidad y detalle.';

  const hintLine = hint ? `Nota adicional de contexto del sistema: ${hint}` : '';

  return [...baseLines, langLine, hintLine].filter(Boolean).join('\n\n');
}

function providerOrder(force?: Provider | '' | null): Provider[] {
  if (force && normalizeProvider(force)) return [force as Provider];
  return Array.from(new Set<Provider>([AI_PRIMARY, AI_SECONDARY].filter(Boolean) as Provider[]));
}

/* ─────────────────────────────────────────────────────────────
   Providers
   ───────────────────────────────────────────────────────────── */
async function callGemini(args: {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  signal: AbortSignal;
  maxTokens?: number;
  temperature?: number;
}): Promise<{ content: string; model: string }> {
  const { apiKey, baseUrl, model, systemPrompt, history, signal, maxTokens, temperature } = args;
  const url = `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const payload = {
    contents: toGeminiContents(history),
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature: typeof temperature === 'number' ? temperature : 0.7,
      candidateCount: 1,
      ...(typeof maxTokens === 'number' ? { maxOutputTokens: maxTokens } : {}),
    },
  };

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!r.ok) throw new Error(`gemini ${r.status}`);
  const data = (await r.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    modelVersion?: string;
  };

  const content =
    data?.candidates?.[0]?.content?.parts
      ?.map((p) => (p?.text ?? '').trim())
      .filter(Boolean)
      .join('\n\n') ?? '';

  if (!content) throw new Error('gemini empty');
  return { content, model };
}

async function callOpenAI(args: {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  signal: AbortSignal;
  maxTokens?: number;
  temperature?: number;
}): Promise<{ content: string; model: string }> {
  const { apiKey, baseUrl, model, systemPrompt, history, signal, maxTokens, temperature } = args;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(({ role, content }) => ({ role, content })),
  ];

  const body: Record<string, unknown> = {
    model,
    temperature: typeof temperature === 'number' ? temperature : 0.7,
    messages,
    ...(typeof maxTokens === 'number' ? { max_tokens: maxTokens } : {}),
  };

  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!r.ok) throw new Error(`openai ${r.status}`);
  const data = (await r.json()) as {
    choices?: { message?: { content?: string } }[];
    model?: string;
  };

  const content = data?.choices?.[0]?.message?.content?.trim() ?? '';
  if (!content) throw new Error('openai empty');
  return { content, model: data?.model || model };
}

/* ─────────────────────────────────────────────────────────────
   GET (health)
   ───────────────────────────────────────────────────────────── */
export async function GET() {
  const reqId = crypto.randomUUID();
  const headers = {
    'X-Powered-By': 'KCE-AI',
    'X-Request-ID': reqId,
  };

  return json(
    {
      ok: true,
      primary: AI_PRIMARY,
      secondary: AI_SECONDARY,
      defaults: {
        openai: OPENAI_MODEL_DEFAULT,
        gemini: GEMINI_MODEL_DEFAULT,
      },
      configured: {
        openai: Boolean((process.env.OPENAI_API_KEY || '').trim()),
        gemini: Boolean((process.env.GEMINI_API_KEY || '').trim()),
      },
    },
    200,
    headers,
  );
}

/* ─────────────────────────────────────────────────────────────
   OPTIONS (CORS preflight)
   ───────────────────────────────────────────────────────────── */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/* ─────────────────────────────────────────────────────────────
   POST (chat)
   ───────────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  const reqId = crypto.randomUUID();

  // Forzar proveedor por query/header/body
  const { searchParams } = new URL(req.url);
  const forceFromQueryOrHeader =
    (searchParams.get('provider') ?? req.headers.get('x-ai-provider') ?? '')
      .toLowerCase()
      .trim() as Provider | '' | null;

  const openaiKey = (process.env.OPENAI_API_KEY || '').trim();
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();

  // Validación body
  let parsed: z.infer<typeof Body>;
  try {
    const raw = await req.json();
    const check = Body.safeParse(raw);
    if (!check.success) {
      return json(
        { error: 'Invalid body', details: check.error.flatten(), requestId: reqId },
        400,
        { 'X-Request-ID': reqId },
      );
    }
    parsed = check.data;
  } catch {
    return json({ error: 'Invalid JSON', requestId: reqId }, 400, { 'X-Request-ID': reqId });
  }

  // Locale e hint: permiten override por headers también
  const headerHint = (req.headers.get('x-hint') || '').trim();
  const locale = detectLocale(req, parsed.locale);
  const hint = parsed.hint || headerHint || undefined;

  const systemPrompt = buildSystemPrompt(locale, hint);
  const history = sanitizeHistory(parsed.messages);

  // Orden de proveedores
  const order = providerOrder(parsed.provider ?? forceFromQueryOrHeader);
  if (order.length === 0) {
    return json(
      { error: 'No provider configured', requestId: reqId },
      503,
      { 'X-Request-ID': reqId },
    );
  }

  // Cancelación y timeout
  const controller = new AbortController();
  const timeoutMs = 25_000;
  const t0 = Date.now();
  const kill = setTimeout(() => controller.abort(), timeoutMs);

  // Seguimiento de intentos (futurista: tiempos por intento)
  const attempts: Array<{ provider: Provider; ok: boolean; ms: number; error?: string }> = [];

  try {
    for (const prov of order) {
      const start = Date.now();
      try {
        if (prov === 'gemini') {
          if (!geminiKey) {
            attempts.push({ provider: prov, ok: false, ms: Date.now() - start, error: 'gemini key missing' });
            continue;
          }

          const mdl = (parsed.model || GEMINI_MODEL_DEFAULT).trim();
          const { content, model: usedModel } = await callGemini({
            apiKey: geminiKey,
            baseUrl: GEMINI_URL,
            model: mdl,
            systemPrompt,
            history,
            signal: controller.signal,
            ...(typeof parsed.maxTokens === 'number' ? { maxTokens: parsed.maxTokens } : {}),
            ...(typeof parsed.temperature === 'number' ? { temperature: parsed.temperature } : {}),
          });

          attempts.push({ provider: prov, ok: true, ms: Date.now() - start });
          return json(
            {
              content,
              provider: 'gemini',
              model: usedModel,
              locale,
              ms: Date.now() - t0,
              attempts,
              requestId: reqId,
            },
            200,
            {
              'X-Request-ID': reqId,
              'X-AI-Provider': 'gemini',
              'X-AI-Model': usedModel,
              'X-Powered-By': 'KCE-AI',
            },
          );
        } else {
          if (!openaiKey) {
            attempts.push({ provider: prov, ok: false, ms: Date.now() - start, error: 'openai key missing' });
            continue;
          }

          const mdl = (parsed.model || OPENAI_MODEL_DEFAULT).trim();
          const { content, model: usedModel } = await callOpenAI({
            apiKey: openaiKey,
            baseUrl: OPENAI_URL,
            model: mdl,
            systemPrompt,
            history,
            signal: controller.signal,
            ...(typeof parsed.maxTokens === 'number' ? { maxTokens: parsed.maxTokens } : {}),
            ...(typeof parsed.temperature === 'number' ? { temperature: parsed.temperature } : {}),
          });

          attempts.push({ provider: prov, ok: true, ms: Date.now() - start });
          return json(
            {
              content,
              provider: 'openai',
              model: usedModel,
              locale,
              ms: Date.now() - t0,
              attempts,
              requestId: reqId,
            },
            200,
            {
              'X-Request-ID': reqId,
              'X-AI-Provider': 'openai',
              'X-AI-Model': usedModel,
              'X-Powered-By': 'KCE-AI',
            },
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        attempts.push({ provider: prov, ok: false, ms: Date.now() - start, error: msg });
        // sigue con el siguiente proveedor
      }
    }

    // Si ninguno respondió
    return json(
      { error: 'AI request failed', attempts, ms: Date.now() - t0, requestId: reqId },
      502,
      { 'X-Request-ID': reqId },
    );
  } catch (e) {
    const aborted = controller.signal.aborted;
    return json(
      {
        error: aborted ? 'Request timed out' : e instanceof Error ? e.message : 'Unknown error',
        attempts,
        ms: Date.now() - t0,
        requestId: reqId,
      },
      aborted ? 504 : 500,
      { 'X-Request-ID': reqId },
    );
  } finally {
    clearTimeout(kill);
  }
}
