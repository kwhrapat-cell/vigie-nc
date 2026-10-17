-- =====================================================================
-- Petit « faux Supabase » pour tester schema.sql sur un Postgres + PostGIS
-- ordinaire (vérification automatique GitHub, ou Postgres local).
-- Crée seulement ce que schema.sql utilise : rôles, auth.uid(), tables
-- auth.users / auth.audit_log_entries, storage.buckets / storage.objects.
-- À lancer AVANT schema.sql, avec search_path = public, extensions.
-- Ne JAMAIS lancer sur le vrai projet Supabase.
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Même définition que Supabase : l'identité vient du jeton (JWT).
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create table if not exists auth.users (
  id uuid primary key,
  is_anonymous boolean not null default false,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists auth.audit_log_entries (
  id uuid primary key default gen_random_uuid(),
  ip_address text,
  created_at timestamptz not null default now()
);

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner_id text,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;
