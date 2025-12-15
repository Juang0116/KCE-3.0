/**
 * Utils de formateo (moneda, números, fechas, etiquetas)
 * - Caché LRU para Intl.NumberFormat
 * - Cachés ligeras para Intl.PluralRules e Intl.DateTimeFormat
 * - Helpers COP y minor units (Stripe)
 * - Fallbacks defensivos ante locales/currencies inválidas
 */

type NFKey = string;

/* ─────────────────────────────────────────────────────────────
   LRU para NumberFormat
   ───────────────────────────────────────────────────────────── */
class NFCache {
  private map = new Map<NFKey, Intl.NumberFormat>();
  constructor(private max = 24) {} // suficiente para es-CO, en-US, etc.

  get(key: NFKey) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    this.map.delete(key); // touch LRU
    this.map.set(key, hit);
    return hit;
  }

  set(key: NFKey, fmt: Intl.NumberFormat) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, fmt);
    if (this.map.size > this.max) {
      const first = this.map.keys().next().value as NFKey | undefined; // LRU
      if (first) this.map.delete(first);
    }
  }
}

const nfCache = new NFCache(24);

/* ─────────────────────────────────────────────────────────────
   Cachés simples para PluralRules y DateTimeFormat
   ───────────────────────────────────────────────────────────── */
const prCache = new Map<string, Intl.PluralRules>();
function getPluralRules(locale: string) {
  const loc = normalizeLocale(locale);
  let pr = prCache.get(loc);
  if (!pr) {
    pr = new Intl.PluralRules(loc, { type: 'cardinal' });
    prCache.set(loc, pr);
  }
  return pr;
}

type DtfKey = string;
const dtfCache = new Map<DtfKey, Intl.DateTimeFormat>();
function dtfKey(locale: string, opts: Intl.DateTimeFormatOptions): DtfKey {
  // opciones acotadas → stringify seguro
  return `${locale}::${JSON.stringify(opts)}`;
}
function getDateTimeFormatter(locale: string, opts: Intl.DateTimeFormatOptions) {
  const loc = normalizeLocale(locale);
  const key = dtfKey(loc, opts);
  let fmt = dtfCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(loc, opts);
    dtfCache.set(key, fmt);
  }
  return fmt;
}

/* ─────────────────────────────────────────────────────────────
   Helpers de normalización
   ───────────────────────────────────────────────────────────── */
function coerceFinite(n: unknown, fallback = 0): number {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function normalizeLocale(locale?: string): string {
  const l = (locale || 'es-CO').trim();
  // supportedLocalesOf devuelve el primer match o []
  return Intl.NumberFormat.supportedLocalesOf([l])[0] || 'es-CO';
}

function normalizeCurrency(code?: string): string {
  return (code || 'COP').toUpperCase();
}

/** Key estable para cachear Intl.NumberFormat. */
function nfKey(locale: string, options: Intl.NumberFormatOptions): NFKey {
  return `${locale}::${JSON.stringify(options)}`;
}

function getNumberFormatter(locale: string, options: Intl.NumberFormatOptions) {
  const loc = normalizeLocale(locale);
  const key = nfKey(loc, options);
  let fmt = nfCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(loc, options);
    nfCache.set(key, fmt);
  }
  return fmt;
}

/* ─────────────────────────────────────────────────────────────
   Constantes
   ───────────────────────────────────────────────────────────── */
