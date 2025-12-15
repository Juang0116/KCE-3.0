// src/app/manifest.ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Knowing Cultures Enterprise',
    short_name: 'KCE',
    description:
      'Colombia auténtica, segura y transformadora. Tours culturales en Bogotá, Caldas y Cartagena.',
    id: '/',
    scope: '/',
    start_url: '/?source=pwa',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui', 'browser'],
    background_color: '#FFF5E1', // sincronizado con layout
    theme_color: '#0D5BA1',
    lang: 'es-CO',
    dir: 'ltr',
    orientation: 'portrait-primary',
    categories: ['travel', 'tourism', 'culture'],
    prefer_related_applications: false,
    icons: [
      // 192x192
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },                // any
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      // 512x512
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },                // any
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'Explorar tours',
        short_name: 'Tours',
        url: '/tours',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Hablar con IA',
        short_name: 'Chat IA',
        url: '/?chat=open',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
  };
}
