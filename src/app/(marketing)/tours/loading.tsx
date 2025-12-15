// src/app/(marketing)/tours/loading.tsx
// Server Component — no "use client"

export default function Loading() {
  const cards = Array.from({ length: 6 });

  // Utilidad: bloque skeleton con fallback (animate-pulse) además de tu clase "skeleton"
  const Sk = ({ className = '' }: { className?: string }) => (
    <div
      className={[
        'skeleton',
        'animate-pulse motion-reduce:animate-none',
        'bg-black/5',
        'rounded-xl',
        className,
      ].join(' ')}
      aria-hidden="true"
    />
  );

  return (
    <main
      className="mx-auto max-w-6xl px-6 py-12"
      aria-busy="true"
      aria-describedby="loading-announcer"
    >
      {/* Anunciador accesible para lectores de pantalla */}
      <p id="loading-announcer" className="sr-only" role="status" aria-live="polite">
        Cargando tours…
      </p>

      {/* Encabezado (skeleton) */}
      <header className="mb-6" aria-hidden="true">
        <Sk className="h-8 w-72 rounded-2xl" />
        <Sk className="mt-2 h-4 w-96 rounded-2xl" />
      </header>

      {/* Toolbar (skeleton) */}
      <section
        className="grid gap-3 rounded-2xl border border-brand-dark/10 bg-[color:var(--color-surface)] p-4 shadow-soft md:grid-cols-4"
        aria-hidden="true"
      >
        <Sk className="h-10 rounded-xl" />
        <Sk className="h-10 rounded-xl" />
        <Sk className="h-10 rounded-xl" />
        <div className="flex gap-2">
          <Sk className="h-10 flex-1 rounded-xl" />
          <Sk className="h-10 w-24 rounded-xl" />
          <Sk className="h-10 w-20 rounded-xl" />
        </div>
      </section>

      {/* Cards (skeleton) */}
      <section className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((_, i) => (
          <article
            key={i}
            className="overflow-hidden rounded-2xl border border-brand-dark/10 bg-[color:var(--color-surface)] shadow-soft"
            aria-hidden="true"
          >
            {/* Imagen */}
            <div className="relative h-48 w-full">
              <Sk className="absolute inset-0 rounded-none" />
              {/* Cinta sutil de marca para coherencia visual */}
              <div
                className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-brand-blue/15 to-transparent"
                aria-hidden="true"
              />
            </div>

            {/* Contenido */}
            <div className="space-y-2 p-4">
              <Sk className="h-5 w-3/4" />
              <Sk className="h-4 w-full" />
              <Sk className="h-4 w-2/3" />

              <div className="mt-2 flex items-center justify-between">
                <Sk className="h-4 w-24" />
                <Sk className="h-5 w-20" />
              </div>

              <div className="flex gap-2 pt-2">
                <Sk className="h-6 w-20 rounded-full" />
                <Sk className="h-6 w-20 rounded-full" />
                <Sk className="h-6 w-20 rounded-full" />
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
