// src/features/tours/components/ToursToolbar.tsx
'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

type Sort = 'popular' | 'price-asc' | 'price-desc';

export type ToursToolbarProps = {
  initial: { q: string; tag: string; city: string; sort: Sort };
  tags: string[];
  cities: string[];
};

function normalizeSort(v?: string | null): Sort {
  return v === 'price-asc' || v === 'price-desc' ? v : 'popular';
}

function uniqList(list: string[]) {
  return Array.from(new Set(list.filter(Boolean)));
}

function buildQS(
  base: URLSearchParams,
  values: { q?: string; tag?: string; city?: string; sort?: Sort },
) {
  const p = new URLSearchParams(base.toString());

  // Elimina claves que controlamos (evita duplicados y mantiene utm/chat/etc)
  for (const k of ['q', 'tag', 'city', 'sort']) p.delete(k);

  const q = (values.q || '').trim();
  if (q) p.set('q', q);
  if (values.tag) p.set('tag', values.tag);
  if (values.city) p.set('city', values.city);
  if (values.sort && values.sort !== 'popular') p.set('sort', values.sort);

  const qs = p.toString();
  return qs ? `?${qs}` : '';
}

export default function ToursToolbar({ initial, tags, cities }: ToursToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Opciones únicas/ordenadas (evita repeticiones si vienen del backend)
  const tagOptions = React.useMemo(() => uniqList(tags).sort(), [tags]);
  const cityOptions = React.useMemo(() => uniqList(cities).sort(), [cities]);

  // Estado local controlado
  const [q, setQ] = React.useState(initial.q ?? '');
  const [tag, setTag] = React.useState(initial.tag ?? '');
  const [city, setCity] = React.useState(initial.city ?? '');
  const [sort, setSort] = React.useState<Sort>(initial.sort ?? 'popular');

  // Transiciones de navegación
  const [isPending, startTransition] = React.useTransition();

  // Sync con navegación (atrás/adelante o enlaces externos)
  React.useEffect(() => {
    if (!searchParams) return;
    setQ(searchParams.get('q') ?? '');
    setTag(searchParams.get('tag') ?? '');
    setCity(searchParams.get('city') ?? '');
    setSort(normalizeSort(searchParams.get('sort')));
  }, [searchParams]);

  // Aplicar cambios (push o replace)
  const apply = React.useCallback(
    (opts?: {
      replace?: boolean;
      next?: Partial<{ q: string; tag: string; city: string; sort: Sort }>;
    }) => {
      const nextQ = opts?.next?.q ?? q;
      const nextTag = opts?.next?.tag ?? tag;
      const nextCity = opts?.next?.city ?? city;
      const nextSort = opts?.next?.sort ?? sort;

      const base = searchParams ?? new URLSearchParams();
      const qs = buildQS(base, { q: nextQ, tag: nextTag, city: nextCity, sort: nextSort });
      const href = `${pathname}${qs}`;

      startTransition(() => {
        (opts?.replace ? router.replace : router.push)(href, { scroll: false });
      });
    },
    [q, tag, city, sort, pathname, router, searchParams],
  );

  // Limpiar filtros
  const clear = React.useCallback(() => {
    setQ('');
    setTag('');
    setCity('');
    setSort('popular');
    startTransition(() => {
      const base = searchParams ?? new URLSearchParams();
      const href = `${pathname}${buildQS(base, { q: '', tag: '', city: '', sort: 'popular' })}`;
      router.push(href, { scroll: false });
    });
  }, [pathname, router, searchParams]);

  const hasFilters = Boolean(q.trim() || tag || city || (sort && sort !== 'popular'));

  // Debounce para búsqueda por texto
  React.useEffect(() => {
    const id = window.setTimeout(() => apply({ replace: true, next: { q } }), 300);
    return () => window.clearTimeout(id);
  }, [q, apply]);

  return (
    <form
      role="search"
      aria-label="Filtros de tours"
      className="grid gap-3 rounded-2xl border border-brand-dark/10 bg-[color:var(--color-surface)] p-4 shadow-soft md:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        apply(); // botón Aplicar → push
      }}
      aria-busy={isPending || undefined}
    >
      {/* Search */}
      <div className="flex flex-col">
        <label htmlFor="tours-q" className="sr-only">
          Buscar
        </label>
        <input
          id="tours-q"
          name="q"
          inputMode="search"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          onBlur={() => apply({ replace: true, next: { q } })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              apply(); // Enter → push (historial)
            }
          }}
          placeholder="Buscar (p. ej. café, historia)…"
          className="rounded-xl border border-brand-dark/15 px-3 py-2"
        />
      </div>

      {/* Tag */}
      <div className="flex flex-col">
        <label htmlFor="tours-tag" className="sr-only">
          Tema
        </label>
        <select
          id="tours-tag"
          name="tag"
          value={tag}
          onChange={(e) => {
            const value = e.currentTarget.value;
            setTag(value);
            apply({ replace: true, next: { tag: value } });
          }}
          className="rounded-xl border border-brand-dark/15 px-3 py-2"
        >
          <option value="">Todos los temas</option>
          {tagOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* City */}
      <div className="flex flex-col">
        <label htmlFor="tours-city" className="sr-only">
          Ciudad
        </label>
        <select
          id="tours-city"
          name="city"
          value={city}
          onChange={(e) => {
            const value = e.currentTarget.value;
            setCity(value);
            apply({ replace: true, next: { city: value } });
          }}
          className="rounded-xl border border-brand-dark/15 px-3 py-2"
        >
          <option value="">Todas las ciudades</option>
          {cityOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Sort + actions */}
      <div className="flex items-stretch gap-2">
        <div className="flex-1">
          <label htmlFor="tours-sort" className="sr-only">
            Ordenar
          </label>
          <select
            id="tours-sort"
            name="sort"
            value={sort}
            onChange={(e) => {
              const value = normalizeSort(e.currentTarget.value);
              setSort(value);
              apply({ replace: true, next: { sort: value } });
            }}
            className="w-full rounded-xl border border-brand-dark/15 px-3 py-2"
          >
            <option value="popular">Más populares</option>
            <option value="price-asc">Precio: bajo → alto</option>
            <option value="price-desc">Precio: alto → bajo</option>
          </select>
        </div>

        <button
          type="submit"
          className="rounded-xl bg-brand-blue px-4 py-2 font-heading text-white disabled:opacity-60"
          disabled={isPending}
        >
          {isPending ? 'Aplicando…' : 'Aplicar'}
        </button>

        <button
          type="button"
          className="rounded-xl border border-brand-dark/15 px-3 py-2 disabled:opacity-50"
          onClick={clear}
          disabled={!hasFilters || isPending}
          aria-label="Limpiar filtros"
          title="Limpiar filtros"
        >
          Limpiar
        </button>
      </div>

      {/* Chips activos */}
      {hasFilters && (
        <div className="md:col-span-4">
          <ul className="flex flex-wrap gap-2 text-sm">
            {q.trim() && (
              <li className="rounded-full bg-[color:var(--color-bg)] px-3 py-1">
                “{q.trim()}”
                <button
                  type="button"
                  className="ml-2 text-[color:var(--color-text)]/60 hover:text-[color:var(--color-text)]"
                  aria-label="Quitar búsqueda"
                  onClick={() => {
                    setQ('');
                    apply({ replace: true, next: { q: '' } });
                  }}
                >
                  ×
                </button>
              </li>
            )}
            {tag && (
              <li className="rounded-full bg-[color:var(--color-bg)] px-3 py-1">
                #{tag}
                <button
                  type="button"
                  className="ml-2 text-[color:var(--color-text)]/60 hover:text-[color:var(--color-text)]"
                  aria-label="Quitar tema"
                  onClick={() => {
                    setTag('');
                    apply({ replace: true, next: { tag: '' } });
                  }}
                >
                  ×
                </button>
              </li>
            )}
            {city && (
              <li className="rounded-full bg-[color:var(--color-bg)] px-3 py-1">
                {city}
                <button
                  type="button"
                  className="ml-2 text-[color:var(--color-text)]/60 hover:text-[color:var(--color-text)]"
                  aria-label="Quitar ciudad"
                  onClick={() => {
                    setCity('');
                    apply({ replace: true, next: { city: '' } });
                  }}
                >
                  ×
                </button>
              </li>
            )}
            {sort !== 'popular' && (
              <li className="rounded-full bg-[color:var(--color-bg)] px-3 py-1">
                {sort === 'price-asc' ? 'Precio ↑' : 'Precio ↓'}
                <button
                  type="button"
                  className="ml-2 text-[color:var(--color-text)]/60 hover:text-[color:var(--color-text)]"
                  aria-label="Quitar orden"
                  onClick={() => {
                    setSort('popular');
                    apply({ replace: true, next: { sort: 'popular' } });
                  }}
                >
                  ×
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </form>
  );
}
