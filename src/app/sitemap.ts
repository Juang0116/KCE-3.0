// src/app/sitemap.ts
import type { MetadataRoute } from 'next';
import { TOURS } from '@/features/tours/data.mock';
import { SITE_URL } from '@/lib/env';

export const revalidate = 60 * 60;      // 1h
export const dynamic = 'force-static';  // generar estático con revalidate

function resolveSiteUrl() {
  const fromEnv = SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

function isIndexable(baseUrl: string) {
  const vercelEnv =
    process.env.VERCEL_ENV ??
    (process.env.NODE_ENV === 'production' ? 'production' : 'development');

  const hostname = new URL(baseUrl).hostname.toLowerCase();
  const isProd = vercelEnv === 'production';
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  const isVercelPreview = vercelEnv === 'preview' || hostname.endsWith('.vercel.app');
  const disableFlag = (process.env.ROBOTS_DISABLE_INDEXING || '').toLowerCase() === 'true';

  return isProd && !isLocalhost && !isVercelPreview && !disableFlag;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = resolveSiteUrl();
  if (!isIndexable(baseUrl)) return [];

  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`,      lastModified: now, changeFrequency: 'daily',  priority: 1.0 },
    { url: `${baseUrl}/tours`, lastModified: now, changeFrequency: 'daily',  priority: 0.9 },
  ];

  const tourEntries: MetadataRoute.Sitemap = TOURS.map((t) => ({
    url: `${baseUrl}/tours/${t.slug}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  return [...staticEntries, ...tourEntries];
}
