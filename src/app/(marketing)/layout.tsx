// src/app/(marketing)/layout.tsx
import type { Viewport } from 'next';
import type { ReactNode } from 'react';

// Viewport específico para el segmento de marketing
export const viewport: Viewport = {
  themeColor: '#0D5BA1', // Azul KCE
};

export default function MarketingLayout({ children }: { children: ReactNode }) {
  const baseRaw = process.env.NEXT_PUBLIC_SITE_URL || 'https://kce.travel';
  const base = baseRaw.replace(/\/+$/, ''); // sin trailing slash

  // Redes (opcional): exponlas por env si las tienes
  const INSTAGRAM = process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM?.trim();
  const YOUTUBE   = process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE?.trim();
  const FACEBOOK  = process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK?.trim();
  const sameAs = [INSTAGRAM, YOUTUBE, FACEBOOK].filter(Boolean) as string[];

  // Organization JSON-LD
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Knowing Cultures Enterprise',
    url: base,
    logo: `${base}/logo.png`,
    ...(sameAs.length ? { sameAs } : {}), // solo si hay redes reales
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        availableLanguage: ['es', 'en'],
        ...(process.env.NEXT_PUBLIC_CONTACT_EMAIL
          ? { email: process.env.NEXT_PUBLIC_CONTACT_EMAIL }
          : {}),
      },
    ],
  };

  // WebSite + SearchAction (para /tours?q=...)
  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Knowing Cultures Enterprise',
    url: base,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${base}/tours?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <>
      {children}

      {/* SEO estructurado del segmento (se inyecta en todas las páginas de /(marketing)) */}
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }}
      />
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
    </>
  );
}
