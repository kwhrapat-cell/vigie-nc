-- =====================================================================
-- Vigie NC — schéma Supabase / PostGIS (Sprint 2 — maquettes)
--
-- À exécuter dans l'éditeur SQL Supabase (SQL Editor > New query > Run).
-- Le script est ré-exécutable : il fonctionne sur une base vide comme sur
-- une base où une version précédente a déjà été passée (il migre alors
-- les données existantes). Il peut être lancé d'un bloc depuis l'éditeur
-- SQL : les nouvelles valeurs de type ne sont utilisées qu'en texte dans
-- les fonctions, ce qui évite l'erreur « unsafe use of new value ».
--
-- Principes :
--   - toutes les écritures passent par des fonctions (RPC) contrôlées côté
--     serveur : le téléphone ne peut plus choisir lui-même l'expiration ou
--     le nombre de confirmations d'un signalement ;
--   - l'identifiant anonyme de l'appareil n'est jamais lisible
--     publiquement (sinon on pourrait reconstituer les déplacements d'une
--     personne à partir de ses signalements) et il est stocké sous forme
--     d'empreinte, jamais en clair ;
--   - un même événement signalé plusieurs fois à proximité = un seul point
--     sur la carte, avec un compteur de confirmations.
-- =====================================================================

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Types de signalement
-- (« incivilité » et « véhicule volé » volontairement absents : on s'en
-- tient à des informations d'infrastructure vérifiables)
-- ---------------------------------------------------------------------
do $$
begin
  create type report_type as enum (
    'sos',
    'trafic_dense',
    'accident',
    'route_coupee',
    'inondation',
    'chaussee_degradee',
    'autre',
    'danger',
    'travaux',
    'meteo'
  );
exception
  when duplicate_object then null;
end $$;

-- Valeurs ajoutées après le Sprint 1 (sans effet si elles existent déjà)
alter type report_type add value if not exists 'danger';
alter type report_type add value if not exists 'travaux';
alter type report_type add value if not exists 'meteo';

-- Empreinte de l'identifiant d'appareil (lib/device-id.ts). L'identifiant
-- brut reste sur le téléphone ; la base ne garde que son empreinte.
create or replace function vigie_device_key(p_device_id text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(digest('vigie-nc:' || p_device_id, 'sha256'), 'hex');
$$;

-- ---------------------------------------------------------------------
-- Zones suivies (historique — branché au Sprint 3)
-- ---------------------------------------------------------------------
create table if not exists zones (
  id text primary key,
  name text not null,
  risk_label text,
  geom geography(point, 4326) not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Signalements
-- ---------------------------------------------------------------------
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  type report_type not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  geom geography(point, 4326),
  zone_id text references zones(id),
  photo_url text,
  confirmations int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '4 hours')
);

alter table reports add column if not exists infirmations int not null default 0;
alter table reports add column if not exists last_confirmed_at timestamptz;
-- Rempli quand l'événement est déclaré terminé (par son auteur ou par la
-- majorité des votes). On garde la ligne : elle nourrit l'historique.
alter table reports add column if not exists resolved_at timestamptz;
-- Détails saisis à l'étape 3 du signalement
alter table reports add column if not exists description text;
alter table reports add column if not exists niveau_risque text;
-- Lieu lisible (« RT1, Dumbéa »), déduit de la position sur le téléphone
alter table reports add column if not exists lieu text;
-- Rempli à la main par l'équipe (mairie, pompiers…) : niveau « Vérifié »
alter table reports add column if not exists source_officielle text;
-- Info relayée (vue sur Facebook, à la radio, par SMS…) par quelqu'un qui
-- n'est pas forcément sur place ; nul = signalement fait sur le terrain.
alter table reports add column if not exists relais_source text;
-- Rempli quand la modération a masqué la photo et la description (après
-- signalements de contenu ou à la main). Le contenu retiré est gardé à
-- part dans report_contenu_masque, illisible depuis l'appli.
alter table reports add column if not exists contenu_masque_at timestamptz;

do $$
begin
  alter table reports add constraint reports_description_longueur
    check (description is null or char_length(description) <= 200);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table reports add constraint reports_niveau_risque_valeurs
    check (niveau_risque is null or niveau_risque in ('faible', 'moyen', 'eleve'));
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table reports add constraint reports_lieu_longueur
    check (lieu is null or char_length(lieu) <= 80);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table reports add constraint reports_relais_source_valeurs
    check (relais_source is null or relais_source in ('facebook', 'radio', 'sms', 'autre'));
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table reports add constraint reports_source_longueur
    check (source_officielle is null or char_length(source_officielle) <= 60);
exception when duplicate_object then null;
end $$;

create index if not exists reports_geom_idx on reports using gist (geom);
create index if not exists reports_expires_at_idx on reports (expires_at);
create index if not exists reports_type_expires_idx on reports (type, expires_at);
create index if not exists reports_created_at_idx on reports (created_at desc);

-- Auteur d'un signalement — table privée, jamais lisible depuis l'appli.
create table if not exists report_authors (
  report_id uuid primary key references reports(id) on delete cascade,
  device_key text not null,
  created_at timestamptz not null default now()
);
create index if not exists report_authors_device_idx
  on report_authors (device_key, created_at desc);

