// src/lib/stripe.ts
import 'server-only';
import Stripe from 'stripe';
import { mustGet } from '@/lib/env';

// ─────────────────────────────────────────────────────────────
// Stripe SDK: sólo en Node (no Edge)
// ─────────────────────────────────────────────────────────────
function assertNodeRuntime() {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new Error(
      '[stripe] La SDK de Stripe requiere Node.js. Evita importar este módulo en funciones Edge.',
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Singleton seguro para HMR/SSR
// ─────────────────────────────────────────────────────────────
declare global {
  // eslint-disable-next-line no-var
  var __kce_stripe__: Stripe | undefined;
}

/**
 * Fija la versión de API a la que apunta tu paquete `@types/stripe`.
 * Si actualizas los tipos y cambia el literal, ajusta este valor.
 * Alternativa: elimina `apiVersion` para usar el default de tu cuenta.
 */
export const stripeApiVersion: Stripe.LatestApiVersion = '2025-07-30.basil';

export const stripeMode: 'live' | 'test' = (process.env.STRIPE_SECRET_KEY || '').includes('_live_')
  ? 'live'
  : 'test';

/** Útil para feature flags (rutas mock si no hay key). */
export const hasStripe = Boolean(process.env.STRIPE_SECRET_KEY);

/** Devuelve un singleton de Stripe (seguro para HMR y SSR). */
export function getStripe(): Stripe {
  assertNodeRuntime();

  if (globalThis.__kce_stripe__) return globalThis.__kce_stripe__;

  const key = mustGet('STRIPE_SECRET_KEY');

  const stripe = new Stripe(key, {
    apiVersion: stripeApiVersion,
    maxNetworkRetries: 2,
    appInfo: {
      name: 'KCE Web',
      version: '0.2.0',
      url: 'https://kce.travel',
    },
  });

  globalThis.__kce_stripe__ = stripe;
  return stripe;
}
