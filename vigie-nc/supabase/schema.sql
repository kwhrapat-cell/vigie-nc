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
--   - chaque téléphone écrit avec une session ANONYME Supabase (auth.uid(),
--     signé par Supabase) : jamais avec un identifiant qu'il aurait choisi
--     lui-même, qu'un script pourrait changer à chaque requête ;
--   - cet identifiant n'est jamais lisible publiquement (sinon on pourrait
--     reconstituer les déplacements d'une personne à partir de ses
--     signalements) et il est stocké sous forme d'empreinte, jamais en
--     clair ;
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
-- Rempli quand l'alerte (notification) de ce signalement est partie :
-- un signalement ne déclenche qu'une seule fois.
alter table reports add column if not exists notifie_at timestamptz;

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

-- Paramètres privés (adresse du serveur d'envoi, secret, hôte des photos…)
-- Créée ici car les règles ci-dessous la lisent. Voir « Alertes » plus bas
-- pour les valeurs à renseigner.
create table if not exists vigie_config (
  cle text primary key,
  valeur text not null
);

-- Une photo n'est acceptée que si elle vient du dossier report-photos de
-- NOTRE projet Supabase (clé 'photo_host' de vigie_config, ex.
-- 'abcd.supabase.co'). Sans cette clé, aucune photo n'est acceptée : une
-- adresse vers un autre site permettrait de relever l'adresse IP de chaque
-- personne qui ouvre la fiche.
create or replace function vigie_photo_url_valide(p_url text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_host text;
  v_prefixe text;
begin
  if p_url is null then
    return true;
  end if;
  select valeur into v_host from vigie_config where cle = 'photo_host';
  if v_host is null then
    return false;
  end if;
  v_prefixe := 'https://' || v_host || '/storage/v1/object/public/report-photos/';
  return left(p_url, length(v_prefixe)) = v_prefixe
     and substr(p_url, length(v_prefixe) + 1) ~ '^[A-Za-z0-9._-]{1,100}$';
end;
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
-- Identité anonyme vérifiée
--   Chaque téléphone ouvre une session ANONYME Supabase (Authentication >
--   Sign In / Providers > « Allow anonymous sign-ins ») : pas de compte,
--   pas d'e-mail. Supabase limite ces connexions par adresse IP, et
--   Cloudflare Turnstile les protège si la clé est configurée.
--   Les fonctions ci-dessous ne font JAMAIS confiance à un identifiant
--   envoyé par le téléphone : elles utilisent auth.uid(), signé par
--   Supabase. La base ne garde que son empreinte, comme avant.
-- ---------------------------------------------------------------------
create or replace function vigie_cle_session()
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select case when auth.uid() is null then null
              else vigie_device_key('auth:' || auth.uid()::text) end;
$$;

-- On confirme ou déclare terminé seulement ce qu'on voit : à moins de 5 km.
-- ⚠️ Doit rester aligné sur MAX_WITNESS_DISTANCE_M dans lib/types.ts.
create or replace function vigie_distance_temoin_m()
returns int
language sql
immutable
set search_path = public
as $$
  select 5000;
$$;

-- Types qui déclenchent une alerte, et qu'un seul « C'est terminé » ne
-- peut pas retirer de la carte.
-- ⚠️ Doit rester aligné sur ALERT_TYPES dans lib/types.ts.
create or replace function vigie_est_danger(p_type report_type)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_type::text in ('accident', 'route_coupee', 'inondation', 'danger', 'meteo');
$$;

-- Anti-abus : 1 signalement (ou relais) par minute et 20 par jour par session.
create or replace function vigie_limite_signalements(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dernier timestamptz;
  v_nb int;
begin
  select max(created_at), count(*) filter (where created_at > now() - interval '24 hours')
  into v_dernier, v_nb
  from report_authors
  where device_key = p_key;
  if v_dernier is not null and now() - v_dernier < interval '60 seconds' then
    raise exception 'rate_limit';
  end if;
  if v_nb >= 20 then
    raise exception 'rate_limit_jour';
  end if;
end;
$$;

-- Photos déposées par cette session dans la dernière heure (règle de
-- dépôt du dossier report-photos, plus bas : 5 par heure au plus).
create or replace function vigie_photos_recentes()
returns int
language sql
stable
security definer
set search_path = public, storage
as $$
  select count(*)::int
  from storage.objects
  where bucket_id = 'report-photos'
    and owner_id = auth.uid()::text
    and created_at > now() - interval '1 hour';
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
  -- Un signalement vérifié par une source officielle ne se clôt que par la
  -- modération, même par son auteur.
  if v_auteur = p_device_key then
    if p_vote = 'present' then
      raise exception 'propre_signalement';
    end if;
    if v_report.source_officielle is not null then
      return 'verifie';
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

  -- p_vote = 'termine'
  -- Vérifié : l'avis est noté (affiché « contesté »), seule la modération
  -- retire le signalement.
  if v_report.source_officielle is not null then
    return 'verifie';
  end if;

  -- Danger (accident, route coupée, inondation, danger, météo) : il ne
  -- disparaît pas sur l'avis d'une seule personne. Il faut au moins 2
  -- « C'est terminé », et plus de « terminé » que de « toujours là ».
  if vigie_est_danger(v_report.type) then
    if v_report.infirmations >= 2 and v_report.infirmations > v_report.confirmations then
      update reports set resolved_at = now(), expires_at = now() where id = p_report_id;
      return 'resolu';
    end if;
    return 'conteste';
  end if;

  -- Autres types (travaux, trafic, chaussée, autre) : clos si les
  -- « terminé » l'emportent, sinon il s'efface dans 30 min au plus, sauf
  -- nouvelle confirmation.
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
-- Anciennes versions supprimées : elles faisaient confiance à un
-- identifiant inventé par le téléphone (p_device_id), qu'un script pouvait
-- changer à chaque requête. Remplacées par les versions _v3 (session
-- anonyme Supabase).
-- ---------------------------------------------------------------------
drop function if exists creer_signalement(report_type, double precision, double precision, text, text);
drop function if exists creer_signalement(report_type, double precision, double precision, text, text, text, text, text);
drop function if exists voter_signalement(uuid, text, text);
drop function if exists signalements_proches(double precision, double precision, integer, text);
drop function if exists signalements_proches_v2(double precision, double precision, integer, text);
drop function if exists signalement_detail(uuid, text);
drop function if exists signalement_detail_v2(uuid, text);
drop function if exists relayer_signalement(report_type, double precision, double precision, text, text, text);
drop function if exists signaler_contenu(uuid, text, text);

-- ---------------------------------------------------------------------
-- RPC : créer un signalement (ou confirmer l'existant s'il s'agit du
-- même événement). Session anonyme obligatoire.
--   select creer_signalement_v3('inondation', -22.27, 166.45);
-- Retour : {"id": "...", "resultat": "cree" | "fusionne" | "deja_signale"}
-- Le SOS n'est pas un signalement : il ne publie rien (écran /sos).
-- ---------------------------------------------------------------------
create or replace function creer_signalement_v3(
  p_type report_type,
  p_lat double precision,
  p_lng double precision,
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
  v_key text := vigie_cle_session();
  v_point geography;
  v_existant record;
  v_rayon int;
  v_id uuid;
  v_description text := nullif(btrim(p_description), '');
  v_niveau text := nullif(btrim(p_niveau_risque), '');
  v_lieu text := left(nullif(btrim(p_lieu), ''), 80);
begin
  if v_key is null then
    raise exception 'connexion_requise';
  end if;
  if p_type is null or p_type::text = 'sos' then
    raise exception 'type_invalide';
  end if;
  if p_lat is null or p_lng is null or not vigie_dans_nc(p_lat, p_lng) then
    raise exception 'position_hors_nc';
  end if;
  if not vigie_photo_url_valide(p_photo_url) then
    raise exception 'photo_invalide';
  end if;
  if v_description is not null and char_length(v_description) > 200 then
    raise exception 'description_trop_longue';
  end if;
  if v_niveau is not null and v_niveau not in ('faible', 'moyen', 'eleve') then
    raise exception 'niveau_invalide';
  end if;

  perform vigie_limite_signalements(v_key);

  v_point := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
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

  insert into reports (type, lat, lng, photo_url, description, niveau_risque, lieu, expires_at)
  values (p_type, p_lat, p_lng, p_photo_url, v_description, v_niveau, v_lieu,
          now() + vigie_duree_vie(p_type))
  returning id into v_id;

  insert into report_authors (report_id, device_key) values (v_id, v_key);

  return jsonb_build_object('id', v_id, 'resultat', 'cree');
end;
$$;

-- ---------------------------------------------------------------------
-- RPC : voter sur un signalement. Session anonyme obligatoire ; sauf pour
-- l'auteur, il faut envoyer sa position et être à moins de 5 km.
--   select voter_signalement_v3('<uuid>', 'present', -22.27, 166.45);
-- Retour : {"resultat": "confirme" | "en_baisse" | "conteste" | "verifie"
--          | "resolu" | "deja_vote", ...}
-- ---------------------------------------------------------------------
create or replace function voter_signalement_v3(
  p_report_id uuid,
  p_vote text,
  p_lat double precision default null,
  p_lng double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text := vigie_cle_session();
  v_resultat text;
  v_report reports%rowtype;
  v_auteur text;
begin
  if v_key is null then
    raise exception 'connexion_requise';
  end if;
  if p_vote is null or p_vote not in ('present', 'termine') then
    raise exception 'vote_invalide';
  end if;

  -- Garde-fou contre les votes en rafale (30 par tranche de 10 minutes).
  if (
    select count(*) from report_votes
    where device_key = v_key and updated_at > now() - interval '10 minutes'
  ) >= 30 then
    raise exception 'rate_limit';
  end if;

  select * into v_report from reports where id = p_report_id;
  if not found then
    raise exception 'signalement_introuvable';
  end if;
  select device_key into v_auteur from report_authors where report_id = p_report_id;

  -- Seuls les témoins votent (à moins de 5 km) ; l'auteur peut clore son
  -- signalement d'où il veut.
  if v_auteur is distinct from v_key then
    if p_lat is null or p_lng is null then
      raise exception 'position_requise';
    end if;
    if st_distance(v_report.geom, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography)
       > vigie_distance_temoin_m() then
      raise exception 'trop_loin';
    end if;
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
-- RPC : signalements actifs autour d'une position (SOS exclus : le SOS ne
-- publie rien). Sans position (p_lat/p_lng nuls) : tous les signalements
-- actifs. Le rayon est borné entre 500 m et 20 km. Sans session, la
-- lecture marche aussi (est_auteur et mon_vote restent vides).
--   select * from signalements_proches_v3(-22.27, 166.45, 5000);
-- ---------------------------------------------------------------------
create or replace function signalements_proches_v3(
  p_lat double precision default null,
  p_lng double precision default null,
  p_rayon_m int default 5000
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
      select vigie_cle_session() as cle
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
    and r.type::text <> 'sos'
    and (
      c.pt is null
      or st_dwithin(r.geom, c.pt, least(greatest(coalesce(p_rayon_m, 5000), 500), 20000))
    )
  order by distance_m nulls last, r.created_at desc
  limit 200;
$$;

-- ---------------------------------------------------------------------
-- RPC : un signalement précis (lien partagé), même terminé
--   select * from signalement_detail_v3('<uuid>');
-- ---------------------------------------------------------------------
create or replace function signalement_detail_v3(p_id uuid)
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
    select vigie_cle_session() as cle
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
-- RPC : relayer une info vue ailleurs (Facebook, radio, SMS…). Session
-- anonyme obligatoire.
--   select relayer_signalement_v3('inondation', -22.27, 166.58, 'facebook', 'Radier de la Coulée');
-- Seul le fait est enregistré (type, lieu, heure) : jamais le texte, le
-- nom de l'auteur ni la photo d'origine. Pas de limite de distance (la
-- personne n'est pas forcément sur place) : l'info apparaît « relayée, à
-- confirmer » tant que personne sur place ne l'a confirmée. Un relais ne
-- compte jamais comme une confirmation.
-- Retour : {"id": "...", "resultat": "relaye" | "existe_deja"}
-- ---------------------------------------------------------------------
create or replace function relayer_signalement_v3(
  p_type report_type,
  p_lat double precision,
  p_lng double precision,
  p_source text,
  p_lieu text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text := vigie_cle_session();
  v_point geography;
  v_existant uuid;
  v_rayon int;
  v_id uuid;
  v_lieu text := left(nullif(btrim(p_lieu), ''), 80);
begin
  if v_key is null then
    raise exception 'connexion_requise';
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

  perform vigie_limite_signalements(v_key);

  v_point := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
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
-- RPC : signaler un contenu qui pose problème. Session anonyme obligatoire.
--   select signaler_contenu_v3('<uuid>', 'donnee_personnelle');
-- Motifs : donnee_personnelle (visage, plaque, nom, téléphone…),
-- inapproprie (insulte, accusation, image choquante), hors_sujet (pas une
-- info sur la route).
-- Retour : {"resultat": "enregistre" | "deja_signale" | "masque", "masque": bool}
-- ---------------------------------------------------------------------
create or replace function signaler_contenu_v3(
  p_report_id uuid,
  p_motif text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text := vigie_cle_session();
  v_report reports%rowtype;
  v_auteur text;
  v_nb int;
begin
  if v_key is null then
    raise exception 'connexion_requise';
  end if;
  if p_motif is null or p_motif not in ('donnee_personnelle', 'inapproprie', 'hors_sujet') then
    raise exception 'motif_invalide';
  end if;

  -- Garde-fou : 10 signalements de contenu par heure et par session.
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
  -- Pas d'attente (pg_sleep) en cas d'erreur : avec des codes de 16
  -- caractères au moins, deviner est impossible, et une attente offrirait
  -- un moyen simple de bloquer toutes les connexions de la base.
  if v_nom is null then
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
-- Alertes (notifications sur le téléphone)
--   - chaque téléphone abonné choisit UN lieu (arrondi à ~1 km : seul ce
--     point est gardé, sans lien avec l'empreinte du téléphone) et un
--     rayon de 3, 5 ou 10 km ;
--   - un danger (accident, route coupée, inondation, danger, météo)
--     déclenche une alerte quand une 2e personne le confirme ou qu'il est
--     vérifié par une source officielle, une seule fois ;
--   - la base prévient le serveur d'envoi (/api/notifier sur Vercel) via
--     pg_net ; le serveur demande la liste des destinataires avec un
--     secret partagé, puis envoie les notifications ;
--   - au plus 5 alertes par heure et par téléphone.
-- Configuration (une fois, dans l'éditeur SQL) :
--   insert into vigie_config (cle, valeur) values
--     ('notif_url', 'https://vigie-nc.com/api/notifier'),
--     ('notif_secret', '<même valeur que NOTIF_SECRET sur Vercel>'),
--     ('photo_host', '<ref du projet>.supabase.co')
--   on conflict (cle) do update set valeur = excluded.valeur;
-- ---------------------------------------------------------------------
create table if not exists vigie_config (
  cle text primary key,
  valeur text not null
);

create table if not exists push_abonnements (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  lat double precision not null,
  lng double precision not null,
  rayon_km int not null check (rayon_km in (3, 5, 10)),
  nom text check (nom is null or char_length(nom) <= 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists push_envois (
  report_id uuid not null references reports(id) on delete cascade,
  abonnement_id uuid not null references push_abonnements(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (report_id, abonnement_id)
);
create index if not exists push_envois_abonnement_idx on push_envois (abonnement_id, sent_at desc);

-- Services d'envoi des navigateurs acceptés (Google, Mozilla, Apple,
-- Microsoft) : on n'envoie jamais rien vers une autre adresse.
create or replace function vigie_endpoint_valide(p_endpoint text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_endpoint is not null
     and char_length(p_endpoint) <= 1000
     and p_endpoint ~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|web\.push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/';
$$;

-- RPC : s'abonner (ou changer de lieu / rayon) depuis ce téléphone
create or replace function notif_abonner(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_lat double precision,
  p_lng double precision,
  p_rayon_km int,
  p_nom text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not vigie_endpoint_valide(p_endpoint)
     or p_p256dh is null or char_length(p_p256dh) > 200
     or p_auth is null or char_length(p_auth) > 100 then
    raise exception 'abonnement_invalide';
  end if;
  if p_lat is null or p_lng is null or not vigie_dans_nc(p_lat, p_lng) then
    raise exception 'position_hors_nc';
  end if;
  if p_rayon_km is null or p_rayon_km not in (3, 5, 10) then
    raise exception 'rayon_invalide';
  end if;

  insert into push_abonnements (endpoint, p256dh, auth, lat, lng, rayon_km, nom)
  values (
    p_endpoint, p_p256dh, p_auth,
    round(p_lat::numeric, 2)::double precision,
    round(p_lng::numeric, 2)::double precision,
    p_rayon_km,
    left(nullif(btrim(p_nom), ''), 30)
  )
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh,
        auth = excluded.auth,
        lat = excluded.lat,
        lng = excluded.lng,
        rayon_km = excluded.rayon_km,
        nom = excluded.nom,
        updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

-- RPC : réglage actuel de ce téléphone (nul s'il n'est pas abonné)
create or replace function notif_mon_abonnement(p_endpoint text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('lat', lat, 'lng', lng, 'rayon_km', rayon_km, 'nom', nom)
  from push_abonnements
  where endpoint = p_endpoint;
$$;

-- RPC : se désabonner
create or replace function notif_desabonner(p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from push_abonnements where endpoint = p_endpoint;
  return jsonb_build_object('ok', true);
end;
$$;

-- Vérifie le secret partagé avec le serveur d'envoi (fonction interne)
create or replace function vigie_secret_notif_ok(p_secret text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  select valeur into v_secret from vigie_config where cle = 'notif_secret';
  -- Pas d'attente en cas d'erreur (voir vigie_moderateur) : le secret fait
  -- 48 caractères, impossible à deviner.
  if v_secret is null or p_secret is null or p_secret <> v_secret then
    return false;
  end if;
  return true;
end;
$$;

-- RPC (serveur d'envoi) : destinataires d'une alerte. Les envois sont
-- notés tout de suite : une même alerte n'est jamais envoyée deux fois.
create or replace function notif_destinataires(p_secret text, p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_report reports%rowtype;
  v_res jsonb;
begin
  if not vigie_secret_notif_ok(p_secret) then
    raise exception 'secret_invalide';
  end if;
  select * into v_report from reports where id = p_report_id;
  if not found then
    raise exception 'signalement_introuvable';
  end if;

  with cibles as (
    select a.id, a.endpoint, a.p256dh, a.auth, a.nom,
           st_distance(st_setsrid(st_makepoint(a.lng, a.lat), 4326)::geography, v_report.geom) as distance_m
    from push_abonnements a
    where st_dwithin(st_setsrid(st_makepoint(a.lng, a.lat), 4326)::geography, v_report.geom, a.rayon_km * 1000)
      and not exists (
        select 1 from push_envois e where e.abonnement_id = a.id and e.report_id = p_report_id
      )
      and (
        select count(*) from push_envois e
        where e.abonnement_id = a.id and e.sent_at > now() - interval '1 hour'
      ) < 5
  ),
  notes as (
    insert into push_envois (report_id, abonnement_id)
    select p_report_id, id from cibles
    returning abonnement_id
  )
  select jsonb_build_object(
    'report', jsonb_build_object(
      'id', v_report.id,
      'type', v_report.type,
      'lieu', v_report.lieu,
      'confirmations', v_report.confirmations,
      'source_officielle', v_report.source_officielle,
      'relais_source', v_report.relais_source,
      'niveau_risque', v_report.niveau_risque,
      'actif', (v_report.resolved_at is null and v_report.expires_at > now())
    ),
    'abonnements', coalesce(
      (select jsonb_agg(jsonb_build_object(
         'endpoint', c.endpoint, 'p256dh', c.p256dh, 'auth', c.auth,
         'nom', c.nom, 'distance_m', round(c.distance_m)
       )) from cibles c),
      '[]'::jsonb)
  ) into v_res;

  return v_res;
end;
$$;

-- RPC (serveur d'envoi) : abonnements qui ne marchent plus (téléphone
-- changé, notifications coupées…) → supprimés.
create or replace function notif_echecs(p_secret text, p_endpoints text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nb int;
begin
  if not vigie_secret_notif_ok(p_secret) then
    raise exception 'secret_invalide';
  end if;
  delete from push_abonnements where endpoint = any(p_endpoints);
  get diagnostics v_nb = row_count;
  return jsonb_build_object('supprimes', v_nb);
end;
$$;

-- Déclencheur : un danger confirmé (2e personne) ou vérifié prévient le
-- serveur d'envoi, une seule fois. Sans configuration ou sans pg_net, il
-- ne fait rien (et réessaiera au prochain changement du signalement).
create or replace function vigie_signal_notification()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_secret text;
begin
  if new.notifie_at is not null
     or new.type::text not in ('accident', 'route_coupee', 'inondation', 'danger', 'meteo')
     or new.resolved_at is not null
     or new.expires_at <= now()
     or new.created_at < now() - interval '6 hours'
     or not (new.confirmations >= 1 or new.source_officielle is not null) then
    return new;
  end if;

  select valeur into v_url from vigie_config where cle = 'notif_url';
  select valeur into v_secret from vigie_config where cle = 'notif_secret';
  if v_url is null or v_secret is null then
    return new;
  end if;

  begin
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('report_id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-vigie-secret', v_secret),
      timeout_milliseconds := 15000
    );
    new.notifie_at := now();
  exception when others then
    -- pg_net absent ou en panne : pas d'alerte cette fois, rien ne bloque.
    null;
  end;
  return new;
end;
$$;

drop trigger if exists trg_vigie_notification on reports;
create trigger trg_vigie_notification
before insert or update on reports
for each row execute function vigie_signal_notification();

-- ---------------------------------------------------------------------
-- Alarme de sécurité : les téléphones des modérateurs qui l'ont activée
-- (écran /moderation) sont prévenus dès que la liste des modérateurs
-- change : ajout, code changé, accès retiré ou rétabli, renommage,
-- suppression, liste vidée. Les connexions (derniere_utilisation) ne
-- comptent pas.
--   - l'inscription d'un téléphone ne dépend pas de l'état du modérateur :
--     si quelqu'un retire l'accès de Patrice, Patrice est quand même prévenu ;
--   - chaque changement est aussi noté dans moderation_journal ;
--   - envoi par /api/alerte-securite (même secret que les alertes routières ;
--     adresse = notif_url avec /api/alerte-securite au bout, ou la clé
--     'securite_url' de vigie_config si elle existe).
-- Limite : quelqu'un qui a la main sur le compte Supabase peut aussi couper
-- l'alarme. Elle sert à être prévenu tout de suite, pas à bloquer.
-- Arrêter l'alarme d'un ancien modérateur (éditeur SQL) :
--   delete from moderation_alertes where moderateur = 'Nom';
-- ---------------------------------------------------------------------
create table if not exists moderation_alertes (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  moderateur text not null,
  created_at timestamptz not null default now()
);

-- RPC : activer l'alarme sur ce téléphone (5 téléphones par modérateur au plus)
create or replace function moderation_alertes_activer(
  p_code text,
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_nom text;
begin
  v_nom := vigie_moderateur(p_code);
  if not vigie_endpoint_valide(p_endpoint)
     or p_p256dh is null or char_length(p_p256dh) > 200
     or p_auth is null or char_length(p_auth) > 100 then
    raise exception 'abonnement_invalide';
  end if;

  insert into moderation_alertes (endpoint, p256dh, auth, moderateur)
  values (p_endpoint, p_p256dh, p_auth, v_nom)
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh,
        auth = excluded.auth,
        moderateur = excluded.moderateur,
        created_at = now();

  delete from moderation_alertes
  where moderateur = v_nom
    and id not in (
      select id from moderation_alertes
      where moderateur = v_nom
      order by created_at desc
      limit 5
    );

  return jsonb_build_object('ok', true);
end;
$$;

-- RPC : l'alarme est-elle active sur ce téléphone ?
create or replace function moderation_alertes_etat(p_code text, p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform vigie_moderateur(p_code);
  return jsonb_build_object(
    'active', exists (select 1 from moderation_alertes where endpoint = p_endpoint)
  );
end;
$$;

-- RPC : couper l'alarme sur ce téléphone
create or replace function moderation_alertes_desactiver(p_code text, p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform vigie_moderateur(p_code);
  delete from moderation_alertes where endpoint = p_endpoint;
  return jsonb_build_object('ok', true);
end;
$$;

-- RPC (serveur d'envoi) : téléphones à prévenir
create or replace function moderation_alertes_destinataires(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not vigie_secret_notif_ok(p_secret) then
    raise exception 'secret_invalide';
  end if;
  return coalesce(
    (select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth))
     from moderation_alertes),
    '[]'::jsonb);
end;
$$;

-- RPC (serveur d'envoi) : téléphones qui ne répondent plus → retirés
create or replace function moderation_alertes_echecs(p_secret text, p_endpoints text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nb int;
begin
  if not vigie_secret_notif_ok(p_secret) then
    raise exception 'secret_invalide';
  end if;
  delete from moderation_alertes where endpoint = any(p_endpoints);
  get diagnostics v_nb = row_count;
  return jsonb_build_object('supprimes', v_nb);
end;
$$;

-- Déclencheur : note le changement dans le journal et prévient le serveur
-- d'envoi. Sans configuration ou sans pg_net, il note seulement.
create or replace function vigie_alarme_moderateurs()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_evenement text;
  v_nom text;
  v_url text;
  v_secret text;
begin
  if tg_op = 'TRUNCATE' then
    v_evenement := 'vidage';
  elsif tg_op = 'INSERT' then
    v_evenement := 'ajout';
    v_nom := new.nom;
  elsif tg_op = 'DELETE' then
    v_evenement := 'suppression';
    v_nom := old.nom;
  elsif old.nom is distinct from new.nom then
    v_evenement := 'renomme';
    v_nom := old.nom || ' → ' || new.nom;
  elsif old.actif and not new.actif then
    v_evenement := 'retrait';
    v_nom := new.nom;
  elsif new.actif and not old.actif then
    v_evenement := 'retabli';
    v_nom := new.nom;
  elsif old.code_hash is distinct from new.code_hash then
    v_evenement := 'code';
    v_nom := new.nom;
  else
    return null;
  end if;

  insert into moderation_journal (moderateur, report_id, action, detail)
  values ('Supabase', null, 'moderateurs_' || v_evenement, left(v_nom, 85));

  select valeur into v_url from vigie_config where cle = 'securite_url';
  if v_url is null then
    select regexp_replace(valeur, '/api/notifier/?$', '/api/alerte-securite')
    into v_url from vigie_config where cle = 'notif_url';
    if v_url !~ '/api/alerte-securite$' then
      v_url := null;
    end if;
  end if;
  select valeur into v_secret from vigie_config where cle = 'notif_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;

  begin
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('evenement', v_evenement, 'nom', v_nom),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-vigie-secret', v_secret),
      timeout_milliseconds := 15000
    );
  exception when others then
    -- pg_net absent ou en panne : le changement reste noté dans le journal.
    null;
  end;
  return null;
end;
$$;

drop trigger if exists trg_vigie_alarme_moderateurs on moderateurs;
create trigger trg_vigie_alarme_moderateurs
after insert or delete on moderateurs
for each row execute function vigie_alarme_moderateurs();

drop trigger if exists trg_vigie_alarme_moderateurs_maj on moderateurs;
create trigger trg_vigie_alarme_moderateurs_maj
after update of nom, code_hash, actif on moderateurs
for each row
when (old.nom is distinct from new.nom
      or old.code_hash is distinct from new.code_hash
      or old.actif is distinct from new.actif)
execute function vigie_alarme_moderateurs();

drop trigger if exists trg_vigie_alarme_moderateurs_vidage on moderateurs;
create trigger trg_vigie_alarme_moderateurs_vidage
after truncate on moderateurs
for each statement execute function vigie_alarme_moderateurs();

-- ---------------------------------------------------------------------
-- Purge (lancée chaque nuit, voir en bas du fichier) :
--   - 30 jours après la fin d'un signalement, le lien entre l'empreinte du
--     téléphone et ce signalement est effacé (auteur, votes, signalements
--     de contenu) ;
--   - le contenu masqué par la modération est effacé après 90 jours ;
--   - le journal de modération est gardé un an ;
--   - la trace des alertes envoyées (anti-doublon) est gardée 7 jours ;
--   - les sessions anonymes inactives depuis 90 jours sont supprimées ;
--   - le journal de sécurité de Supabase Auth est gardé 30 jours.
-- Les signalements eux-mêmes restent, anonymes, pour l'historique.
-- ---------------------------------------------------------------------
create or replace function vigie_purger_donnees_appareil()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
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
  delete from push_envois p
   where p.sent_at < now() - interval '7 days';
  delete from vigie_signal s
   where s.created_at < now() - interval '1 day';

  -- Sessions anonymes sans activité depuis 90 jours : supprimées. Elles ne
  -- portent aucun nom, et leur lien avec les signalements est déjà effacé
  -- 30 jours après la fin de chaque signalement.
  begin
    delete from auth.users u
     where u.is_anonymous
       and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '90 days';
  exception when others then
    raise notice 'Sessions anonymes non purgées : %', sqlerrm;
  end;

  -- Journal de sécurité de Supabase Auth (adresses IP des connexions) :
  -- gardé 30 jours.
  begin
    delete from auth.audit_log_entries l
     where l.created_at < now() - interval '30 days';
  exception when others then
    raise notice 'Journal Auth non purgé : %', sqlerrm;
  end;
end;
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
-- Temps réel SANS contenu : quand un signalement change, la base ajoute
-- une ligne dans vigie_signal avec seulement l'heure et une case de
-- ~11 km (position arrondie à 0,1°). Les téléphones dont la zone touche
-- cette case rechargent la carte par signalements_proches_v3. La table
-- reports, elle, n'est plus lisible ni diffusée directement.
-- ---------------------------------------------------------------------
create table if not exists vigie_signal (
  id bigint generated always as identity primary key,
  cellule_lat real not null,
  cellule_lng real not null,
  created_at timestamptz not null default now()
);
create index if not exists vigie_signal_created_idx on vigie_signal (created_at);

create or replace function vigie_emettre_signal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into vigie_signal (cellule_lat, cellule_lng)
  values (round(new.lat::numeric, 1)::real, round(new.lng::numeric, 1)::real);
  return null;
end;
$$;

drop trigger if exists trg_vigie_signal on reports;
create trigger trg_vigie_signal
after insert or update of confirmations, infirmations, expires_at, resolved_at,
  photo_url, description, source_officielle, lat, lng
on reports
for each row execute function vigie_emettre_signal();

-- ---------------------------------------------------------------------
-- Droits d'accès
--   - les signalements ne se lisent QUE par les fonctions (RPC) : elles
--     ne montrent que ce qui doit l'être (signalements actifs, jamais de
--     SOS, jamais qui les a envoyés) ; la table reports n'est pas lisible
--     directement ;
--   - aucune écriture directe depuis l'appli : tout passe par les RPC ;
--   - auteurs et votes illisibles depuis l'appli.
-- ---------------------------------------------------------------------
alter table zones enable row level security;
alter table reports enable row level security;
alter table vigie_signal enable row level security;
alter table report_authors enable row level security;
alter table report_votes enable row level security;
alter table report_flags enable row level security;
alter table report_contenu_masque enable row level security;
alter table moderateurs enable row level security;
alter table moderation_journal enable row level security;
alter table vigie_config enable row level security;
alter table push_abonnements enable row level security;
alter table push_envois enable row level security;
alter table moderation_alertes enable row level security;

drop policy if exists "zones lecture publique" on zones;
create policy "zones lecture publique" on zones for select using (true);

drop policy if exists "reports lecture publique" on reports;
drop policy if exists "reports insertion anonyme" on reports;

drop policy if exists "signal lecture publique" on vigie_signal;
create policy "signal lecture publique" on vigie_signal for select using (true);

grant usage on schema public to anon, authenticated;
grant select on zones to anon, authenticated;
grant select on vigie_signal to anon, authenticated;
revoke all on reports from anon, authenticated;
revoke all on zone_history from anon, authenticated;
revoke insert, update, delete on vigie_signal from anon, authenticated;
revoke insert, update, delete on zones from anon, authenticated;
revoke all on report_authors from anon, authenticated;
revoke all on report_votes from anon, authenticated;
revoke all on report_flags from anon, authenticated;
revoke all on report_contenu_masque from anon, authenticated;
revoke all on moderateurs from anon, authenticated;
revoke all on moderation_journal from anon, authenticated;
revoke all on vigie_config from anon, authenticated;
revoke all on push_abonnements from anon, authenticated;
revoke all on push_envois from anon, authenticated;
revoke all on moderation_alertes from anon, authenticated;

revoke execute on function vigie_appliquer_vote(uuid, text, text) from public, anon, authenticated;
revoke execute on function vigie_masquer_contenu(uuid, text) from public, anon, authenticated;
revoke execute on function vigie_retablir_contenu(uuid) from public, anon, authenticated;
revoke execute on function vigie_purger_donnees_appareil() from public, anon, authenticated;
revoke execute on function vigie_code_moderation(text) from public, anon, authenticated;
revoke execute on function vigie_ajouter_moderateur(text, text) from public, anon, authenticated;
revoke execute on function vigie_retirer_moderateur(text) from public, anon, authenticated;
revoke execute on function vigie_moderateur(text) from public, anon, authenticated;
revoke execute on function vigie_secret_notif_ok(text) from public, anon, authenticated;
revoke execute on function vigie_signal_notification() from public, anon, authenticated;
revoke execute on function vigie_alarme_moderateurs() from public, anon, authenticated;
revoke execute on function vigie_photo_url_valide(text) from public, anon, authenticated;
revoke execute on function vigie_cle_session() from public, anon, authenticated;
revoke execute on function vigie_emettre_signal() from public, anon, authenticated;
revoke execute on function vigie_limite_signalements(text) from public, anon, authenticated;
revoke execute on function vigie_photos_recentes() from public, anon;
grant execute on function vigie_photos_recentes() to authenticated;

grant execute on function statistiques_zone(double precision, double precision, integer) to anon, authenticated;
-- Lectures : ouvertes à tous (la carte est publique).
grant execute on function signalements_proches_v3(double precision, double precision, integer) to anon, authenticated;
grant execute on function signalement_detail_v3(uuid) to anon, authenticated;
-- Écritures : seulement avec une session (anonyme) Supabase.
revoke execute on function creer_signalement_v3(report_type, double precision, double precision, text, text, text, text) from public, anon;
revoke execute on function voter_signalement_v3(uuid, text, double precision, double precision) from public, anon;
revoke execute on function relayer_signalement_v3(report_type, double precision, double precision, text, text) from public, anon;
revoke execute on function signaler_contenu_v3(uuid, text) from public, anon;
grant execute on function creer_signalement_v3(report_type, double precision, double precision, text, text, text, text) to authenticated;
grant execute on function voter_signalement_v3(uuid, text, double precision, double precision) to authenticated;
grant execute on function relayer_signalement_v3(report_type, double precision, double precision, text, text) to authenticated;
grant execute on function signaler_contenu_v3(uuid, text) to authenticated;
grant execute on function moderation_verifier(text) to anon, authenticated;
grant execute on function moderation_liste(text, text) to anon, authenticated;
grant execute on function moderation_action(text, uuid, text, text) to anon, authenticated;
grant execute on function notif_abonner(text, text, text, double precision, double precision, integer, text) to anon, authenticated;
grant execute on function notif_mon_abonnement(text) to anon, authenticated;
grant execute on function notif_desabonner(text) to anon, authenticated;
grant execute on function notif_destinataires(text, uuid) to anon, authenticated;
grant execute on function notif_echecs(text, text[]) to anon, authenticated;
grant execute on function moderation_alertes_activer(text, text, text, text) to anon, authenticated;
grant execute on function moderation_alertes_etat(text, text) to anon, authenticated;
grant execute on function moderation_alertes_desactiver(text, text) to anon, authenticated;
grant execute on function moderation_alertes_destinataires(text) to anon, authenticated;
grant execute on function moderation_alertes_echecs(text, text[]) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Photos : bucket public en lecture, dépôt réservé aux sessions (anonymes)
-- Supabase, 5 photos par heure au plus, images de 3 Mo maximum (l'appli
-- les réduit à ~300 Ko avant l'envoi).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', true, 3145728, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Pas de règle de lecture : le dossier étant public, les liens des photos
-- marchent sans elle. Une règle de lecture permettrait en plus de LISTER
-- tous les fichiers (y compris les photos masquées par la modération).
drop policy if exists "photos lecture publique" on storage.objects;

drop policy if exists "photos upload anonyme" on storage.objects;
create policy "photos upload anonyme"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'report-photos' and public.vigie_photos_recentes() < 5);

-- ---------------------------------------------------------------------
-- Temps réel : seule la table vigie_signal (sans contenu) est diffusée ;
-- reports ne l'est plus (elle envoyait chaque ligne complète, SOS compris,
-- à tous les téléphones connectés).
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reports'
    ) then
      alter publication supabase_realtime drop table reports;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vigie_signal'
    ) then
      alter publication supabase_realtime add table vigie_signal;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- pg_net : permet à la base de prévenir le serveur d'envoi des alertes.
-- Activé s'il est disponible (c'est le cas sur Supabase).
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  else
    raise notice 'pg_net indisponible : les alertes ne partiront pas.';
  end if;
exception when others then
  raise notice 'pg_net non activé (%) : l''activer dans Database > Extensions.', sqlerrm;
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