/** ISO-4217 sin decimales — útil para Stripe minor units. */
export const ZERO_DECIMAL_CURRENCIES = new Set<string>([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA',
  'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

/* ─────────────────────────────────────────────────────────────
   Monedas / Números
   ───────────────────────────────────────────────────────────── */
/** Moneda genérica. Por defecto COP/es-CO sin decimales. */
export function formatCurrency(
  value: number,
  currency = 'COP',
  locale = 'es-CO',
  options?: Intl.NumberFormatOptions,
): string {
  const safe = coerceFinite(value, 0);
  const cur = normalizeCurrency(currency);
  try {
    const fmt = getNumberFormatter(normalizeLocale(locale), {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: 0, // default KCE
      ...options,
    });
    return fmt.format(safe);
  } catch {
    // Fallback muy básico si el currency es inválido
    return `${safe.toFixed(options?.maximumFractionDigits ?? 0)} ${cur}`;
  }
}

/** Pesos colombianos (COP). */
export function formatCOP(
  value: number,
  options?: Pick<Intl.NumberFormatOptions, 'maximumFractionDigits' | 'minimumFractionDigits'>,
): string {
  return formatCurrency(value, 'COP', 'es-CO', options);
}

/** Versión compacta (e.g. $120K) — útil para cards/resúmenes. */
export function formatCurrencyCompact(
  value: number,
  currency = 'COP',
  locale = 'es-CO',
): string {
  const safe = coerceFinite(value, 0);
  const cur = normalizeCurrency(currency);
  try {
    const fmt = getNumberFormatter(normalizeLocale(locale), {
      style: 'currency',
      currency: cur,
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    return fmt.format(safe);
  } catch {
    return `${safe} ${cur}`;
  }
}

/**
 * Formatea montos en **minor units** (p. ej. Stripe `amount_total`) respetando
 * monedas zero-decimal automáticamente.
 */
export function formatMinorUnits(
  amountInMinor: number,
  currency: string,
  locale = 'es-CO',
  opts?: Omit<Intl.NumberFormatOptions, 'style' | 'currency'>,
): string {
  const cur = normalizeCurrency(currency);
  const isZero = ZERO_DECIMAL_CURRENCIES.has(cur);
  const value = isZero ? coerceFinite(amountInMinor, 0) : coerceFinite(amountInMinor, 0) / 100;
  try {
    const fmt = getNumberFormatter(normalizeLocale(locale), {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: isZero ? 0 : (opts?.maximumFractionDigits ?? 0),
      ...opts,
    });
    return fmt.format(value);
  } catch {
    return `${value}${isZero ? '' : ''} ${cur}`;
  }
}

/** Número genérico (no monetario). */
export function formatNumber(
  value: number,
  locale = 'es-CO',
  options?: Intl.NumberFormatOptions,
): string {
  const safe = coerceFinite(value, 0);
  const fmt = getNumberFormatter(normalizeLocale(locale), { maximumFractionDigits: 0, ...options });
  return fmt.format(safe);
}

/* ─────────────────────────────────────────────────────────────
   Etiquetas con pluralización
   ───────────────────────────────────────────────────────────── */
/** Etiqueta de horas con pluralización correcta (redondeo defensivo a entero). */
export function hoursLabel(h: number, locale = 'es'): string {
  if (!Number.isFinite(h) || h < 0) return '';
  const n = Math.round(h);
  const unit = getPluralRules(locale).select(n) === 'one' ? 'hora' : 'horas';
  return `${n} ${unit}`;
}

/** "personas" con pluralización básica (redondeo defensivo). */
export function peopleLabel(n: number, locale = 'es'): string {
  if (!Number.isFinite(n) || n < 0) return '';
  const k = Math.round(n);
  const unit = getPluralRules(locale).select(k) === 'one' ? 'persona' : 'personas';
  return `${k} ${unit}`;
}

/* ─────────────────────────────────────────────────────────────
   Fechas
   ───────────────────────────────────────────────────────────── */
/** Fecha YYYY-MM-DD → "20 de agosto de 2025" (es-CO). */
export function formatISODatePretty(iso: string, locale = 'es-CO'): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const fmt = getDateTimeFormatter(normalizeLocale(locale), {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
  });
  return fmt.format(d);
}

/** Variante corta: YYYY-MM-DD → "20 ago 2025". */
export function formatISODateShort(iso: string, locale = 'es-CO'): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const fmt = getDateTimeFormatter(normalizeLocale(locale), {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
  return fmt.format(d);
}
