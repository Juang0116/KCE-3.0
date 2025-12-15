/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'KCE — Experiencias únicas';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  const BASE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://kce.travel').replace(/\/+$/, '');
  const LOGO = `${BASE}/logo.png`;

  return new ImageResponse(
    (
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'stretch',
          background: '#0D5BA1',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
        }}
      >
        {/* Backdrop gradiente */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(135deg, #0D5BA1 0%, #063B69 60%)',
          }}
        />

        {/* Beam amarillo difuminado */}
        <div
          style={{
            position: 'absolute',
            top: -120,
            right: -120,
            width: 520,
            height: 520,
            background: '#FFC300',
            opacity: 0.14,
            filter: 'blur(60px)',
            borderRadius: 9999,
          }}
        />

        {/* Grid sutil */}
        <svg width="1200" height="630" style={{ position: 'absolute', inset: 0, opacity: 0.08 }}>
          <defs>
            <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#FFF5E1" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="1200" height="630" fill="url(#grid)" />
        </svg>

        {/* Contenido */}
        <div
          style={{
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 24,
            padding: 72,
            color: '#FFF5E1',
            width: '100%',
          }}
        >
          {/* Logo + marca */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <img
              src={LOGO}
              alt=""
              width={60}
              height={60}
              style={{
                borderRadius: 12,
                background: '#ffffff',
                padding: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,.25)',
                objectFit: 'contain',
              }}
            />
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 0.3 }}>
              Knowing Cultures Enterprise
            </div>
          </div>

          {/* Headline (sincronizado con el Hero) */}
          <div style={{ lineHeight: 1.05 }}>
            <span style={{ display: 'block', fontSize: 82, fontWeight: 800 }}>
              More than a trip,
            </span>
            <span
              style={{
                display: 'inline-block',
                marginTop: 8,
                padding: '6px 14px',
                borderRadius: 12,
                background: 'rgba(255,195,0,.18)',
                fontSize: 80,
                fontWeight: 900,
              }}
            >
              a cultural awakening.
            </span>
          </div>

          {/* Subhead + dominio */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 30, opacity: 0.95 }}>
              Experiencias únicas en Colombia — seguras, auténticas y memorables.
            </div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>kce.travel</div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
