-- Vigie NC — schéma Supabase/PostGIS (Sprint 1)
-- À exécuter dans l'éditeur SQL Supabase (ou via `supabase db push`)

create extension if not exists postgis;

-- ---------------------------------------------------------------------
-- Types de signalement — 'sos' inclus (voir components/SosButton.tsx)
-- ---------------------------------------------------------------------
create type report_type as enum (
  'sos',
  'trafic_dense',
  'accident',
  'route_coupee',
  'inondation',
  'chaussee_degradee',
  'autre'
);

-- ---------------------------------------------------------------------
-- Zones (axes/points suivis pour l'historique — hors périmètre Sprint 1,
-- table conservée pour la suite : écran Historique déjà prêt côté UI)
-- ---------------------------------------------------------------------
create table zones (
  id text primary key,
  name text not null,
  risk_label text,
  geom geography(point, 4326) not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Signalements — anonymes, position réelle, expiration sauf confirmation
-- ---------------------------------------------------------------------
create table reports (
  id uuid primary key default gen_random_uuid(),
  type report_type not null,

  -- Colonnes exploitées directement par le client (Supabase JS ne
  -- construit pas de géométrie PostGIS côté navigateur). `geom` est
  -- maintenu automatiquement à partir de lat/lng par le trigger
  -- ci-dessous, pour garder les requêtes spatiales possibles plus tard
  -- (ex: signalements dans un rayon donné).
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  geom geography(point, 4326),

  zone_id text references zones(id),
  photo_url text,
  confirmations int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '4 hours'),

  -- Identifiant anonyme côté appareil (lib/device-id.ts) — jamais un
  -- compte utilisateur. Sert à l'anti-spam et, plus tard, à empêcher
  -- qu'un appareil confirme son propre signalement.
  device_hash text not null
);

create index reports_geom_idx on reports using gist (geom);
create index reports_expires_at_idx on reports (expires_at);
create index reports_device_hash_created_at_idx on reports (device_hash, created_at);

create or replace function sync_report_geom()
returns trigger as $$
begin
  new.geom := geography(st_setsrid(st_makepoint(new.lng, new.lat), 4326));
  return new;
end;
$$ language plpgsql;

create trigger trg_sync_report_geom
before insert or update of lat, lng on reports
for each row execute function sync_report_geom();

-- ---------------------------------------------------------------------
-- Anti-spam — un même appareil ne peut créer qu'un signalement par
-- minute. Le SOS n'est jamais bloqué : mieux vaut un doublon qu'une
-- urgence silencieuse.
-- ---------------------------------------------------------------------
create or replace function enforce_report_rate_limit()
returns trigger as $$
declare
  last_report timestamptz;
begin
  if new.type = 'sos' then
    return new;
  end if;

  select created_at into last_report
  from reports
  where device_hash = new.device_hash
  order by created_at desc
  limit 1;

  if last_report is not null and new.created_at - last_report < interval '60 seconds' then
    raise exception 'rate_limit: un signalement a déjà été envoyé récemment depuis cet appareil';
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_enforce_report_rate_limit
before insert on reports
for each row execute function enforce_report_rate_limit();

-- ---------------------------------------------------------------------
-- Confirmations — chaque confirmation repousse l'expiration
-- ---------------------------------------------------------------------
create table report_confirmations (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  device_hash text not null,
  created_at timestamptz not null default now(),
  unique (report_id, device_hash)
);

create or replace function extend_report_on_confirmation()
returns trigger as $$
begin
  update reports
  set
    confirmations = confirmations + 1,
    expires_at = greatest(expires_at, now() + interval '2 hours')
  where id = new.report_id;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_extend_report_on_confirmation
after insert on report_confirmations
for each row execute function extend_report_on_confirmation();

-- ---------------------------------------------------------------------
-- Vue agrégée pour l'écran Historique (hors périmètre Sprint 1)
-- ---------------------------------------------------------------------
create view zone_history as
select
  z.id as zone_id,
  z.name as zone_name,
  z.risk_label,
  count(r.id) filter (where r.created_at > now() - interval '1 year') as incidents_this_year,
  array_agg(
    extract(month from r.created_at) order by r.created_at
  ) filter (where r.created_at > now() - interval '1 year') as incident_months
from zones z
left join reports r on r.zone_id = z.id
group by z.id, z.name, z.risk_label;

-- ---------------------------------------------------------------------
-- Stockage des photos de signalement (bucket public en lecture,
-- upload anonyme autorisé — la photo suit la même logique d'anonymat
-- que le reste du signalement)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('report-photos', 'report-photos', true)
on conflict (id) do nothing;

create policy "photos lecture publique"
  on storage.objects for select
  using (bucket_id = 'report-photos');

create policy "photos upload anonyme"
  on storage.objects for insert
  with check (
    bucket_id = 'report-photos'
    -- limite grossière côté politique : le vrai contrôle de taille/type
    -- se fait aussi côté client (input photo, accept="image/*")
  );

-- ---------------------------------------------------------------------
-- RLS — lecture publique (carte publique par nature du projet),
-- écriture anonyme limitée à l'insertion de signalements/confirmations.
-- ---------------------------------------------------------------------
alter table zones enable row level security;
alter table reports enable row level security;
alter table report_confirmations enable row level security;

create policy "zones lecture publique"
  on zones for select
  using (true);

create policy "reports lecture publique"
  on reports for select
  using (true);

create policy "reports insertion anonyme"
  on reports for insert
  with check (
    device_hash is not null and length(device_hash) > 0
  );

-- Pas d'update ni de delete anonyme sur reports : seule la fonction
-- extend_report_on_confirmation() (security definer) peut modifier
-- confirmations / expires_at.

create policy "confirmations insertion anonyme"
  on report_confirmations for insert
  with check (true);

create policy "confirmations lecture publique"
  on report_confirmations for select
  using (true);

-- ---------------------------------------------------------------------
-- Nettoyage : à brancher sur un cron Supabase (pg_cron) pour purger
-- les signalements expirés depuis plus de 24h.
-- ---------------------------------------------------------------------
-- select cron.schedule('purge-expired-reports', '0 * * * *', $$
--   delete from reports where expires_at < now() - interval '24 hours';
-- $$);
