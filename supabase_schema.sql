-- ============================================================
-- KCE 3.0 — Esquema Supabase (PostgreSQL) — FINAL ✅
-- Idempotente: lo puedes ejecutar las veces que quieras
-- Corrige Security Advisor: search_path, extensiones, RLS, triggers
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 0) Extensiones en schema "extensions" (si es posible)
-- ─────────────────────────────────────────────────────────────
create schema if not exists extensions;

do $$
begin
  -- pgcrypto
  if not exists (select 1 from pg_extension where extname='pgcrypto') then
    execute 'create extension pgcrypto with schema extensions';
  else
    if (select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace
        where e.extname='pgcrypto') <> 'extensions' then
      begin
        execute 'alter extension pgcrypto set schema extensions';
      exception when feature_not_supported then
        raise notice 'pgcrypto no es relocatable; se deja en su schema actual.';
      end;
    end if;
  end if;

  -- pg_trgm
  if not exists (select 1 from pg_extension where extname='pg_trgm') then
    execute 'create extension pg_trgm with schema extensions';
  else
    if (select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace
        where e.extname='pg_trgm') <> 'extensions' then
      begin
        execute 'alter extension pg_trgm set schema extensions';
      exception when feature_not_supported then
        raise notice 'pg_trgm no es relocatable; se deja en su schema actual.';
      end;
    end if;
  end if;

  -- btree_gin
  if not exists (select 1 from pg_extension where extname='btree_gin') then
    execute 'create extension btree_gin with schema extensions';
  else
    if (select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace
        where e.extname='btree_gin') <> 'extensions' then
      begin
        execute 'alter extension btree_gin set schema extensions';
      exception when feature_not_supported then
        raise notice 'btree_gin no es relocatable; se deja en su schema actual.';
      end;
    end if;
  end if;
end$$;

-- ─────────────────────────────────────────────────────────────
-- 1) Función utilitaria con search_path fijo (linter feliz)
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Limpieza: funciones/triggers viejos de tsvector (si quedaron)
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where p.proname='tours_refresh_tsv' and n.nspname='public') then
    execute 'drop function public.tours_refresh_tsv()';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where p.proname='tours_search_tsv_update' and n.nspname='public') then
    execute 'drop function public.tours_search_tsv_update()';
  end if;
  execute 'drop trigger if exists trg_tours_refresh_tsv on public.tours';
  execute 'drop trigger if exists trg_tours_search_tsv on public.tours';
end$$;

-- ─────────────────────────────────────────────────────────────
-- 2) Tablas y policies (estado final)
-- ─────────────────────────────────────────────────────────────

-- 2.1 customers_profile (PII opcional)
create table if not exists public.customers_profile (
  user_id     uuid primary key,
  full_name   text,
  phone       text,
  locale      text default 'es-CO',
  preferences jsonb,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
drop trigger if exists trg_customers_profile_updated on public.customers_profile;
create trigger trg_customers_profile_updated
before update on public.customers_profile
for each row execute function public.set_updated_at();
alter table public.customers_profile enable row level security;

-- 2.2 tours (catálogo público) — columna generada para búsqueda (sin triggers)
create table if not exists public.tours (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null,
  title           text not null,
  city            text not null,
  tags            text[],
  base_price      integer not null check (base_price >= 0),
  duration_hours  int,
  images          jsonb,
  summary         text,
  body_md         text,
  search_tsv      tsvector generated always as (
    setweight(to_tsvector('spanish', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(city, '')), 'C') ||
    setweight(to_tsvector('spanish', array_to_string(coalesce(tags,'{}'::text[]), ' ')), 'D')
  ) stored,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- slug único case-insensitive
do $$
begin
  if not exists (
    select 1 from pg_indexes where schemaname='public' and tablename='tours' and indexname='uq_tours_slug_nocase'
  ) then
    execute 'create unique index uq_tours_slug_nocase on public.tours (lower(slug))';
  end if;
end$$;

create index if not exists idx_tours_city       on public.tours(city);
create index if not exists idx_tours_tags_gin   on public.tours using gin (tags);
create index if not exists idx_tours_search_tsv on public.tours using gin (search_tsv);

drop trigger if exists trg_tours_updated on public.tours;
create trigger trg_tours_updated
before update on public.tours
for each row execute function public.set_updated_at();

alter table public.tours enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='tours' and policyname='tours_public_select'
  ) then
    create policy tours_public_select on public.tours
      for select to anon, authenticated using (true);
  end if;
end$$;
grant usage on schema public to anon, authenticated;
grant select on table public.tours to anon, authenticated;

-- 2.3 tour_availability (consulta pública)
create table if not exists public.tour_availability (
  id        uuid primary key default gen_random_uuid(),
  tour_id   uuid references public.tours(id) on delete cascade,
  date      date not null,
  capacity  int not null check (capacity >= 0),
  price     integer,              -- si es NULL, usar base_price
  unique (tour_id, date)
);
create index if not exists idx_avail_tour_date on public.tour_availability(tour_id, date);

alter table public.tour_availability enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='tour_availability' and policyname='availability_public_select'
  ) then
    create policy availability_public_select on public.tour_availability
      for select to anon, authenticated using (true);
  end if;
