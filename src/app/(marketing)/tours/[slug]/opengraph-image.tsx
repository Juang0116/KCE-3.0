// src/app/tours/[slug]/opengraph-image.tsx (o la ruta donde tengas este handler)
import { ImageResponse } from 'next/og';
import { getTourBySlug } from '@/features/tours/data.mock';
import { formatCOP } from '@/utils/format';

export const runtime = 'edge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

type Params = { slug: string };

function truncate(text: string, max = 72) {
  const t = String(text || '').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

export default async function Image({ params }: { params: Params }) {
  const tour = getTourBySlug(params.slug);

  const title = truncate(tour?.title ?? 'Knowing Cultures Enterprise');
  const subtitle = tour
    ? `${tour.city} • ${formatCOP(tour.price)}`
    : 'Experiencias únicas en Colombia';

  // Intenta tomar una imagen principal (ajusta según tu shape real)
  const bgImage =
    (tour as any)?.image ||
    (Array.isArray((tour as any)?.images) ? (tour as any).images[0]?.url : undefined) ||
    undefined;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: 'linear-gradient(135deg, #0B3F78 0%, #0D5BA1 60%, #133B60 100%)',
          color: '#FFF5E1',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
        }}
      >
        {/* Fondo con imagen del tour (opcional) */}
        {bgImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            src={bgImage}
            width={1200}
            height={630}
            style={{
              position: 'absolute',
              inset: 0,
              objectFit: 'cover',
              opacity: 0.28,
              transform: 'scale(1.03)',
              filter: 'saturate(1.05) contrast(1.05)',
            }}
          />
        )}

        {/* Overlays de profundidad */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(1200px 630px at -20% 120%, rgba(255,195,0,0.18), transparent 60%)',
            mixBlendMode: 'screen',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(800px 480px at 110% -10%, rgba(13,91,161,0.45), transparent 60%)',
          }}
        />

        {/* Watermark sutil KCE */}
        <div
          style={{
            position: 'absolute',
            right: -20,
            bottom: -10,
            fontWeight: 800,
            fontSize: 220,
            lineHeight: 0.8,
            letterSpacing: -2,
            color: 'rgba(255,255,255,0.07)',
          }}
        >
          KCE
        </div>

        {/* Contenido */}
        <div
          style={{
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 20,
            padding: '64px 72px',
            width: '100%',
          }}
        >
          {/* Marca / breadcrumb */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: 0.2,
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 42,
                padding: '0 16px',
                borderRadius: 14,
                background: 'rgba(255,255,255,0.14)',
                color: '#FFFFFF',
                boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
                backdropFilter: 'blur(2px)',
              }}
            >
              KCE
            </div>
            <div
              style={{
                height: 8,
                width: 8,
                borderRadius: 999,
                background: '#FFC300',
                margin: '0 2px',
              }}
            />
            <div style={{ fontWeight: 600, opacity: 0.92, fontSize: 20 }}>knowing cultures</div>
          </div>

          {/* Título principal */}
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -0.5,
              textShadow: '0 2px 14px rgba(0,0,0,0.25)',
              maxWidth: 980,
            }}
          >
            {title}
          </div>

          {/* Subtítulo en píldora */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 18px',
              borderRadius: 16,
              background: 'rgba(17,24,39,0.35)',
              color: '#FFFDF6',
              fontSize: 30,
              fontWeight: 700,
              width: 'fit-content',
              boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
              border: '1px solid rgba(255,255,255,0.18)',
              backdropFilter: 'blur(2px)',
            }}
          >
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: '#FFC300' }} />
            {subtitle}
          </div>

          {/* Footer: dominio */}
          <div
            style={{
              marginTop: 10,
              fontSize: 26,
              color: 'rgba(255,255,255,0.92)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span
              style={{
                height: 20,
                width: 20,
                borderRadius: 6,
                background: '#FFC300',
                display: 'inline-block',
              }}
            />
            kce.travel
          </div>
        </div>

        {/* Acento diagonal en esquina */}
        <div
          style={{
            position: 'absolute',
            top: -60,
            left: -60,
            width: 240,
            height: 240,
            transform: 'rotate(45deg)',
            background: 'linear-gradient(135deg, #FFC300, #FFDD70)',
            opacity: 0.9,
            borderRadius: 24,
            boxShadow: '0 12px 36px rgba(0,0,0,0.18)',
          }}
        />
      </div>
    ),
    size,
  );
}
