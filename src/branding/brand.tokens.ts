// src/branding/brand.tokens.ts
/**
 * KCE Design Tokens (runtime helpers)
 * - Convierte el design system a CSS custom properties
 * - Sincroniza data-theme + clase .dark (Tailwind)
 * - Persiste preferencia en localStorage (opcional)
 * - Incluye ring/focus-ring alineados con brand.css
 */

export type BrandMode = 'light' | 'dark';

export const brand = {
  name: 'KCE',
  palette: {
    yellow: '#FFC300',
    blue:   '#0D5BA1',
    red:    '#D32F2F',
    terra:  '#C68436',
    beige:  '#FFF5E1',
    dark:   '#111827',
    white:  '#FFFFFF',
  },
  intent: {
    primary: 'blue',
    secondary: 'yellow',
    accent: 'red',
    success: '#16A34A',
    warning: '#D97706',
    error:   '#DC2626',
  },
  semantic: {
    light: {
      bg: '#FFF5E1',
      surface: '#FFFFFF',
      surface2: '#F8FAFC',
      text: '#111827',
      textMuted: '#475569',
      border: 'rgba(17,24,39,.08)',
      ring: 'rgba(13,91,161,.35)', // foco claro
      overlayStrong: 'rgba(0,0,0,.6)',
      overlaySoft: 'rgba(0,0,0,.2)',
      gradientHero: 'linear-gradient(to top, rgba(0,0,0,.7), rgba(0,0,0,.2))',
      gradientFadeBottom: 'linear-gradient(to top, #FFF5E1, transparent)',
    },
    dark: {
      bg: '#0B1220',
      surface: '#0E1626',
      surface2: '#0B1422',
      text: '#E6ECF5',
      textMuted: '#98A6B8',
      border: 'rgba(255,255,255,.08)',
      ring: 'rgba(13,91,161,.45)', // foco un poco más visible en dark
      overlayStrong: 'rgba(0,0,0,.65)',
      overlaySoft: 'rgba(0,0,0,.25)',
      gradientHero: 'linear-gradient(to top, rgba(0,0,0,.65), rgba(0,0,0,.25))',
      gradientFadeBottom: 'linear-gradient(to top, #0B1220, transparent)',
    },
  },
  typography: {
    headingVar: '--font-heading',
    bodyVar: '--font-body',
  },
  radii: {
    xs: '0.375rem',
    sm: '0.5rem',
    md: '0.75rem',
    lg: '1rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    full: '999px',
  },
  shadows: {
    soft: '0 6px 24px rgba(2,6,23,.08)',
    pop:  '0 10px 30px rgba(2,6,23,.12)',
    hard: '0 12px 48px rgba(2,6,23,.18)',
  },
  motion: {
    easeOut: 'cubic-bezier(.16,1,.3,1)',
    easeIn:  'cubic-bezier(.4,0,1,1)',
    dur1: '120ms',
    dur2: '220ms',
    dur3: '360ms',
  },
  layout: {
    containerMax: '1280px',
    headerH: '64px',
    backdropBlur: '12px',
  },
  z: {
    header: 40,
    chat: 50,
    modal: 60,
  },
  spacing: {
    x: 24,
    y: 12,
  },
} as const;

export type Brand = typeof brand;
export type BrandPaletteKey = keyof typeof brand.palette;

type CssVars = Record<string, string>;

export function toCssVars(mode: BrandMode = 'light'): CssVars {
  const s = brand.semantic[mode];

  const paletteVars: CssVars = {
    '--brand-yellow': brand.palette.yellow,
    '--brand-blue': brand.palette.blue,
    '--brand-red': brand.palette.red,
    '--brand-terra': brand.palette.terra,
    '--brand-beige': brand.palette.beige,
    '--brand-dark': brand.palette.dark,
    '--brand-white': brand.palette.white,
  };

  const semanticVars: CssVars = {
    '--color-bg': s.bg,
    '--color-surface': s.surface,
    '--color-surface-2': s.surface2,
    '--color-text': s.text,
    '--color-text-muted': s.textMuted,
    '--color-border': s.border,
    // Alineado con brand.css: ring + focus ring compuesto
    '--color-ring': s.ring,
    '--ring-inner': s.ring,
    '--ring-outer': mode === 'dark' ? 'color-mix(in oklab, rgba(13,91,161,.45), #ffffff 12%)' : 'rgba(13,91,161,.12)',
    '--focus-ring': '0 0 0 2px var(--ring-inner), 0 0 0 4px var(--ring-outer)',
    '--overlay-strong': s.overlayStrong,
    '--overlay-soft': s.overlaySoft,
    '--gradient-hero': s.gradientHero,
    '--gradient-fade-bottom': s.gradientFadeBottom,
  };

  const designVars: CssVars = {
    '--radius-xs': brand.radii.xs,
    '--radius-sm': brand.radii.sm,
    '--radius': brand.radii.xl,          // paridad con brand.css (20px ~ 1.25rem)
    '--radius-lg': brand.radii.lg,
    '--radius-2xl': brand.radii['2xl'],
    '--radius-full': brand.radii.full,

    '--shadow-soft': brand.shadows.soft,
    '--shadow-pop': brand.shadows.pop,
    '--shadow-hard': brand.shadows.hard,

    '--container-max': brand.layout.containerMax,
    '--header-h': brand.layout.headerH,
    '--backdrop-blur': brand.layout.backdropBlur,

    '--ease-out': brand.motion.easeOut,
    '--ease-in': brand.motion.easeIn,
    '--dur-1': brand.motion.dur1,
    '--dur-2': brand.motion.dur2,
    '--dur-3': brand.motion.dur3,
  };

  return { ...paletteVars, ...semanticVars, ...designVars };
}

