// src/lib/supabase.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mustGetPublic } from '@/lib/env';

// ─────────────────────────────────────────────────────────────
// Singletons (separados por runtime) + metadatos para HMR
// ─────────────────────────────────────────────────────────────
declare global {
  // eslint-disable-next-line no-var
  var __kce_sb_browser__: unknown | undefined;
  // eslint-disable-next-line no-var
  var __kce_sb_server__: unknown | undefined;
  // eslint-disable-next-line no-var
  var __kce_sb_browser_meta__: { url: string; anon: string } | undefined;
  // eslint-disable-next-line no-var
  var __kce_sb_server_meta__: { url: string; anon: string } | undefined;
}

// Overloads para buen tipado genérico
export function getSupabase(): SupabaseClient;
export function getSupabase<T = unknown>(): SupabaseClient<T>;

/**
 * Crea/retorna un cliente público de Supabase (singleton por runtime).
 * - Navegador: persiste sesión en localStorage.
 * - Servidor/Edge: sin persistencia; `fetch` con `cache: 'no-store'`.
 *
 * Tipado opcional:
 *   import type { Database } from '@/types/supabase';
 *   const sb = getSupabase<Database>();
 */
export function getSupabase<T = unknown>(): SupabaseClient<T> {
  const isBrowser = typeof window !== 'undefined';

  const url = mustGetPublic('NEXT_PUBLIC_SUPABASE_URL').trim();
  const anon = mustGetPublic('NEXT_PUBLIC_SUPABASE_ANON_KEY').trim();

  const meta = { url, anon };

  // Reutiliza singleton si las envs coinciden
  if (
    isBrowser &&
    globalThis.__kce_sb_browser__ &&
    globalThis.__kce_sb_browser_meta__?.url === url &&
    globalThis.__kce_sb_browser_meta__?.anon === anon
  ) {
    return globalThis.__kce_sb_browser__ as SupabaseClient<T>;
  }
  if (
    !isBrowser &&
    globalThis.__kce_sb_server__ &&
    globalThis.__kce_sb_server_meta__?.url === url &&
    globalThis.__kce_sb_server_meta__?.anon === anon
  ) {
    return globalThis.__kce_sb_server__ as SupabaseClient<T>;
  }

  // fetch “no-store” en servidor/edge para evitar caching implícito de Next
  const serverFetch: typeof fetch = (input, init) =>
    fetch(input as any, { ...init, cache: 'no-store' });

  // Construye opciones globales sin poner fetch: undefined (exactOptionalPropertyTypes)
  const baseGlobal = {
    headers: { 'X-Client-Info': `kce-web/0.2.0${isBrowser ? '' : ' (server)'}` },
  };
  const globalOpts = isBrowser ? baseGlobal : { ...baseGlobal, fetch: serverFetch };

  const client = createClient<T>(url, anon, {
    auth: {
      persistSession: isBrowser,
      autoRefreshToken: isBrowser,
      detectSessionInUrl: isBrowser,
      storage: isBrowser ? window.localStorage : undefined,
    },
    global: globalOpts,
  });

  if (isBrowser) {
    globalThis.__kce_sb_browser__ = client as unknown;
    globalThis.__kce_sb_browser_meta__ = meta;
  } else {
    globalThis.__kce_sb_server__ = client as unknown;
    globalThis.__kce_sb_server_meta__ = meta;
  }

  return client;
}

// ❌ No exportes instancias ansiosas. Llama siempre a getSupabase() donde lo necesites.
