// src/components/seo/SEOProvider.tsx
'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { DefaultSeo, type DefaultSeoProps } from 'next-seo';

/**
 * SEO por defecto para rutas cliente (App Router).
 * Mantén esto minimal si ya usas la Metadata API en layout/page.
 */

function buildCanonical(base: string, pathname: string) {
  const b = base.replace(/\/+$/, '');
  const p = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${b}${p}`;
}

function isIndexable(base: string) {
  // Variables públicas (disponibles en cliente)
  const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development');
  const host = new URL(base).hostname.toLowerCase();
  const isProd = vercelEnv === 'production';
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const isPreview = vercelEnv === 'preview' || host.endsWith('.vercel.app');
  return isProd && !isLocal && !isPreview;
}

export default function SEOProvider() {
  // Base pública (asegúrate de setear NEXT_PUBLIC_SITE_URL en prod)
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://kce.travel';
  const pathname = usePathname() || '/';
  const canonical = buildCanonical(base, pathname);
  const indexable = isIndexable(base);

  // Recomendación: usar una OG 1200x630. Fallback al icono si no existe /og.jpg
  const ogImage = `${base}/og.jpg`;

  const seo = useMemo<DefaultSeoProps>(() => ({
    titleTemplate: '%s | KCE',
    defaultTitle: 'KCE — Experiencias únicas',
    description:
      'Más que viajes: cultura, café y naturaleza. Reserva experiencias auténticas en Colombia.',
    canonical,
    openGraph: {
      type: 'website',
      locale: 'es_CO',
      site_name: 'KCE',
      url: canonical,
      title: 'KCE — Experiencias únicas',
      description:
        'Más que viajes: cultura, café y naturaleza. Reserva experiencias auténticas en Colombia.',
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: 'KCE — Knowing Cultures Enterprise',
        },
      ],
    },
    twitter: {
      cardType: 'summary_large_image',
      // site: '@knowingcultures',
      // handle: '@knowingcultures',
    },

    // Bloquea indexación en preview/local
    dangerouslySetAllPagesToNoIndex: !indexable,
    dangerouslySetAllPagesToNoFollow: !indexable,

    additionalLinkTags: [
      // Favicons & manifest
      { rel: 'icon', href: '/favicon.ico' },
      { rel: 'apple-touch-icon', href: '/icons/icon-192.png', sizes: '192x192' },
      { rel: 'apple-touch-icon', href: '/icons/icon-512.png', sizes: '512x512' },
      { rel: 'manifest', href: '/site.webmanifest' },

      // Performance hints
      { rel: 'preconnect', href: 'https://www.googletagmanager.com', crossOrigin: 'anonymous' },
      { rel: 'preconnect', href: 'https://js.stripe.com', crossOrigin: 'anonymous' },
      { rel: 'dns-prefetch', href: 'https://www.googletagmanager.com' },
      { rel: 'dns-prefetch', href: 'https://js.stripe.com' },
    ],
    additionalMetaTags: [
      { name: 'application-name', content: 'KCE' },
      { name: 'theme-color', content: '#0D5BA1' },
      { name: 'format-detection', content: 'telephone=no' },
      { httpEquiv: 'x-ua-compatible', content: 'IE=edge' },
      // Robots por ruta mejor con la Metadata API (page-level)
    ],
  }), [canonical, ogImage, indexable]);

  return <DefaultSeo {...seo} />;
}
