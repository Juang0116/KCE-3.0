// src/app/robots.ts
import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/env';

function resolveSiteUrl() {
  const fromEnv = SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

export default function robots(): MetadataRoute.Robots {
  const siteUrl = resolveSiteUrl();

  const vercelEnv =
    process.env.VERCEL_ENV ??
    (process.env.NODE_ENV === 'production' ? 'production' : 'development');

  const hostname = new URL(siteUrl).hostname.toLowerCase();

  const isProd = vercelEnv === 'production';
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  const isVercelPreview = vercelEnv === 'preview' || hostname.endsWith('.vercel.app');
  const robotsDisable = (process.env.ROBOTS_DISABLE_INDEXING || '').toLowerCase() === 'true';

  // Indexamos SOLO en prod, dominio real y sin override de bloqueo.
  const indexable = isProd && !isLocalhost && !isVercelPreview && !robotsDisable;

  if (!indexable) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  return {
    host: siteUrl,                           // absoluto (https://...)
    sitemap: [`${siteUrl}/sitemap.xml`],     // puedes agregar más si los generas
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Evita indexar endpoints y páginas de estado/checkout
        disallow: [
          '/api/',
          '/_next/',
          '/favicon.ico',
          '/icons/',
          '/checkout/',
          '/booking/',
        ],
      },
    ],
  };
}
