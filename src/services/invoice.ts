// src/services/invoice.ts
import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import QRCode from 'qrcode';
import fs from 'node:fs/promises';
import path from 'node:path';

/* ─────────────────────────────────────────────────────────────
   Server/runtime guard (pdf-lib + qrcode requieren Node.js)
   ───────────────────────────────────────────────────────────── */
if (process.env.NEXT_RUNTIME === 'edge') {
  throw new Error('[invoice] Esta utilidad requiere Node.js (no Edge).');
}

/* ─────────────────────────────────────────────────────────────
   Tipos públicos
   ───────────────────────────────────────────────────────────── */
export type InvoiceInput = {
  bookingId: string;
  createdAtISO?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  tourTitle: string;
  tourDate?: string | null;     // YYYY-MM-DD
  persons: number;
  totalMinor?: number | null;   // minor units (USD cents, etc.)
  currency?: string | null;     // 'USD', 'COP', ...
  siteUrl?: string;             // http://localhost:3000 o https://kce.travel
};

export type InvoiceOptions = {
  /** Si quieres forzar otro archivo/URL, puedes pasar logoUrl.
      Por defecto intentamos cargar public/logo.png del proyecto. */
  logoUrl?: string;
  /** ej. 'es-CO' (default) */
  locale?: string;
  /** Fuerza dígitos decimales del formato monetario (override). */
  fractionDigits?: number;
  /** Personaliza colores de marca. */
  theme?: {
    brandBlue?: string;   // default '#0D5BA1'
    brandYellow?: string; // default '#FFC300'
    textDark?: string;    // default '#111827'
  };
  /** Nota fiscal (legal) al pie — visible por defecto. */
  showFiscalNote?: boolean;
  /** Muestra QR con link de reserva — visible por defecto. */
  showQr?: boolean;
  /** URL del QR (por defecto /booking/:id). */
  qrUrl?: string;
  /** Texto bajo el QR. */
  qrLabel?: string;
};

/* ─────────────────────────────────────────────────────────────
   THEME CONFIG
   ───────────────────────────────────────────────────────────── */
const DEFAULT_THEME = {
  brandBlue: '#0D5BA1',
  brandYellow: '#FFC300',
  textDark: '#111827',
};

const DEFAULT_LOCALE = 'es-CO';
const PAGE_SIZE_A4: [number, number] = [595.28, 841.89]; // pt

/* ─────────────────────────────────────────────────────────────
   Helpers de color, texto y formatos
   ───────────────────────────────────────────────────────────── */

/** Códigos con 0 decimales (ISO-4217 minor units = 0) */
const ZERO_DECIMAL = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
  'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

/** Algunos con 3 decimales habituales (minor units = 3) */
const THREE_DECIMAL = new Set(['bhd', 'iqd', 'jod', 'kwd', 'lyd', 'omr', 'tnd']);

function defaultFractionDigitsFor(currency: string): number {
  const c = currency.toLowerCase();
  if (ZERO_DECIMAL.has(c)) return 0;
  if (THREE_DECIMAL.has(c)) return 3;
  return 2;
}

