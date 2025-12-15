// src/lib/env.ts
import { z } from 'zod';

/** Variables solo servidor / build */
const ServerSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Stripe (server)
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_MOCK: z.string().optional(), // "1", "true", etc. → bool con helper

  // Supabase (server/admin)
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE: z.string().min(1).optional(),

  // OpenAI (server)
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_ORG: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_MODEL: z.string().optional(),

  // Gemini (server)
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().optional(),
  GEMINI_API_URL: z.string().url().optional(),

  // Selector de proveedor IA + timeouts HTTP
  AI_PRIMARY: z.enum(['gemini', 'openai']).optional(),
  AI_SECONDARY: z.enum(['gemini', 'openai']).optional(),
  AI_HTTP_TIMEOUT_MS: z.string().optional(),

  // Email
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_REPLY_TO: z.string().optional(),

  // URLs del sitio (públicas, pero también se leen aquí)
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  NEXT_PUBLIC_BASE_URL: z.string().url().optional(),

  // Robots/SEO flags
  ROBOTS_DISABLE_INDEXING: z.string().optional(),

  // Vercel
  VERCEL_URL: z.string().optional(), // sin protocolo en Vercel (e.g. myapp.vercel.app)
  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
});

/** Variables públicas (cliente) — opcionales para evitar ruido cuando no se usan */
const PublicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(10).optional(),

  NEXT_PUBLIC_AI_MODEL: z.string().optional(),
  NEXT_PUBLIC_GEMINI_MODEL: z.string().optional(),

  // Para SEOProvider y banderas en el cliente
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  NEXT_PUBLIC_VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),

  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
});

const server = ServerSchema.safeParse(process.env);
const pub = PublicSchema.safeParse(process.env);

/* ───── Warnings solo en dev y una sola vez (evita spam con HMR) ───── */
const WARN_KEY = '__KCE_ENV_WARNED__';
const shouldWarn =
  (process.env.NODE_ENV ?? 'development') !== 'production' &&
  process.env[WARN_KEY] !== '1';

if (!server.success && shouldWarn) {
  console.warn('[env] Server env invalid:', server.error.issues);
}
if (!pub.success && shouldWarn) {
  console.warn('[env] Public env invalid:', pub.error.issues);
}
if (shouldWarn) process.env[WARN_KEY] = '1';

export type ServerEnv = z.infer<typeof ServerSchema>;
export type PublicEnv = z.infer<typeof PublicSchema>;

export const serverEnv = Object.freeze((server.success ? server.data : {}) as ServerEnv);
export const publicEnv = Object.freeze((pub.success ? pub.data : {}) as PublicEnv);

/* ───────────────── Helpers ───────────────── */

const TRUEY = new Set(['1', 'true', 'yes', 'on']);

export function boolEnv(v: string | undefined, fallback = false): boolean {
  if (v == null) return fallback;
  return TRUEY.has(String(v).trim().toLowerCase());
}

export function intEnv(v: string | undefined, fallback: number): number {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

export function floatEnv(v: string | undefined, fallback: number): number {
  const n = Number.parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

function ensureProtocol(u: string): string {
  if (!u) return u;
  if (/^https?:\/\//i.test(u)) return u;
  // Vercel expone VERCEL_URL sin protocolo
  return `https://${u}`;
}

function stripTrailingSlash(u: string): string {
  return u.endsWith('/') ? u.slice(0, -1) : u;
}

/* ───────────── Derivados ───────────── */

export const isDev = (serverEnv.NODE_ENV ?? 'development') === 'development';
export const isProd = (serverEnv.NODE_ENV ?? 'development') === 'production';
export const isPreview =
  (serverEnv.VERCEL_ENV ??
    (isProd ? 'production' : 'development')) === 'preview';

export const isStripeMock = boolEnv(serverEnv.STRIPE_MOCK, false);
export const robotsDisabled = boolEnv(serverEnv.ROBOTS_DISABLE_INDEXING, false);

/**
 * SITE_URL “canónica” (orden de prioridad):
 * 1) NEXT_PUBLIC_SITE_URL
 * 2) https:// + VERCEL_URL
 * 3) NEXT_PUBLIC_BASE_URL
 * 4) http://localhost:3000
 */
const _computedSiteUrl =
  serverEnv.NEXT_PUBLIC_SITE_URL?.trim() ||
  (serverEnv.VERCEL_URL ? ensureProtocol(serverEnv.VERCEL_URL.trim()) : '') ||
  serverEnv.NEXT_PUBLIC_BASE_URL?.trim() ||
  'http://localhost:3000';

export const SITE_URL = stripTrailingSlash(_computedSiteUrl);

/** Devuelve una URL absoluta basada en SITE_URL. */
export function absUrl(path: string): string {
  if (!path) return SITE_URL;
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}${normalized}`;
}

/* ───────────────── Getters estrictos ───────────────── */

export function mustGet<K extends keyof ServerEnv>(key: K): NonNullable<ServerEnv[K]> {
  const envRecord = process.env as Record<string, string | undefined>;
  const val = envRecord[key] ?? serverEnv[key];
  if (val == null || val === '') {
    throw new Error(`Missing env: ${String(key)}`);
  }
  return val as NonNullable<ServerEnv[K]>;
}

export function mustGetPublic<K extends keyof PublicEnv>(
  key: K,
): NonNullable<PublicEnv[K]> {
  const envRecord = process.env as Record<string, string | undefined>;
  const val = envRecord[key] ?? publicEnv[key];
  if (val == null || val === '') {
    throw new Error(`Missing public env: ${String(key)}`);
  }
  return val as NonNullable<PublicEnv[K]>;
}