-- Votes « toujours là » / « c'est terminé » — un vote par appareil et par
-- signalement (modifiable). Table privée elle aussi.
create table if not exists report_votes (
  report_id uuid not null references reports(id) on delete cascade,
  device_key text not null,
  vote text not null check (vote in ('present', 'termine')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (report_id, device_key)
);
create index if not exists report_votes_device_idx
  on report_votes (device_key, updated_at desc);

-- Signalements de contenu (photo ou texte qui pose problème) — un par
-- appareil et par signalement. Table privée.
create table if not exists report_flags (
  report_id uuid not null references reports(id) on delete cascade,
  device_key text not null,
  motif text not null check (motif in ('donnee_personnelle', 'inapproprie', 'hors_sujet')),
  created_at timestamptz not null default now(),
  primary key (report_id, device_key)
);
create index if not exists report_flags_device_idx
  on report_flags (device_key, created_at desc);

-- Photo et description retirées par la modération, gardées à part pour
-- pouvoir les rétablir en cas d'erreur (effacées après 90 jours par la
-- purge). Table privée.
create table if not exists report_contenu_masque (
  report_id uuid primary key references reports(id) on delete cascade,
  photo_url text,
  description text,
  raison text not null check (raison in ('signalements', 'moderation')),
  masque_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Migration depuis le Sprint 1 (sans effet sur une base neuve)
-- ---------------------------------------------------------------------
drop trigger if exists trg_enforce_report_rate_limit on reports;
drop function if exists enforce_report_rate_limit();

do $$
begin
  -- 1. device_hash en clair dans `reports` -> empreinte dans report_authors
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reports' and column_name = 'device_hash'
  ) then
    insert into report_authors (report_id, device_key, created_at)
    select id, vigie_device_key(device_hash), created_at
    from reports
    where device_hash is not null
    on conflict (report_id) do nothing;

    drop policy if exists "reports insertion anonyme" on reports;
    alter table reports drop column device_hash;
  end if;

  -- 2. report_confirmations -> report_votes
  if to_regclass('public.report_confirmations') is not null then
    insert into report_votes (report_id, device_key, vote, created_at, updated_at)
    select report_id, vigie_device_key(device_hash), 'present', created_at, created_at
    from report_confirmations
    on conflict (report_id, device_key) do nothing;

    drop table report_confirmations cascade;
  end if;
end $$;

drop function if exists extend_report_on_confirmation();

-- ---------------------------------------------------------------------
-- Colonne géographique maintenue automatiquement depuis lat/lng
-- ---------------------------------------------------------------------
create or replace function sync_report_geom()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.geom := st_setsrid(st_makepoint(new.lng, new.lat), 4326)::geography;
  return new;
end;
$$;

drop trigger if exists trg_sync_report_geom on reports;
create trigger trg_sync_report_geom
before insert or update of lat, lng on reports
for each row execute function sync_report_geom();

-- ---------------------------------------------------------------------
-- Règles métier par type de signalement
-- ---------------------------------------------------------------------

-- Rayon dans lequel un nouveau signalement du même type est considéré
-- comme le même événement (0 = jamais regroupé). Un accident est
-- ponctuel ; une inondation ou une route coupée couvre une portion de
-- route plus longue, signalée par des gens qui ne sont pas au même endroit.
create or replace function vigie_rayon_fusion_m(p_type report_type)
returns int
language sql
immutable
set search_path = public
as $$
  select case p_type::text
    when 'accident'          then 300
    when 'danger'            then 300
    when 'travaux'           then 300
    when 'trafic_dense'      then 500
    when 'route_coupee'      then 800
    when 'inondation'        then 1000
    when 'meteo'             then 2000
    when 'chaussee_degradee' then 150
    else 0  -- 'sos' et 'autre' : jamais regroupés
  end;
$$;

-- Durée de vie sans nouvelle confirmation. Chaque « toujours là » relance
-- ce compte à rebours à partir de maintenant.
create or replace function vigie_duree_vie(p_type report_type)
returns interval
language sql
immutable
set search_path = public
as $$
  select case p_type::text
    when 'trafic_dense'      then interval '1 hour'
    when 'accident'          then interval '2 hours'
    when 'sos'               then interval '2 hours'
    when 'danger'            then interval '3 hours'
    when 'meteo'             then interval '3 hours'
    when 'route_coupee'      then interval '4 hours'
    when 'inondation'        then interval '4 hours'
    when 'travaux'           then interval '3 days'
    when 'chaussee_degradee' then interval '3 days'
    else interval '3 hours'
  end;
$$;

-- Ordre des niveaux de risque saisis par les usagers
create or replace function vigie_rang_risque(p_niveau text)
returns int
language sql
immutable
set search_path = public
as $$
  select case p_niveau when 'faible' then 1 when 'moyen' then 2 when 'eleve' then 3 else 0 end;
$$;

-- Emprise de la Nouvelle-Calédonie (Grande Terre, Belep, îles Loyauté,
-- île des Pins) — refuse les positions aberrantes ou envoyées par des robots.
create or replace function vigie_dans_nc(p_lat double precision, p_lng double precision)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_lat between -23.2 and -19.0 and p_lng between 163.0 and 168.6;
$$;

