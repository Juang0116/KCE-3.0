// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    // Si llegas a renderizar plantillas fuera de src, añade rutas aquí.
  ],

  // Mejora UX/energía en dispositivos sin hover
  future: { hoverOnlyWhenSupported: true },

  darkMode: ['class'],

  /**
   * Clases que queremos preservar aunque se generen de forma condicional
   * (por ejemplo, vía estados/atributos o strings dinámicas).
   */
  safelist: [
  'bg-brand-beige',
  'text-brand-blue',
  'text-brand-red',
  'border-brand-dark/10',
  'border-brand-dark/15',
  'bg-brand-blue/10',
  // ✅ preserva los rings que usas desde componentes
  'focus:ring-brand-blue/30',
  'focus:ring-brand-blue/40',
  'focus-visible:ring-brand-blue/30',
  'focus-visible:ring-brand-blue/40',
],

  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1280px' },
    },
    extend: {
      // Paleta de marca (compatible con /xx/ para opacidad)
      colors: {
        brand: {
          yellow: '#FFC300',
          blue: '#0D5BA1',
          red: '#D32F2F',
          terra: '#C68436',
          beige: '#FFF5E1',
          dark: '#111827',
          white: '#FFFFFF',
        },
      },

      // Usa las fuentes CSS vars que ya inyectas en RootLayout
      fontFamily: {
        heading: ['var(--font-heading)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },

      // Radios alineados con tokens de marca
      borderRadius: {
        xl: '1rem',
        '2xl': '1.5rem',
      },

      // Sombras centralizadas (apoyadas en tus CSS vars)
      boxShadow: {
        soft: 'var(--shadow-soft)',
        pop: 'var(--shadow-pop)',
        hard: 'var(--shadow-hard)',
      },

      // Ring por defecto (apunta a tu token; puedes seguir usando ring-brand-* cuando quieras)
      ringColor: {
        DEFAULT: 'var(--color-ring)',
      },

      // Animaciones livianas para micro-interacciones
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
          '100%': { transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-468px 0' },
          '100%': { backgroundPosition: '468px 0' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 300ms ease-out',
        'slide-up': 'slideUp 350ms ease-out',
        float: 'float 6s ease-in-out infinite',
        shimmer: 'shimmer 1.2s ease-in-out infinite',
      },

      // Gradiente genérico para overlays tipo hero (coincide con brand.css)
      backgroundImage: {
        'hero-overlay': 'linear-gradient(to top, rgba(0,0,0,.7), rgba(0,0,0,.2))',
      },
    },
  },

  plugins: [
    // Si en el futuro quieres normalizar inputs: require('@tailwindcss/forms')
    // Si publicas mucho texto/MDX: require('@tailwindcss/typography')
  ],
};

export default config;
