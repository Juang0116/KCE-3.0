// next.config.ts
import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

function buildCSP() {
  // ▸ En dev añadimos 'unsafe-eval' y 'blob:' en script-src para que Next HMR no se rompa.
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    'https://www.googletagmanager.com',
    'https://www.google-analytics.com',
    'https://js.stripe.com',
    ...(isDev ? ["'unsafe-eval'", 'blob:'] : []),
  ];

  const styleSrc = [
    "'self'",
    "'unsafe-inline'",
    // con next/font no hace falta, pero no estorba:
    'https://fonts.googleapis.com',
  ];

  const imgSrc = [
    "'self'",
    'data:',
    'blob:',
    'https://images.unsplash.com',
    'https://*.supabase.co',
    'https://kce.travel',
    'https://*.vercel.app',
    'https://www.google-analytics.com',
    'https://www.googletagmanager.com',
    'https://chart.googleapis.com',
    'https://q.stripe.com', // pixel de Stripe
  ];

  const fontSrc = [
    "'self'",
    'data:',
    // con next/font normalmente no es necesario, pero lo dejamos por compat:
    'https://fonts.gstatic.com',
  ];

  const connectSrc = [
    "'self'",
    'https://*.supabase.co',
    'https://api.stripe.com',
    'https://checkout.stripe.com',
    'https://q.stripe.com',
    'https://api.openai.com',
    'https://generativelanguage.googleapis.com',
    'https://www.google-analytics.com',
    'https://www.googletagmanager.com',
    'https://*.vercel.app',
    ...(isDev ? ['ws:', 'wss:', 'http://localhost:*'] : []),
  ];

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "manifest-src 'self'",
    "frame-ancestors 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    `style-src ${styleSrc.join(' ')}`,
    `img-src ${imgSrc.join(' ')}`,
    `font-src ${fontSrc.join(' ')}`,
    `connect-src ${connectSrc.join(' ')}`,
    // Aunque usamos Checkout por redirección, permitimos estos por si
    // en el futuro usamos Payment Element/3DS:
    `frame-src https://js.stripe.com https://checkout.stripe.com`,
    `form-action 'self' https://checkout.stripe.com`,
    `worker-src 'self' blob:`,
    `media-src 'self' blob:`,
    !isDev ? 'upgrade-insecure-requests' : '',
  ].filter(Boolean);

  return directives.join('; ');
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },

  images: {
    // Si Next se queja por comodines, cambia **.supabase.co / **.vercel.app
    // por tus subdominios concretos. Con Next moderno, **.dominio suele ir bien.
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'kce.travel' },
      { protocol: 'https', hostname: '**.vercel.app' },
      { protocol: 'https', hostname: 'chart.googleapis.com' },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  async headers() {
    const csp = buildCSP();
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            // Nota: 'interest-cohort' está obsoleto; no lo incluimos.
            key: 'Permissions-Policy',
            value: 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