-- ---------------------------------------------------------------------
-- Vote (fonction interne, non appelable depuis l'appli)
-- ---------------------------------------------------------------------
create or replace function vigie_appliquer_vote(
  p_report_id uuid,
  p_device_key text,
  p_vote text
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_report reports%rowtype;
  v_auteur text;
  v_precedent text;
begin
  select * into v_report from reports where id = p_report_id for update;
  if not found then
    raise exception 'signalement_introuvable';
  end if;
  if v_report.resolved_at is not null or v_report.expires_at <= now() then
    raise exception 'signalement_termine';
  end if;

  select device_key into v_auteur from report_authors where report_id = p_report_id;

  -- L'auteur peut clore son propre signalement, mais pas le confirmer.
  if v_auteur = p_device_key then
    if p_vote = 'present' then
      raise exception 'propre_signalement';
    end if;
    update reports set resolved_at = now(), expires_at = now() where id = p_report_id;
    return 'resolu';
  end if;

  select vote into v_precedent
  from report_votes
  where report_id = p_report_id and device_key = p_device_key;

  if v_precedent = p_vote then
    return 'deja_vote';
  end if;

  if v_precedent is null then
    insert into report_votes (report_id, device_key, vote)
    values (p_report_id, p_device_key, p_vote);
  else
    update report_votes
    set vote = p_vote, updated_at = now()
    where report_id = p_report_id and device_key = p_device_key;
  end if;

  -- Compteurs recalculés depuis les votes (source de vérité unique).
  update reports r
  set confirmations = c.presents,
      infirmations = c.termines
  from (
    select
      count(*) filter (where vote = 'present')::int as presents,
      count(*) filter (where vote = 'termine')::int as termines
    from report_votes
    where report_id = p_report_id
  ) c
  where r.id = p_report_id
  returning r.* into v_report;

  if p_vote = 'present' then
    update reports
    set expires_at = greatest(expires_at, now() + vigie_duree_vie(type)),
        last_confirmed_at = now()
    where id = p_report_id;
    return 'confirme';
  end if;

  -- p_vote = 'termine' : clos si les « terminé » l'emportent, sinon le
  -- signalement s'efface dans 30 min au plus, sauf nouvelle confirmation.
  if v_report.infirmations > v_report.confirmations then
    update reports set resolved_at = now(), expires_at = now() where id = p_report_id;
    return 'resolu';
  end if;

  update reports
  set expires_at = least(expires_at, now() + interval '30 minutes')
  where id = p_report_id;
  return 'en_baisse';
end;
$$;

-- ---------------------------------------------------------------------
-- RPC : créer un signalement (ou confirmer l'existant s'il s'agit du
-- même événement)
--   select creer_signalement('inondation', -22.27, 166.45, '<id appareil>');
-- Retour : {"id": "...", "resultat": "cree" | "fusionne" | "deja_signale"}
-- ---------------------------------------------------------------------
drop function if exists creer_signalement(report_type, double precision, double precision, text, text);

create or replace function creer_signalement(
  p_type report_type,
  p_lat double precision,
  p_lng double precision,
  p_device_id text,
  p_photo_url text default null,
  p_description text default null,
  p_niveau_risque text default null,
  p_lieu text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_point geography;
  v_dernier timestamptz;
  v_existant record;
  v_rayon int;
  v_id uuid;
  v_description text := nullif(btrim(p_description), '');
  v_niveau text := nullif(btrim(p_niveau_risque), '');
  v_lieu text := left(nullif(btrim(p_lieu), ''), 80);
begin
  if p_device_id is null or length(p_device_id) not between 16 and 128 then
    raise exception 'appareil_invalide';
  end if;
  if p_lat is null or p_lng is null or not vigie_dans_nc(p_lat, p_lng) then
    raise exception 'position_hors_nc';
  end if;
  if p_photo_url is not null
     and p_photo_url !~ '^https://[^/]+/storage/v1/object/public/report-photos/[A-Za-z0-9._-]+$' then
    raise exception 'photo_invalide';
  end if;
  if v_description is not null and char_length(v_description) > 200 then
    raise exception 'description_trop_longue';
  end if;
  if v_niveau is not null and v_niveau not in ('faible', 'moyen', 'eleve') then
    raise exception 'niveau_invalide';
  end if;

  v_key := vigie_device_key(p_device_id);
  v_point := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;

  if p_type::text <> 'sos' then
    -- Anti-spam : un signalement par minute et par appareil.
    -- Le SOS n'est jamais bloqué : mieux vaut un doublon qu'une urgence muette.
    select max(created_at) into v_dernier from report_authors where device_key = v_key;
    if v_dernier is not null and now() - v_dernier < interval '60 seconds' then
      raise exception 'rate_limit';
    end if;

    v_rayon := vigie_rayon_fusion_m(p_type);
    if v_rayon > 0 then
      select r.id, a.device_key as auteur
      into v_existant
      from reports r
      left join report_authors a on a.report_id = r.id
      where r.type = p_type
        and r.resolved_at is null
        and r.expires_at > now()
        and st_dwithin(r.geom, v_point, v_rayon)
      order by st_distance(r.geom, v_point)
      limit 1;

      if found then
        if v_existant.auteur = v_key then
          return jsonb_build_object('id', v_existant.id, 'resultat', 'deja_signale');
        end if;

        perform vigie_appliquer_vote(v_existant.id, v_key, 'present');

        -- Complète l'événement existant avec ce qui lui manquait (sauf si la
        -- modération a masqué son contenu : on ne le remplace pas).
        update reports
        set photo_url = case when contenu_masque_at is null
                             then coalesce(photo_url, p_photo_url) else photo_url end,
            description = case when contenu_masque_at is null
                               then coalesce(description, v_description) else description end,
            lieu = coalesce(lieu, v_lieu),
            niveau_risque = case
              when vigie_rang_risque(v_niveau) > vigie_rang_risque(niveau_risque) then v_niveau
              else niveau_risque
            end
        where id = v_existant.id;

        return jsonb_build_object('id', v_existant.id, 'resultat', 'fusionne');
      end if;
    end if;
  end if;

  insert into reports (type, lat, lng, photo_url, description, niveau_risque, lieu, expires_at)
  values (p_type, p_lat, p_lng, p_photo_url, v_description, v_niveau, v_lieu,
          now() + vigie_duree_vie(p_type))
  returning id into v_id;

  insert into report_authors (report_id, device_key) values (v_id, v_key);

  return jsonb_build_object('id', v_id, 'resultat', 'cree');
end;
$$;

-- ---------------------------------------------------------------------
-- RPC : voter sur un signalement
--   select voter_signalement('<uuid>', '<id appareil>', 'present' | 'termine');
-- Retour : {"resultat": "confirme" | "en_baisse" | "resolu" | "deja_vote", ...}
-- ---------------------------------------------------------------------
create or replace function voter_signalement(
  p_report_id uuid,
  p_device_id text,
  p_vote text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_resultat text;
  v_report reports%rowtype;
begin
  if p_device_id is null or length(p_device_id) not between 16 and 128 then
    raise exception 'appareil_invalide';
  end if;
  if p_vote is null or p_vote not in ('present', 'termine') then
    raise exception 'vote_invalide';
  end if;

  v_key := vigie_device_key(p_device_id);

  -- Garde-fou contre les votes en rafale (30 par tranche de 10 minutes).
  if (
    select count(*) from report_votes
    where device_key = v_key and updated_at > now() - interval '10 minutes'
  ) >= 30 then
    raise exception 'rate_limit';
  end if;

  v_resultat := vigie_appliquer_vote(p_report_id, v_key, p_vote);

  select * into v_report from reports where id = p_report_id;

  return jsonb_build_object(
    'resultat', v_resultat,
    'confirmations', v_report.confirmations,
    'infirmations', v_report.infirmations,
    'expires_at', v_report.expires_at,
    'resolu', v_report.resolved_at is not null
  );
end;
$$;

-- ---------------------------------------------------------------------
-- RPC : signalements actifs autour d'une position
--   select * from signalements_proches(-22.27, 166.45, 5000, '<id appareil>');
-- Sans position (p_lat/p_lng nuls) : tous les signalements actifs.
-- Le rayon est borné entre 500 m et 20 km.
-- ---------------------------------------------------------------------
-- Le type de retour change d'une version à l'autre : on supprime d'abord,
-- sinon `create or replace` échoue.
drop function if exists signalements_proches(double precision, double precision, integer, text);

create or replace function signalements_proches(
  p_lat double precision default null,
  p_lng double precision default null,
  p_rayon_m int default 5000,
  p_device_id text default null
)
returns table (
  id uuid,
  type report_type,
  lat double precision,
  lng double precision,
  photo_url text,
  description text,
  niveau_risque text,
  lieu text,
  source_officielle text,
  confirmations int,
  infirmations int,
  created_at timestamptz,
  expires_at timestamptz,
  last_confirmed_at timestamptz,
  distance_m double precision,
  est_auteur boolean,
  mon_vote text,
  actif boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with
    moi as (
      select case when p_device_id is null then null
                  else vigie_device_key(p_device_id) end as cle
    ),
    centre as (
      select case when p_lat is null or p_lng is null then null
                  else st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography end as pt
    )
  select
    r.id,
    r.type,
    r.lat,
    r.lng,
    r.photo_url,
    r.description,
    r.niveau_risque,
    r.lieu,
    r.source_officielle,
    r.confirmations,
    r.infirmations,
    r.created_at,
    r.expires_at,
    r.last_confirmed_at,
    case when c.pt is null then null else st_distance(r.geom, c.pt) end as distance_m,
    coalesce(a.device_key = m.cle, false) as est_auteur,
    v.vote as mon_vote,
    true as actif
  from reports r
  cross join moi m
  cross join centre c
  left join report_authors a on a.report_id = r.id
  left join report_votes v on v.report_id = r.id and v.device_key = m.cle
  where r.expires_at > now()
    and r.resolved_at is null
    and (
      c.pt is null
      or st_dwithin(r.geom, c.pt, least(greatest(coalesce(p_rayon_m, 5000), 500), 20000))
    )
  order by distance_m nulls last, r.created_at desc
  limit 200;
$$;

-- ---------------------------------------------------------------------
-- RPC : un signalement précis (lien partagé), même terminé
--   select * from signalement_detail('<uuid>', '<id appareil>');
-- ---------------------------------------------------------------------
drop function if exists signalement_detail(uuid, text);

create or replace function signalement_detail(
  p_id uuid,
  p_device_id text default null
)
returns table (
  id uuid,
  type report_type,
  lat double precision,
  lng double precision,
  photo_url text,
  description text,
  niveau_risque text,
  lieu text,
  source_officielle text,
  confirmations int,
  infirmations int,
  created_at timestamptz,
  expires_at timestamptz,
  last_confirmed_at timestamptz,
  distance_m double precision,
  est_auteur boolean,
  mon_vote text,
  actif boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with moi as (
    select case when p_device_id is null then null
                else vigie_device_key(p_device_id) end as cle
  )
  select
    r.id, r.type, r.lat, r.lng, r.photo_url, r.description, r.niveau_risque,
    r.lieu, r.source_officielle, r.confirmations, r.infirmations, r.created_at,
    r.expires_at, r.last_confirmed_at,
    null::double precision as distance_m,
    coalesce(a.device_key = m.cle, false) as est_auteur,
    v.vote as mon_vote,
    (r.resolved_at is null and r.expires_at > now()) as actif
  from reports r
  cross join moi m
  left join report_authors a on a.report_id = r.id
  left join report_votes v on v.report_id = r.id and v.device_key = m.cle
  where r.id = p_id
    and r.type::text <> 'sos'  -- un SOS n'est pas partageable par lien
$$;

-- ---------------------------------------------------------------------
-- RPC : mémoire du territoire — statistiques des 12 derniers mois autour
-- d'une position (ou sur toute la Calédonie si la position est nulle).
-- Les SOS sont exclus : ce sont des urgences de personnes, pas des
-- informations sur le territoire.
--   select statistiques_zone(-22.27, 166.45, 5000);
-- ---------------------------------------------------------------------
create or replace function statistiques_zone(
  p_lat double precision default null,
  p_lng double precision default null,
  p_rayon_m int default 5000
)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  with
    centre as (
      select case when p_lat is null or p_lng is null then null
                  else st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography end as pt
    ),
    debut as (
      select (date_trunc('month', timezone('Pacific/Noumea', now())) - interval '11 months') as mois
    ),
    zone as (
      select r.*, timezone('Pacific/Noumea', r.created_at) as local_at
      from reports r, centre c, debut d
      where r.type::text <> 'sos'
        and timezone('Pacific/Noumea', r.created_at) >= d.mois
        and (
          c.pt is null
          or st_dwithin(r.geom, c.pt, least(greatest(coalesce(p_rayon_m, 5000), 500), 20000))
        )
    ),
    mois as (
      select generate_series(d.mois, d.mois + interval '11 months', interval '1 month') as m
      from debut d
    )
  select jsonb_build_object(
    'total', (select count(*) from zone),
    'actifs', (select count(*) from zone where resolved_at is null and expires_at > now()),
    'par_type', coalesce(
      (select jsonb_object_agg(t, n) from (
         select type::text as t, count(*) as n from zone group by type
       ) x),
      '{}'::jsonb),
    'par_mois', (
      select jsonb_agg(jsonb_build_object(
               'mois', to_char(mo.m, 'YYYY-MM'),
               'total', (select count(*) from zone z where date_trunc('month', z.local_at) = mo.m),
               'inondations', (select count(*) from zone z
                               where date_trunc('month', z.local_at) = mo.m
                                 and z.type::text in ('inondation', 'meteo'))
             ) order by mo.m)
      from mois mo
    ),
    'recents', coalesce(
      (select jsonb_agg(e order by e->>'created_at' desc) from (
         select jsonb_build_object(
                  'id', z.id,
                  'type', z.type,
                  'lieu', z.lieu,
                  'created_at', z.created_at,
                  'confirmations', z.confirmations,
                  'actif', (z.resolved_at is null and z.expires_at > now())
                ) as e
         from zone z
         order by z.created_at desc
         limit 30
       ) x),
      '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------
-- RPC : relayer une info vue ailleurs (Facebook, radio, SMS…)
--   select relayer_signalement('inondation', -22.27, 166.58, '<id>', 'facebook', 'Radier de la Coulée');
-- Seul le fait est enregistré (type, lieu, heure) : jamais le texte, le
-- nom de l'auteur ni la photo d'origine. Pas de limite de distance (la
-- personne n'est pas forcément sur place) : l'info apparaît « relayée, à
-- confirmer » tant que personne sur place ne l'a confirmée. Un relais ne
-- compte jamais comme une confirmation.
-- Retour : {"id": "...", "resultat": "relaye" | "existe_deja"}
-- ---------------------------------------------------------------------
create or replace function relayer_signalement(
  p_type report_type,
  p_lat double precision,
  p_lng double precision,
  p_device_id text,
  p_source text,
  p_lieu text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_point geography;
  v_dernier timestamptz;
  v_existant uuid;
  v_rayon int;
  v_id uuid;
  v_lieu text := left(nullif(btrim(p_lieu), ''), 80);
begin
  if p_device_id is null or length(p_device_id) not between 16 and 128 then
    raise exception 'appareil_invalide';
  end if;
  if p_type is null or p_type::text = 'sos' then
    raise exception 'type_invalide';
  end if;
  if p_source is null or p_source not in ('facebook', 'radio', 'sms', 'autre') then
    raise exception 'source_invalide';
  end if;
  if p_lat is null or p_lng is null or not vigie_dans_nc(p_lat, p_lng) then
    raise exception 'position_hors_nc';
  end if;

  v_key := vigie_device_key(p_device_id);
  v_point := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;

  select max(created_at) into v_dernier from report_authors where device_key = v_key;
  if v_dernier is not null and now() - v_dernier < interval '60 seconds' then
    raise exception 'rate_limit';
  end if;

  v_rayon := vigie_rayon_fusion_m(p_type);
  if v_rayon > 0 then
    select r.id into v_existant
    from reports r
    where r.type = p_type
      and r.resolved_at is null
      and r.expires_at > now()
      and st_dwithin(r.geom, v_point, v_rayon)
    order by st_distance(r.geom, v_point)
    limit 1;

    if v_existant is not null then
      return jsonb_build_object('id', v_existant, 'resultat', 'existe_deja');
    end if;
  end if;

  insert into reports (type, lat, lng, lieu, relais_source, expires_at)
  values (p_type, p_lat, p_lng, v_lieu, p_source, now() + vigie_duree_vie(p_type))
  returning id into v_id;

  insert into report_authors (report_id, device_key) values (v_id, v_key);

  return jsonb_build_object('id', v_id, 'resultat', 'relaye');
end;
$$;

-- ---------------------------------------------------------------------
-- Modération
--   - n'importe qui peut signaler un contenu (photo ou texte) ;
--   - à partir de vigie_seuil_masquage() téléphones différents, la photo
--     et la description sont masquées automatiquement (le fait — type,
--     lieu, heure — reste : une info fausse ou finie se traite par le vote
--     « C'est terminé ») ;
--   - à la main, dans l'éditeur SQL :
--       select vigie_masquer_contenu('<uuid>');   -- masquer
--       select vigie_retablir_contenu('<uuid>');  -- annuler une erreur
--     et pour retirer tout un signalement de la carte :
--       update reports set resolved_at = now(), expires_at = now() where id = '<uuid>';
-- ---------------------------------------------------------------------

-- ⚠️ Doit rester aligné sur FLAG_HIDE_THRESHOLD dans lib/types.ts.
create or replace function vigie_seuil_masquage()
returns int
language sql
immutable
set search_path = public
as $$
  select 2;
$$;

create or replace function vigie_masquer_contenu(
  p_report_id uuid,
  p_raison text default 'moderation'
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_report reports%rowtype;
begin
  select * into v_report from reports where id = p_report_id for update;
  if not found then
    raise exception 'signalement_introuvable';
  end if;

  if v_report.photo_url is not null or v_report.description is not null then
    insert into report_contenu_masque (report_id, photo_url, description, raison)
    values (p_report_id, v_report.photo_url, v_report.description, p_raison)
    on conflict (report_id) do update
      set photo_url = coalesce(excluded.photo_url, report_contenu_masque.photo_url),
          description = coalesce(excluded.description, report_contenu_masque.description),
          raison = excluded.raison,
          masque_at = now();
  end if;

  -- Même sans contenu à retirer, la décision est notée : un doublon
  -- fusionné plus tard ne pourra pas rajouter de photo ni de texte.
  update reports
  set photo_url = null,
      description = null,
      contenu_masque_at = coalesce(contenu_masque_at, now())
  where id = p_report_id;

  return v_report.photo_url is not null or v_report.description is not null;
end;
$$;

create or replace function vigie_retablir_contenu(p_report_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_masque report_contenu_masque%rowtype;
begin
  select * into v_masque from report_contenu_masque where report_id = p_report_id;

  update reports
  set photo_url = coalesce(photo_url, v_masque.photo_url),
      description = coalesce(description, v_masque.description),
      contenu_masque_at = null
  where id = p_report_id;
  if not found then
    return false;
  end if;

  delete from report_contenu_masque where report_id = p_report_id;
  delete from report_flags where report_id = p_report_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC : signaler un contenu qui pose problème
--   select signaler_contenu('<uuid>', '<id appareil>', 'donnee_personnelle');
-- Motifs : donnee_personnelle (visage, plaque, nom, téléphone…),
-- inapproprie (insulte, accusation, image choquante), hors_sujet (pas une
-- info sur la route).
-- Retour : {"resultat": "enregistre" | "deja_signale" | "masque", "masque": bool}
-- ---------------------------------------------------------------------
create or replace function signaler_contenu(
  p_report_id uuid,
  p_device_id text,
  p_motif text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_report reports%rowtype;
  v_auteur text;
  v_nb int;
begin
  if p_device_id is null or length(p_device_id) not between 16 and 128 then
    raise exception 'appareil_invalide';
  end if;
  if p_motif is null or p_motif not in ('donnee_personnelle', 'inapproprie', 'hors_sujet') then
    raise exception 'motif_invalide';
  end if;

  v_key := vigie_device_key(p_device_id);

  -- Garde-fou : 10 signalements de contenu par heure et par téléphone.
  if (
    select count(*) from report_flags
    where device_key = v_key and created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'trop_de_signalements';
  end if;

  select * into v_report from reports where id = p_report_id for update;
  if not found then
    raise exception 'signalement_introuvable';
  end if;
  if v_report.type::text = 'sos' then
    raise exception 'type_invalide';
  end if;

  select device_key into v_auteur from report_authors where report_id = p_report_id;
  if v_auteur = v_key then
    raise exception 'propre_signalement';
  end if;

  insert into report_flags (report_id, device_key, motif)
  values (p_report_id, v_key, p_motif)
  on conflict (report_id, device_key) do nothing;
  if not found then
    return jsonb_build_object('resultat', 'deja_signale', 'masque', v_report.contenu_masque_at is not null);
  end if;

  select count(*) into v_nb from report_flags where report_id = p_report_id;
  if v_report.contenu_masque_at is null and v_nb >= vigie_seuil_masquage() then
    perform vigie_masquer_contenu(p_report_id, 'signalements');
    return jsonb_build_object('resultat', 'masque', 'masque', true);
  end if;

  return jsonb_build_object('resultat', 'enregistre', 'masque', v_report.contenu_masque_at is not null);
end;
$$;

-- ---------------------------------------------------------------------
-- Écran de modération (/moderation dans l'appli)
-- Chaque modérateur a un code personnel (16 caractères au moins) ; la
-- base n'en garde que l'empreinte. Dans l'éditeur SQL :
--   select vigie_ajouter_moderateur('Patrice', '<code>');   -- ajouter / changer le code
--   select vigie_retirer_moderateur('Patrice');             -- retirer l'accès
--   select * from moderation_journal order by created_at desc;  -- qui a fait quoi
-- ---------------------------------------------------------------------
create table if not exists moderateurs (
  nom text primary key check (char_length(nom) between 1 and 40),
  code_hash text not null unique,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  derniere_utilisation timestamptz
);

create table if not exists moderation_journal (
  id bigint generated always as identity primary key,
  moderateur text not null,
  report_id uuid,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists moderation_journal_created_idx
  on moderation_journal (created_at desc);

create or replace function vigie_code_moderation(p_code text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(digest('vigie-mod:' || p_code, 'sha256'), 'hex');
$$;

create or replace function vigie_ajouter_moderateur(p_nom text, p_code text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_code is null or char_length(p_code) < 16 then
    raise exception 'code_trop_court';
  end if;
  insert into moderateurs (nom, code_hash)
  values (btrim(p_nom), vigie_code_moderation(p_code))
  on conflict (nom) do update set code_hash = excluded.code_hash, actif = true;
  return 'ok';
end;
$$;

create or replace function vigie_retirer_moderateur(p_nom text)
returns text
language sql
security definer
set search_path = public
as $$
  update moderateurs set actif = false where nom = p_nom returning 'ok';
$$;

-- Vérifie le code et renvoie le nom du modérateur (fonction interne).
create or replace function vigie_moderateur(p_code text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_nom text;
begin
  if p_code is not null and char_length(p_code) >= 16 then
    update moderateurs
    set derniere_utilisation = now()
    where code_hash = vigie_code_moderation(p_code) and actif
    returning nom into v_nom;
  end if;
  if v_nom is null then
    perform pg_sleep(0.5);  -- freine les essais au hasard
    raise exception 'code_invalide';
  end if;
  return v_nom;
end;
$$;

-- RPC : vérifier un code (connexion à l'écran de modération)
create or replace function moderation_verifier(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return jsonb_build_object('nom', vigie_moderateur(p_code));
end;
$$;

-- RPC : liste à modérer
--   'signales' : signalés ou masqués, 30 derniers jours
--   'recents'  : tous les signalements des dernières 48 h (sauf SOS)
-- Le contenu masqué reste visible ici (et seulement ici) pour juger.
create or replace function moderation_liste(p_code text, p_filtre text default 'signales')
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_res jsonb;
begin
  perform vigie_moderateur(p_code);

  select coalesce(jsonb_agg(to_jsonb(t) - 'tri' order by t.tri desc), '[]'::jsonb)
  into v_res
  from (
    select
      r.id, r.type, r.lieu, r.created_at, r.expires_at, r.resolved_at,
      (r.resolved_at is null and r.expires_at > now()) as actif,
      r.description, r.photo_url,
      r.contenu_masque_at as masque_at,
      m.description as description_masquee,
      m.photo_url as photo_masquee,
      r.source_officielle, r.relais_source, r.confirmations, r.infirmations,
      coalesce(f.nb, 0) as nb_signalements,
      coalesce(f.motifs, '{}'::jsonb) as motifs,
      coalesce(f.dernier, r.contenu_masque_at, r.created_at) as tri
    from reports r
    left join report_contenu_masque m on m.report_id = r.id
    left join lateral (
      select sum(g.n)::int as nb, max(g.dernier) as dernier, jsonb_object_agg(g.motif, g.n) as motifs
      from (
        select motif, count(*)::int as n, max(created_at) as dernier
        from report_flags
        where report_id = r.id
        group by motif
      ) g
    ) f on true
    where case
      when p_filtre = 'recents' then
        r.created_at > now() - interval '48 hours' and r.type::text <> 'sos'
      else
        (coalesce(f.nb, 0) > 0 or r.contenu_masque_at is not null)
        and r.created_at > now() - interval '30 days'
    end
    order by tri desc
    limit 100
  ) t;

  return v_res;
end;
$$;

-- RPC : agir sur un signalement
--   masquer / retablir : photo et texte
--   ignorer            : « c'est OK », efface les signalements de contenu
--   retirer            : enlève le signalement de la carte
--   verifier / deverifier : niveau « Vérifié » (p_valeur = la source)
create or replace function moderation_action(
  p_code text,
  p_report_id uuid,
  p_action text,
  p_valeur text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_nom text;
  v_source text := left(nullif(btrim(p_valeur), ''), 60);
begin
  v_nom := vigie_moderateur(p_code);
  if not exists (select 1 from reports where id = p_report_id) then
    raise exception 'signalement_introuvable';
  end if;

  if p_action = 'masquer' then
    perform vigie_masquer_contenu(p_report_id, 'moderation');
  elsif p_action = 'retablir' then
    perform vigie_retablir_contenu(p_report_id);
  elsif p_action = 'ignorer' then
    delete from report_flags where report_id = p_report_id;
  elsif p_action = 'retirer' then
    update reports
    set resolved_at = coalesce(resolved_at, now()),
        expires_at = least(expires_at, now())
    where id = p_report_id;
  elsif p_action = 'verifier' then
    if v_source is null then
      raise exception 'source_manquante';
    end if;
    update reports set source_officielle = v_source where id = p_report_id;
  elsif p_action = 'deverifier' then
    update reports set source_officielle = null where id = p_report_id;
  else
    raise exception 'action_invalide';
  end if;

  insert into moderation_journal (moderateur, report_id, action, detail)
  values (v_nom, p_report_id, p_action, v_source);

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- Purge (lancée chaque nuit, voir en bas du fichier) :
--   - 30 jours après la fin d'un signalement, le lien entre l'empreinte du
--     téléphone et ce signalement est effacé (auteur, votes, signalements
--     de contenu) ;
--   - le contenu masqué par la modération est effacé après 90 jours ;
--   - le journal de modération est gardé un an.
-- Les signalements eux-mêmes restent, anonymes, pour l'historique.
-- ---------------------------------------------------------------------
create or replace function vigie_purger_donnees_appareil()
returns void
language sql
security definer
set search_path = public
as $$
  delete from report_votes v using reports r
   where v.report_id = r.id and r.expires_at < now() - interval '30 days';
  delete from report_authors a using reports r
   where a.report_id = r.id and r.expires_at < now() - interval '30 days';
  delete from report_flags f using reports r
   where f.report_id = r.id and r.expires_at < now() - interval '30 days';
  delete from report_contenu_masque m
   where m.masque_at < now() - interval '90 days';
  delete from moderation_journal j
   where j.created_at < now() - interval '1 year';
$$;

-- ---------------------------------------------------------------------
-- Versions 2 des lectures : mêmes colonnes + relais_source.
-- (Les versions 1 restent pour les anciennes versions de l'appli.)
-- ---------------------------------------------------------------------
create or replace function signalements_proches_v2(
  p_lat double precision default null,
  p_lng double precision default null,
  p_rayon_m int default 5000,
  p_device_id text default null
)
returns table (
  id uuid,
  type report_type,
  lat double precision,
  lng double precision,
  photo_url text,
  description text,
  niveau_risque text,
  lieu text,
  source_officielle text,
  relais_source text,
  confirmations int,
  infirmations int,
  created_at timestamptz,
  expires_at timestamptz,
  last_confirmed_at timestamptz,
  distance_m double precision,
  est_auteur boolean,
  mon_vote text,
  actif boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with
    moi as (
      select case when p_device_id is null then null
                  else vigie_device_key(p_device_id) end as cle
    ),
    centre as (
      select case when p_lat is null or p_lng is null then null
                  else st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography end as pt
    )
  select
    r.id, r.type, r.lat, r.lng, r.photo_url, r.description, r.niveau_risque,
    r.lieu, r.source_officielle, r.relais_source, r.confirmations, r.infirmations,
    r.created_at, r.expires_at, r.last_confirmed_at,
    case when c.pt is null then null else st_distance(r.geom, c.pt) end as distance_m,
    coalesce(a.device_key = m.cle, false) as est_auteur,
    v.vote as mon_vote,
    true as actif
  from reports r
  cross join moi m
  cross join centre c
  left join report_authors a on a.report_id = r.id
  left join report_votes v on v.report_id = r.id and v.device_key = m.cle
  where r.expires_at > now()
    and r.resolved_at is null
    and (
      c.pt is null
      or st_dwithin(r.geom, c.pt, least(greatest(coalesce(p_rayon_m, 5000), 500), 20000))
    )
  order by distance_m nulls last, r.created_at desc
  limit 200;
$$;

create or replace function signalement_detail_v2(
  p_id uuid,
  p_device_id text default null
)
returns table (
  id uuid,
  type report_type,
  lat double precision,
  lng double precision,
  photo_url text,
  description text,
  niveau_risque text,
  lieu text,
  source_officielle text,
  relais_source text,
  confirmations int,
  infirmations int,
  created_at timestamptz,
  expires_at timestamptz,
  last_confirmed_at timestamptz,
  distance_m double precision,
  est_auteur boolean,
  mon_vote text,
  actif boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with moi as (
    select case when p_device_id is null then null
                else vigie_device_key(p_device_id) end as cle
  )
  select
    r.id, r.type, r.lat, r.lng, r.photo_url, r.description, r.niveau_risque,
    r.lieu, r.source_officielle, r.relais_source, r.confirmations, r.infirmations,
    r.created_at, r.expires_at, r.last_confirmed_at,
    null::double precision as distance_m,
    coalesce(a.device_key = m.cle, false) as est_auteur,
    v.vote as mon_vote,
    (r.resolved_at is null and r.expires_at > now()) as actif
  from reports r
  cross join moi m
  left join report_authors a on a.report_id = r.id
  left join report_votes v on v.report_id = r.id and v.device_key = m.cle
  where r.id = p_id
    and r.type::text <> 'sos'
$$;

-- ---------------------------------------------------------------------
-- Vue agrégée par zone nommée (Sprint 1 — remplacée par statistiques_zone,
-- conservée pour d'éventuelles zones officielles plus tard)
-- ---------------------------------------------------------------------
create or replace view zone_history
with (security_invoker = true) as
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
-- Droits d'accès
--   - lecture publique des signalements (la carte est publique) ;
--   - aucune écriture directe depuis l'appli : tout passe par les RPC ;
--   - auteurs et votes illisibles depuis l'appli.
-- ---------------------------------------------------------------------
alter table zones enable row level security;
alter table reports enable row level security;
alter table report_authors enable row level security;
alter table report_votes enable row level security;
alter table report_flags enable row level security;
alter table report_contenu_masque enable row level security;
alter table moderateurs enable row level security;
alter table moderation_journal enable row level security;

drop policy if exists "zones lecture publique" on zones;
create policy "zones lecture publique" on zones for select using (true);

drop policy if exists "reports lecture publique" on reports;
create policy "reports lecture publique" on reports for select using (true);

drop policy if exists "reports insertion anonyme" on reports;

grant usage on schema public to anon, authenticated;
grant select on reports, zones, zone_history to anon, authenticated;
revoke insert, update, delete on reports from anon, authenticated;
revoke insert, update, delete on zones from anon, authenticated;
revoke all on report_authors from anon, authenticated;
revoke all on report_votes from anon, authenticated;
revoke all on report_flags from anon, authenticated;
revoke all on report_contenu_masque from anon, authenticated;
revoke all on moderateurs from anon, authenticated;
revoke all on moderation_journal from anon, authenticated;

revoke execute on function vigie_appliquer_vote(uuid, text, text) from public, anon, authenticated;
revoke execute on function vigie_masquer_contenu(uuid, text) from public, anon, authenticated;
revoke execute on function vigie_retablir_contenu(uuid) from public, anon, authenticated;
revoke execute on function vigie_purger_donnees_appareil() from public, anon, authenticated;
revoke execute on function vigie_code_moderation(text) from public, anon, authenticated;
revoke execute on function vigie_ajouter_moderateur(text, text) from public, anon, authenticated;
revoke execute on function vigie_retirer_moderateur(text) from public, anon, authenticated;
revoke execute on function vigie_moderateur(text) from public, anon, authenticated;

grant execute on function creer_signalement(report_type, double precision, double precision, text, text, text, text, text) to anon, authenticated;
grant execute on function voter_signalement(uuid, text, text) to anon, authenticated;
grant execute on function signalements_proches(double precision, double precision, integer, text) to anon, authenticated;
grant execute on function signalement_detail(uuid, text) to anon, authenticated;
grant execute on function statistiques_zone(double precision, double precision, integer) to anon, authenticated;
grant execute on function relayer_signalement(report_type, double precision, double precision, text, text, text) to anon, authenticated;
grant execute on function signalements_proches_v2(double precision, double precision, integer, text) to anon, authenticated;
grant execute on function signalement_detail_v2(uuid, text) to anon, authenticated;
grant execute on function signaler_contenu(uuid, text, text) to anon, authenticated;
grant execute on function moderation_verifier(text) to anon, authenticated;
grant execute on function moderation_liste(text, text) to anon, authenticated;
grant execute on function moderation_action(text, uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Photos : bucket public en lecture, upload anonyme limité aux images
-- de 3 Mo maximum (l'appli les réduit à ~300 Ko avant l'envoi).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', true, 3145728, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "photos lecture publique" on storage.objects;
create policy "photos lecture publique"
  on storage.objects for select
  using (bucket_id = 'report-photos');

drop policy if exists "photos upload anonyme" on storage.objects;
create policy "photos upload anonyme"
  on storage.objects for insert
  with check (bucket_id = 'report-photos');

-- ---------------------------------------------------------------------
-- Temps réel : la carte se met à jour dès qu'un signalement change
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reports'
     ) then
    alter publication supabase_realtime add table reports;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Purge automatique chaque nuit (3 h 15 à Nouméa = 16 h 15 UTC) avec
-- pg_cron, activé ici s'il est disponible (c'est le cas sur Supabase).
-- Sinon : Integrations > Cron dans Supabase, ou lancer à la main
--   select vigie_purger_donnees_appareil();
-- (cron.schedule remplace la tâche du même nom : ré-exécutable.)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule(
      'vigie-purge-donnees-appareil',
      '15 16 * * *',
      'select public.vigie_purger_donnees_appareil()'
    );
  else
    raise notice 'pg_cron indisponible : purge automatique non programmée.';
  end if;
exception when others then
  raise notice 'Purge automatique non programmée (%) : l''activer dans Integrations > Cron.', sqlerrm;
end $$;