function hexToRgb(hex: string) {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = Number.parseInt(full, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return rgb(r, g, b);
}

function parseColor(s?: string) {
  const val = (s || '').trim();
  if (!val) return undefined;
  try {
    // Para ahora soportamos sólo hex; si llega 'oklch()/rgb()', podrías ampliar aquí
    return hexToRgb(val.startsWith('#') ? val : `#${val}`);
  } catch {
    return undefined;
  }
}

function slugify(s: string) {
  return (s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function shortId(id: string) {
  const s = String(id || '');
  return s.length > 8 ? s.slice(-8) : s;
}

function formatMoneyFromMinor(
  amountMinor: number | null | undefined,
  currency: string,
  locale = DEFAULT_LOCALE,
  fractionDigits?: number,
) {
  if (amountMinor == null || Number.isNaN(amountMinor)) return '';
  const isZero = ZERO_DECIMAL.has(currency.toLowerCase());
  const value = isZero ? amountMinor : amountMinor / 100;
  const digits = fractionDigits ?? defaultFractionDigitsFor(currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    }).format(value);
  } catch {
    const fallback = value.toFixed(Math.max(0, digits));
    return `${fallback} ${currency.toUpperCase()}`;
  }
}

/** Wrap de texto simple para pdf-lib (respeta saltos manuales \n). */
function wrapText(text: string, maxWidth: number, font: PDFFont, fontSize: number) {
  const lines: string[] = [];
  for (const rawLine of String(text || '').split(/\n/)) {
    const words = rawLine.split(/\s+/);
    let line = '';
    for (const w of words) {
      const tentative = line ? `${line} ${w}` : w;
      const width = font.widthOfTextAtSize(tentative, fontSize);
      if (width <= maxWidth) line = tentative;
      else {
        if (line) lines.push(line);
        // palabra extremadamente larga → forzamos corte (evita overflow infinito)
        if (font.widthOfTextAtSize(w, fontSize) > maxWidth) {
          lines.push(w);
          line = '';
        } else {
          line = w;
        }
      }
    }
    if (line) lines.push(line);
    if (rawLine !== '') {
      // mantiene salto manual
    }
  }
  return lines;
}

/* ─────────────────────────────────────────────────────────────
   Logo loader: prioriza public/logo.png; fallback a URL si se pasa
   ───────────────────────────────────────────────────────────── */
function toAbsoluteUrl(src: string) {
  if (/^https?:\/\//i.test(src)) return src;
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'http://localhost:3000';
  const b = base.replace(/\/+$/, '');
  const p = src.startsWith('/') ? src : `/${src}`;
  return `${b}${p}`;
}

async function loadLogoBytes(logoUrl?: string): Promise<Uint8Array | null> {
  // 1) public/logo.png local (preferido)
  try {
    const localPath = path.join(process.cwd(), 'public', 'logo.png');
    const buf = await fs.readFile(localPath);
    return new Uint8Array(buf);
  } catch {
    // no-op
  }
  // 2) Fallback: URL explícita
  if (logoUrl) {
    try {
      const res = await fetch(toAbsoluteUrl(logoUrl), { cache: 'no-store' });
      if (res.ok) {
        return new Uint8Array(await res.arrayBuffer());
      }
    } catch {
      // no-op
    }
  }
  return null;
}

/* ─────────────────────────────────────────────────────────────
   API pública: nombre sugerido para el PDF
   ───────────────────────────────────────────────────────────── */
export function buildInvoiceFileName(tourTitle: string, createdAt: Date) {
  const y = createdAt.getFullYear();
  const m = String(createdAt.getMonth() + 1).padStart(2, '0');
  const d = String(createdAt.getDate()).padStart(2, '0');
  const slug = slugify(tourTitle);
  return `Factura-KCE_${y}-${m}-${d}_${slug || 'reserva'}.pdf`;
}

/* ─────────────────────────────────────────────────────────────
   API principal: genera el PDF (Buffer)
   ───────────────────────────────────────────────────────────── */
export async function buildInvoicePdf(
  input: InvoiceInput,
  options?: InvoiceOptions,
): Promise<Buffer> {
  const locale = options?.locale || DEFAULT_LOCALE;
  const currency = (input.currency || 'COP').toUpperCase();
  const digits = options?.fractionDigits ?? defaultFractionDigitsFor(currency);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage(PAGE_SIZE_A4);
  const { width, height } = page.getSize();

  // Metadatos del documento
  pdf.setTitle(`KCE · Factura ${shortId(input.bookingId)}`);
  pdf.setAuthor('Knowing Cultures Enterprise (KCE)');
  pdf.setSubject('Confirmación de reserva');
  pdf.setCreationDate(
    input.createdAtISO ? new Date(input.createdAtISO) : new Date(),
  );

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Colores (permite override)
  const brandBlue =
    parseColor(options?.theme?.brandBlue) || parseColor(DEFAULT_THEME.brandBlue)!;
  const brandYellow =
    parseColor(options?.theme?.brandYellow) || parseColor(DEFAULT_THEME.brandYellow)!;
  const textDark =
    parseColor(options?.theme?.textDark) || parseColor(DEFAULT_THEME.textDark)!;

  /* ───────── Header ───────── */
  const headerH = 110;
  page.drawRectangle({ x: 0, y: height - headerH, width, height: headerH, color: brandBlue });
  // acento
  page.drawRectangle({ x: 0, y: height - headerH, width, height: 4, color: brandYellow });

  // Marca / títulos (izquierda)
  page.drawText('KCE — Knowing Cultures Enterprise', {
    x: 32,
    y: height - 56,
    size: 18,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText('Factura / Confirmación de reserva', {
    x: 32,
    y: height - 78,
    size: 12,
    font,
    color: rgb(1, 1, 1),
  });

  // Logo (derecha)
  try {
    const logoBytes = await loadLogoBytes(options?.logoUrl || 'logo.png');
    if (logoBytes) {
      const img =
        (await pdf.embedPng(logoBytes).catch(async () => null)) ||
        (await pdf.embedJpg(logoBytes));
      const maxW = 160;
      const maxH = 56;
      const scale = Math.min(maxW / img.width, maxH / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = width - 24 - w;
      const y = height - 24 - h;

      // tarjeta blanca suave detrás
      page.drawRectangle({
        x: x - 6,
        y: y - 6,
        width: w + 12,
        height: h + 12,
        color: rgb(1, 1, 1),
      });
      page.drawImage(img, { x, y, width: w, height: h });
    }
  } catch {
    // no-op si el logo falla
  }

  /* ───────── Datos base ───────── */
  const created = input.createdAtISO ? new Date(input.createdAtISO) : new Date();
  const createdHuman = created.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
  });
  const invoiceNo =
    `KCE-${created.getFullYear()}${String(created.getMonth() + 1).padStart(2, '0')}` +
    `${String(created.getDate()).padStart(2, '0')}-${shortId(input.bookingId)}`;

  const totalFmt = formatMoneyFromMinor(input.totalMinor ?? null, currency, locale, digits);
  const marginX = 40;
  const contentW = width - marginX * 2;
  let y = height - headerH - 32;

  // helper label:value
  const line = (label: string, value?: string | number | null) => {
    if (value == null || value === '') return;
    page.drawText(`${label}:`, { x: marginX, y, size: 11, font: bold, color: textDark });
    page.drawText(String(value), { x: marginX + 125, y, size: 11, font, color: textDark });
    y -= 18;
  };

  /* ───────── Sección: Factura ───────── */
  page.drawText('Detalles de la factura', {
    x: marginX, y, size: 13, font: bold, color: brandBlue,
  });
  y -= 22;
  line('Factura', invoiceNo);
  line('Fecha de emisión', createdHuman);
  const baseUrl = (input.siteUrl || '').replace(/\/+$/, '') || 'http://localhost:3000';
  line('Sitio', baseUrl);

  y -= 10;

  /* ───────── Sección: Cliente ───────── */
  page.drawText('Cliente', { x: marginX, y, size: 13, font: bold, color: brandBlue });
  y -= 22;
  line('Nombre', input.customerName || '');
  line('Email', input.customerEmail || '');

  y -= 10;

  /* ───────── Sección: Reserva ───────── */
  page.drawText('Reserva', { x: marginX, y, size: 13, font: bold, color: brandBlue });
  y -= 22;

  // Tour (con wrap)
  page.drawText('Tour:', { x: marginX, y, size: 11, font: bold, color: textDark });
  const tourX = marginX + 125;
  const tourMax = contentW - 125;
  const tourLines = wrapText(input.tourTitle, tourMax, font, 11);
  tourLines.forEach((ln, i) => {
    page.drawText(ln, { x: tourX, y: y - 18 * i, size: 11, font, color: textDark });
  });
  y -= Math.max(18, 18 * tourLines.length);

  line('Fecha del tour', input.tourDate || '');
  line('Personas', String(Math.max(1, Number(input.persons) || 1)));
  line('Moneda', currency);

  y -= 14;

  /* ───────── Bloque: Total ───────── */
  const blockH = 56;
  const blockY = y - blockH;
  page.drawRectangle({
    x: marginX - 4,
    y: blockY,
    width: contentW + 8,
    height: blockH,
    color: brandYellow,
  });

  page.drawText('TOTAL', {
    x: marginX + 8,
    y: blockY + 19,
    size: 12,
    font: bold,
    color: textDark,
  });

  const totalW = font.widthOfTextAtSize(totalFmt || '', 20);
  page.drawText(totalFmt || '', {
    x: marginX + contentW - totalW,
    y: blockY + 15,
    size: 20,
    font: bold,
    color: textDark,
  });

  y = blockY - 24;

  /* ───────── Nota / enlace ───────── */
  const thanks = `Gracias por reservar con KCE.${baseUrl ? ` ${baseUrl}` : ''}`;
  const thanksLines = wrapText(thanks, contentW, font, 10);
  thanksLines.forEach((ln) => {
    page.drawText(ln, { x: marginX, y, size: 10, font, color: textDark });
    y -= 14;
  });

  const showQr = options?.showQr !== false;
  const qrValue = options?.qrUrl || `${baseUrl}/booking/${encodeURIComponent(input.bookingId)}`;

  if (showQr && qrValue) {
    const shortUrl = qrValue.length > 70 ? `${qrValue.slice(0, 67)}…` : qrValue;
    const linkText = `Gestiona tu reserva: ${shortUrl}`;
    const linkLines = wrapText(linkText, contentW, font, 9);
    linkLines.forEach((ln) => {
      page.drawText(ln, { x: marginX, y, size: 9, font, color: textDark });
      y -= 12;
    });
  }

  /* ───────── QR en el pie (derecha) ───────── */
  if (showQr && qrValue) {
    try {
      const qrSize = 104;
      const qrPadding = 6;
      const qrLabelPad = 16;
      const footerY = 36;

      const qrPng = await QRCode.toBuffer(qrValue, {
        type: 'png',
        width: qrSize,
        margin: 0,
        errorCorrectionLevel: 'M',
      });
      const qrImg = await pdf.embedPng(qrPng);

      const qrX = width - qrSize - 24;
      const qrY = footerY + 10; // por encima de la línea de nota fiscal

      // tarjeta blanca con zona de etiqueta
      page.drawRectangle({
        x: qrX - qrPadding,
        y: qrY - qrPadding,
        width: qrSize + qrPadding * 2,
        height: qrSize + qrPadding * 2 + qrLabelPad,
        color: rgb(1, 1, 1),
      });

      page.drawImage(qrImg, { x: qrX, y: qrY + qrLabelPad, width: qrSize, height: qrSize });

      const label = options?.qrLabel || 'Escanéame';
      const labelW = font.widthOfTextAtSize(label, 9);
      page.drawText(label, {
        x: qrX + (qrSize - labelW) / 2,
        y: qrY + 3,
        size: 9,
        font,
        color: textDark,
      });
    } catch {
      // QR opcional; si falla, continuamos
    }
  }

  /* ───────── Footer ───────── */
  const fiscalNote =
    options?.showFiscalNote === false
      ? ''
      : 'Este documento es una confirmación de reserva y puede no reemplazar la factura fiscal de tu país.';
  if (fiscalNote) {
    const fLines = wrapText(fiscalNote, width - marginX * 2, font, 9);
    const baseY = 36;
    fLines.forEach((ln, i) => {
      page.drawText(ln, {
        x: marginX,
        y: baseY + 14 * (fLines.length - 1 - i),
        size: 9,
        font,
        color: textDark,
      });
    });
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
