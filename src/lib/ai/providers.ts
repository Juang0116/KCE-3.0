// src/features/ai/providers.ts
import { serverEnv } from '@/lib/env';

/* ─────────────────────────────────────────────────────────────
 *  Minimal, robust AI client (OpenAI + Gemini) con failover.
 *  - Tipado estricto
 *  - Timeouts y errores claros
 *  - Sanitiza y normaliza la salida a `string`
 *  - Mantiene API: `generate(args): Promise<string>`
 *  Sincrónico, profesional, moderno y futurista ✨
 * ──────────────────────────────────────────────────────────── */

export type Role = 'user' | 'assistant' | 'system';
export type ChatMessage = { role: Role; content: string };

export type GenArgs = {
  system?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
};

export type AIProvider = 'gemini' | 'openai';

const primary: AIProvider = (serverEnv.AI_PRIMARY as AIProvider) || 'gemini';
const secondary: AIProvider = (serverEnv.AI_SECONDARY as AIProvider) || 'openai';

// Safe read: permite usar una env no tipada en serverEnv sin romper TS
const AI_TIMEOUT_MS = (() => {
  const raw =
    (serverEnv as Record<string, unknown>)['AI_HTTP_TIMEOUT_MS'] ??
    process.env.AI_HTTP_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 15_000;
})();

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const CLEAN_FALLBACK =
  'Estoy aquí para ayudarte. ¿Qué experiencia en Colombia te gustaría explorar?';

/* ========================== Utils ========================== */

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = AI_TIMEOUT_MS,
): Promise<any> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });

    if (!res.ok) {
      // Intenta leer payload de error si existe
      let errText = `${res.status} ${res.statusText}`;
      try {
        const e = await res.json();
        errText = e?.error?.message || e?.message || errText;
      } catch {
        /* noop */
      }
      throw new Error(errText);
    }

    try {
      return await res.json();
    } catch {
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error('Respuesta no válida del proveedor');
      }
    }
  } finally {
    clearTimeout(id);
  }
}

function normalizeOut(s: unknown): string {
  if (typeof s !== 'string') return CLEAN_FALLBACK;
  const t = s.replace(/\u0000/g, '').trim();
  return t.length > 0 ? t : CLEAN_FALLBACK;
}

function sanitizeMessages(msgs: ChatMessage[]): ChatMessage[] {
  return msgs
    .map((m) => ({
      role: m.role,
      content: String(m.content ?? '').slice(0, 16_000), // cap defensivo de input
    }))
    .filter((m) => m.content.trim().length > 0);
}

function providerEnabled(p: AIProvider): boolean {
  if (p === 'openai') return Boolean(serverEnv.OPENAI_API_KEY);
  if (p === 'gemini') return Boolean(serverEnv.GEMINI_API_KEY);
  return false;
}

/* ========================== OpenAI ========================== */

async function callOpenAI({
  system,
  messages,
  maxTokens = 800,
  temperature = 0.5,
}: GenArgs): Promise<string> {
  const key = serverEnv.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing');

  const base = (serverEnv.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = serverEnv.OPENAI_MODEL || 'gpt-4o-mini';

  const body = {
    model,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...sanitizeMessages(messages),
    ],
    temperature,
    max_tokens: clamp(Math.floor(maxTokens), 1, 8192),
  };

  const json = await fetchJsonWithTimeout(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  const content =
    json?.choices?.[0]?.message?.content ??
    json?.choices?.[0]?.text ?? // por si algún gateway devuelve "text"
    '';

  const out = normalizeOut(content);
  if (!out || out === CLEAN_FALLBACK) {
    throw new Error('OpenAI devolvió contenido vacío');
  }
  return out;
}

/* ========================== Gemini ========================== */

async function callGemini({
  system,
  messages,
  maxTokens = 800,
  temperature = 0.5,
}: GenArgs): Promise<string> {
  const key = serverEnv.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY missing');

  const base = (serverEnv.GEMINI_API_URL || 'https://generativelanguage.googleapis.com').replace(
    /\/+$/,
    '',
  );
  const model = serverEnv.GEMINI_MODEL || 'gemini-1.5-flash-latest';

  // Estrategia simple y robusta: aplanamos la conversación en un único prompt
  const parts: string[] = [];
  if (system) parts.push(`SYSTEM:\n${system}`);
  for (const m of sanitizeMessages(messages)) {
    parts.push(`${m.role.toUpperCase()}:\n${m.content}`);
  }

  const body = {
    contents: [{ role: 'user', parts: [{ text: parts.join('\n\n') }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: clamp(Math.floor(maxTokens), 1, 8192),
    },
  };

  const json = await fetchJsonWithTimeout(
    `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(
      key,
    )}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    },
  );

  const text =
    json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? '').join('') ??
    json?.candidates?.[0]?.content?.parts?.[0]?.text ??
    '';

  const out = normalizeOut(text);
  if (!out || out === CLEAN_FALLBACK) {
    throw new Error('Gemini devolvió contenido vacío');
  }
  return out;
}

/* ========================== Orquestador ========================== */

/**
 * Intenta en orden `AI_PRIMARY` → `AI_SECONDARY`.
 * - Si un proveedor no tiene API key, se lo salta.
 * - Si el primero falla o devuelve vacío, cae al segundo.
 * - Devuelve CLEAN_FALLBACK si todos fallan.
 */
export async function generate(args: GenArgs): Promise<string> {
  // Orden preferido sin duplicados
  const order: AIProvider[] = [primary, secondary].filter(
    (p, idx, arr) => arr.indexOf(p) === idx,
  );

  let lastErr: unknown;

  for (const provider of order) {
    if (!providerEnabled(provider)) {
      lastErr = new Error(`${provider} API key missing`);
      continue;
    }

    try {
      const out = provider === 'gemini' ? await callGemini(args) : await callOpenAI(args);
      if (out && out !== CLEAN_FALLBACK) return out;
      lastErr = new Error(`${provider} devolvió contenido vacío`);
    } catch (e) {
      lastErr = e;
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn(`[AI.generate] error en proveedor ${provider}:`, e);
      }
    }
  }

  if (process.env.NODE_ENV !== 'production' && lastErr) {
    // eslint-disable-next-line no-console
    console.warn('[AI.generate] failover agotado, usando fallback:', lastErr);
  }

  return CLEAN_FALLBACK;
}
