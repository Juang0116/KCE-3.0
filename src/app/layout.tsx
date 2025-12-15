// src/app/layout.tsx
import '@/styles/globals.css';
import '@/branding/brand.css';

import { Bebas_Neue, Poppins } from 'next/font/google';
import type { Metadata, Viewport } from 'next';

import Header from '@/components/Header';
import ChatWidget from '@/features/ai/ChatWidget';
// import { SITE_URL, SITE_NAME, SITE_TWITTER } from '@/lib/config'; // ← futuro

/* ─────────────────────────────────────────────────────────────
   Fuentes (expuestas como variables CSS para Tailwind/brand.css)
   ───────────────────────────────────────────────────────────── */
const heading = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-heading',
  display: 'swap',
});

const body = Poppins({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

/* ─────────────────────────────────────────────────────────────
   Configuración base del sitio
   ───────────────────────────────────────────────────────────── */
const SITE =
  (process.env.NEXT_PUBLIC_SITE_URL || 'https://kce.travel').replace(/\/+$/, '');

/* ─────────────────────────────────────────────────────────────
   Metadata global (SEO, OG, Twitter)
   ───────────────────────────────────────────────────────────── */
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: 'Knowing Cultures Enterprise — More than a trip',
    template: '%s | KCE',
  },
  description:
    'Colombia auténtica, segura y transformadora. Tours culturales en Bogotá, Caldas y Cartagena.',
  applicationName: 'KCE',
  alternates: {
    canonical: '/',
    languages: {
      'es-CO': '/',
      en: '/',
    },
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: '/site.webmanifest',
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  keywords: [
    'KCE',
    'tours en Colombia',
    'viajes culturales',
    'Bogotá',
    'Caldas',
    'Cartagena',
  ],
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-192.png' }],
    shortcut: ['/favicon.ico'],
  },
  openGraph: {
    title: 'Knowing Cultures Enterprise',
    description: 'Cultura, café y naturaleza — reserva tu experiencia en Colombia.',
    url: '/',
    siteName: 'KCE',
    locale: 'es_CO',
    type: 'website',
    // Asegúrate de tener /public/og.jpg. Si no, comenta esta línea.
    images: [{ url: '/og.jpg' }],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@knowingcultures',
    creator: '@knowingcultures',
  },
  appleWebApp: {
    title: 'KCE',
    statusBarStyle: 'default',
    capable: true,
  },
};

/* ─────────────────────────────────────────────────────────────
   Viewport (PWA/UX)
   ───────────────────────────────────────────────────────────── */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  interactiveWidget: 'resizes-visual',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFF5E1' }, // brand.beige
    { media: '(prefers-color-scheme: dark)', color: '#111827' },  // brand.dark
  ],
};

/* ─────────────────────────────────────────────────────────────
   Root Layout
   ───────────────────────────────────────────────────────────── */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      dir="ltr"
      className={`${heading.variable} ${body.variable}`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k='kce-theme';var s=localStorage.getItem(k);var t=s||(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var r=document.documentElement;if(t==='dark'){r.classList.add('dark');}else{r.classList.remove('dark');}r.dataset.theme=t;}catch(e){}})();`,
          }}
        />
      </head>

      <body
        className="
          min-h-dvh bg-[color:var(--color-bg)] font-body text-[color:var(--color-text)] antialiased
          selection:bg-brand-yellow/40
        "
        suppressHydrationWarning
      >
        {/* Enlace para saltar al contenido (a11y) */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 rounded bg-[color:var(--color-surface)] px-3 py-1 shadow-soft text-[color:var(--color-text)]"
        >
          Saltar al contenido
        </a>

        {/* Cabecera global */}
        <Header />

        {/* Contenido de página */}
        <main id="main" className="pt-20 pb-16">
          {children}
        </main>

        {/* Chat IA flotante */}
        <ChatWidget />

        {/* Mensaje para navegadores sin JS */}
        <noscript>
          <div className="mx-auto my-6 max-w-3xl rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Algunas funciones (chat, animaciones y checkout) requieren JavaScript habilitado.
          </div>
        </noscript>
      </body>
    </html>
  );
}