/* ===================== Theming helpers ===================== */

const STORAGE_KEY = 'kce.theme';

export function getSystemMode(): BrandMode {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function getStoredMode(): BrandMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'dark' || raw === 'light' ? raw : null;
  } catch {
    return null;
  }
}

export function saveMode(mode: BrandMode) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore quota */
  }
}

/**
 * Aplica tema a <html>
 * - setDataTheme: escribe data-theme="light|dark"
 * - setDarkClass: añade/quita clase .dark para Tailwind
 * - setColorScheme: ajusta CSS color-scheme para inputs/sistemas
 * - inlineVars: setea CSS variables inline (si quieres controlar todo desde JS)
 */
export function applyTheme(
  mode: BrandMode = 'light',
  opts: {
    root?: HTMLElement;
    setDataTheme?: boolean;
    setDarkClass?: boolean;
    setColorScheme?: boolean;
    inlineVars?: boolean;
  } = {
    setDataTheme: true,
    setDarkClass: true,
    setColorScheme: true,
    inlineVars: false, // por defecto confiamos en brand.css para tokens
  },
): void {
  if (typeof document === 'undefined') return;
  const el = opts.root ?? document.documentElement;

  if (opts.setDataTheme !== false) {
    el.setAttribute('data-theme', mode);
  }
  if (opts.setDarkClass !== false) {
    el.classList.toggle('dark', mode === 'dark');
  }
  if (opts.setColorScheme !== false) {
    // favorece estilos nativos (formularios, scrollbars) acordes al tema
    (el.style as any).colorScheme = mode;
  }
  if (opts.inlineVars) {
    const vars = toCssVars(mode);
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  }
}

export function setTheme(mode: BrandMode, opts?: Parameters<typeof applyTheme>[1]) {
  applyTheme(mode, opts);
  saveMode(mode);
}

/** Inicializa tema al cargar: preferencia guardada → sistema → fallback */
export function initTheme(opts?: Parameters<typeof applyTheme>[1]) {
  const stored = getStoredMode();
  const mode = stored ?? getSystemMode();
  applyTheme(mode, opts);
  return mode;
}

/** Escucha cambios del sistema y ejecuta callback; devuelve un unsubscribe */
export function onSystemThemeChange(cb: (mode: BrandMode) => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => cb(mq.matches ? 'dark' : 'light');
  mq.addEventListener?.('change', handler);
  return () => mq.removeEventListener?.('change', handler);
}

/** Utilidad para SSR: genera un string CSS con las variables del modo */
export function cssVarsString(mode: BrandMode = 'light'): string {
  const vars = toCssVars(mode);
  return Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}

export function paletteHex(name: BrandPaletteKey): string {
  return brand.palette[name];
}

/**
 * Script inline para inyectar en <head> y evitar “flash” de tema.
 * Uso en layout:
 *   <script dangerouslySetInnerHTML={{ __html: themeInlineScript() }} />
 */
export function themeInlineScript(): string {
  // minificado pero legible; sin dependencias
  return `
(function(){try{
  var k='${STORAGE_KEY}';
  var m=localStorage.getItem(k);
  var d=document.documentElement;
  var dark = m ? (m==='dark') : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  var mode = dark ? 'dark' : 'light';
  d.setAttribute('data-theme', mode);
  d.classList.toggle('dark', dark);
  d.style.colorScheme = mode;
}catch(e){}})();`.trim();
}