end$$;
grant select on table public.tour_availability to anon, authenticated;

-- 2.4 bookings (cerrado; sólo service_role)
create table if not exists public.bookings (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid,
  tour_id            uuid references public.tours(id) on delete set null,
  date               date not null,
  persons            int  not null check (persons > 0),
  extras             jsonb,
  status             text check (status in ('pending','paid','canceled')) default 'pending',
  total              integer,                      -- minor units
  currency           text default 'COP' check (char_length(currency)=3),
  payment_provider   text,
  stripe_session_id  text unique,
  customer_email     text,
  customer_name      text,
  phone              text,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);
create index if not exists idx_bookings_tour_date on public.bookings(tour_id, date);
create index if not exists idx_bookings_status    on public.bookings(status);
drop trigger if exists trg_bookings_updated on public.bookings;
create trigger trg_bookings_updated
before update on public.bookings
for each row execute function public.set_updated_at();

alter table public.bookings enable row level security;

-- (silenciar "RLS enabled, no policy") → deny-all explícito
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bookings') then
    create policy bookings_deny_all on public.bookings
      for all to anon, authenticated using (false) with check (false);
  end if;
end$$;

-- 2.5 reviews (públicas con moderación + honeypot)
create table if not exists public.reviews (
  id         uuid primary key default gen_random_uuid(),
  tour_id    uuid references public.tours(id) on delete cascade,
  tour_slug  text references public.tours(slug) on delete cascade,
  user_id    uuid,
  rating     int  check (rating between 1 and 5),
  comment    text,
  approved   boolean default false,
  honeypot   text,
  ip         inet,
  created_at timestamptz default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname='reviews_tour_ref_check') then
    alter table public.reviews
      add constraint reviews_tour_ref_check
      check (tour_id is not null or tour_slug is not null);
  end if;
end$$;

create index if not exists idx_reviews_tour_id   on public.reviews(tour_id);
create index if not exists idx_reviews_tour_slug on public.reviews(tour_slug);
create index if not exists idx_reviews_approved  on public.reviews(approved);

alter table public.reviews enable row level security;

-- Limpia nombres heredados si existieran
do $$
begin
  if exists (select 1 from pg_policies where schemaname='public' and tablename='reviews' and policyname='reviews_public_select') then
    execute 'drop policy reviews_public_select on public.reviews';
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='reviews' and policyname='reviews_public_insert') then
    execute 'drop policy reviews_public_insert on public.reviews';
  end if;
end$$;

-- Políticas finales
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='reviews' and policyname='reviews_select_approved') then
    create policy reviews_select_approved
      on public.reviews for select to anon, authenticated
      using (approved = true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='reviews' and policyname='reviews_public_insert') then
    create policy reviews_public_insert
      on public.reviews for insert to anon, authenticated
      with check (coalesce(honeypot,'') = '' and approved = false and rating between 1 and 5);
  end if;
end$$;

grant usage on schema public to anon, authenticated;
grant select on table public.tours, public.tour_availability to anon, authenticated;
grant select, insert on table public.reviews to anon, authenticated;

-- 2.6 events (cerrado; sólo service_role)
create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid,
  type       text not null,
  payload    jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_events_type       on public.events(type);
create index if not exists idx_events_created_at on public.events(created_at);
alter table public.events enable row level security;

-- (silenciar "RLS enabled, no policy") → deny-all explícito
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='events') then
    create policy events_deny_all on public.events
      for all to anon, authenticated using (false) with check (false);
  end if;
end$$;

-- ============================================================
-- FIN ✅
-- ============================================================
