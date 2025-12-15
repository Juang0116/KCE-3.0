// src/lib/supabaseAdmin.ts
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mustGet } from '@/lib/env';
import type { Database } from '@/types/supabase';

// ─────────────────────────────────────────────────────────────
// Server-only guard (Service Role nunca debe cargarse en Edge)
// ─────────────────────────────────────────────────────────────
if (process.env.NEXT_RUNTIME === 'edge') {
  throw new Error(
    '[supabaseAdmin] Service-role requiere Node.js. No importes este módulo en Edge.',
  );
}

// ─────────────────────────────────────────────────────────────
// Singletons HMR-safe (dev) con metadatos para evitar mezclar keys
// ─────────────────────────────────────────────────────────────
declare global {
  // eslint-disable-next-line no-var
  var __kce_sb_admin__: unknown | undefined;
  // eslint-disable-next-line no-var
  var __kce_sb_admin_meta__: { url: string; key: string } | undefined;
}

export type AdminClient = SupabaseClient<Database>;

function makeAdminClient(): AdminClient {
  const url = mustGet('SUPABASE_URL').trim();
  const serviceRoleKey = mustGet('SUPABASE_SERVICE_ROLE').trim();

  // Evita caching implícito (Next middleware/proxy)
  const serverFetch: typeof fetch = (input, init) =>
    fetch(input as any, { ...init, cache: 'no-store' });

  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { 'X-Client-Info': 'kce-web/0.2.0 (admin)' },
      fetch: serverFetch,
    },
  });
}

/** Cliente Service-Role (⚠️ server-only, singleton por proceso). */
export function getSupabaseAdmin(): AdminClient {
  const url = mustGet('SUPABASE_URL').trim();
  const key = mustGet('SUPABASE_SERVICE_ROLE').trim();

  if (
    globalThis.__kce_sb_admin__ &&
    globalThis.__kce_sb_admin_meta__?.url === url &&
    globalThis.__kce_sb_admin_meta__?.key === key
  ) {
    return globalThis.__kce_sb_admin__ as AdminClient;
  }

  const client = makeAdminClient();
  globalThis.__kce_sb_admin__ = client as unknown;
  globalThis.__kce_sb_admin_meta__ = { url, key };
  return client;
}

/**
 * Compat opcional para imports existentes.
 * - En entornos sin credenciales, devuelve un "null-cast" para no romper la importación.
 * - Usa getSupabaseAdmin() cuando necesites garantizar la instancia.
 */
export const supabaseAdmin: AdminClient = (() => {
  try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE) {
      return getSupabaseAdmin();
    }
  } catch {
    /* noop */
  }
  // Cast explícito para mantener el tipo de export
  return null as unknown as AdminClient;
})();
