-- =====================================================================
-- Vigie NC — TRAJET FAVORI (1/2) : ajout à lancer UNE fois dans l'éditeur SQL
-- Supabase (ré-exécutable sans risque). Même contenu que la partie
-- « Trajet favori » de schema.sql, qui reste le script de référence.
-- Résultat attendu : « Success. No rows returned ».
-- =====================================================================

-- ---------------------------------------------------------------------
-- Trajet favori (maison → travail…) : un par téléphone abonné aux alertes
--   - l'itinéraire est calculé une fois (/api/itineraire : service OSRM sur
--     les données OpenStreetMap, appelé par notre serveur, rien n'est
--     gardé), puis le téléphone retire les 500 premiers et derniers mètres
--     (ni la maison ni le travail ne sont envoyés) et simplifie la ligne.
--     Seule cette ligne est gardée ici, rattachée à l'abonnement aux alertes
--     (sans lien avec l'empreinte du téléphone), effacée avec lui ;
--   - jours de la semaine et heures de départ (aller, retour) ;
--   - couloir de 300 m de chaque côté de la ligne (vigie_trajet_couloir_m) ;
--   - 30 min avant chaque départ (vigie_trajet_avance_min) : un point des
--     dangers confirmés sur le trajet, seulement s'il y en a (pg_cron
--     toutes les 5 min → vigie_trajets_appeler → /api/trajet →
--     trajet_avant_depart) ;
--   - de 30 min avant à 1 h après un départ (vigie_trajet_apres_min) : un
--     danger qui devient confirmé sur le trajet part en alerte, même hors
--     de la zone d'alerte (notif_destinataires) ;
--   - « fin d'alerte » : un danger annoncé sur le trajet dans les 12 h et
--     déclaré terminé (votes, auteur ou modération) prévient ces téléphones
--     (déclencheur trg_vigie_fin_trajet → /api/notifier avec fin = true →
--     notif_fin_destinataires). Un danger qui s'efface seul (durée de vie
--     dépassée) ne déclenche rien : personne n'a dit qu'il était fini.
-- Le point sur le trajet à l'ouverture de l'appli (trajet_signalements)
-- n'enregistre rien : le téléphone envoie sa ligne, la base répond.
-- Adresse de /api/trajet : notif_url avec /api/trajet au bout, ou la clé
-- 'trajet_url' de vigie_config. Même secret que les alertes.
-- ⚠️ Couloir, avance, délai et limites alignés sur TRAJET_* de lib/trajet.ts.
-- ---------------------------------------------------------------------
create table if not exists push_trajets (
  abonnement_id uuid primary key references push_abonnements(id) on delete cascade,
  geom geography(linestring, 4326) not null,
  longueur_m int not null,
  -- jours choisis : bit 0 = lundi … bit 6 = dimanche
  jours int not null check (jours between 1 and 127),
  aller time,
  retour time,
  -- dernier jour où le point « avant départ » a été fait
  verifie_aller date,
  verifie_retour date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_trajets_un_depart check (aller is not null or retour is not null)
);
create index if not exists push_trajets_geom_idx on push_trajets using gist (geom);

-- Envoi d'alerte : annoncé au titre du trajet (heure), « fin » partie (heure)
alter table push_envois add column if not exists trajet_at timestamptz;
alter table push_envois add column if not exists fin_envoyee_at timestamptz;

-- Calculs d'itinéraire demandés (les services OSRM gratuits ne doivent pas
-- être abusés à travers nous) : empreinte de la session, effacée après
-- 24 heures par la purge.
create table if not exists vigie_itineraire_appels (
  id bigint generated always as identity primary key,
  device_key text not null,
  created_at timestamptz not null default now()
);
create index if not exists vigie_itineraire_appels_idx on vigie_itineraire_appels (device_key, created_at);
create index if not exists vigie_itineraire_appels_created_idx on vigie_itineraire_appels (created_at);

-- Couloir surveillé de chaque côté du trajet (TRAJET_COULOIR_M)
create or replace function vigie_trajet_couloir_m()
returns int
language sql
immutable
set search_path = public
as $$
  select 300;
$$;

-- Point « avant départ » : tant de minutes avant (TRAJET_AVANCE_MIN)
create or replace function vigie_trajet_avance_min()
returns int
language sql
immutable
set search_path = public
as $$
  select 30;
$$;

-- Alertes du trajet jusqu'à tant de minutes après le départ (TRAJET_APRES_MIN)
create or replace function vigie_trajet_apres_min()
returns int
language sql
immutable
set search_path = public
as $$
  select 60;
$$;

-- Ligne d'un trajet à partir de [[lat, lng], …] envoyé par le téléphone :
-- 2 à 500 points, tous en Nouvelle-Calédonie, de 100 m à 450 km
-- (TRAJET_POINTS_MAX, TRAJET_LONGUEUR_MIN_M / _MAX_M).
create or replace function vigie_trajet_ligne(p_points jsonb)
returns geography
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  v_ligne geography;
  v_long double precision;
begin
  if p_points is null or jsonb_typeof(p_points) <> 'array' then
    raise exception 'trajet_invalide';
  end if;
  if jsonb_array_length(p_points) < 2 or jsonb_array_length(p_points) > 500 then
    raise exception 'trajet_invalide';
  end if;
  -- CASE : chaque test n'est fait que si le précédent est passé
  if exists (
    select 1 from jsonb_array_elements(p_points) e
    where case
            when jsonb_typeof(e) <> 'array' then true
            when jsonb_array_length(e) <> 2 then true
            when jsonb_typeof(e->0) <> 'number' or jsonb_typeof(e->1) <> 'number' then true
            else false
          end
  ) then
    raise exception 'trajet_invalide';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_points) e
    where not vigie_dans_nc((e->>0)::double precision, (e->>1)::double precision)
  ) then
    raise exception 'trajet_hors_nc';
  end if;

  select st_setsrid(
           st_makeline(array_agg(st_makepoint((e->>1)::double precision, (e->>0)::double precision) order by i)),
           4326)::geography
    into v_ligne
  from jsonb_array_elements(p_points) with ordinality as t(e, i);

  v_long := st_length(v_ligne);
  if v_long is null or v_long < 100 or v_long > 450000 then
    raise exception 'trajet_longueur';
  end if;
  return v_ligne;
end;
$$;

-- « HH:MM » → heure (nul si vide)
create or replace function vigie_trajet_heure(p_heure text)
returns time
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_heure is null or btrim(p_heure) = '' then
    return null;
  end if;
  if btrim(p_heure) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'trajet_heure';
  end if;
  return btrim(p_heure)::time;
end;
$$;

-- Départs d'un trajet la veille, le jour et le lendemain de p_t (jours
-- choisis seulement), en heure exacte : un départ à 0 h 10 se prépare dès
-- 23 h 40 la veille.
create or replace function vigie_trajet_departs(
  p_jours int,
  p_aller time,
  p_retour time,
  p_t timestamptz default now()
)
returns table (sens text, jour date, depart timestamptz)
language sql
stable
set search_path = public
as $$
  select s.sens, d.jour, (d.jour + s.heure) at time zone 'Pacific/Noumea'
  from (values ('aller', p_aller), ('retour', p_retour)) as s(sens, heure)
  cross join (select vigie_jour_local(p_t) + k as jour from generate_series(-1, 1) as k) as d
  where s.heure is not null
    and ((p_jours >> (extract(isodow from d.jour)::int - 1)) & 1) = 1;
$$;

-- Points « avant départ » à faire maintenant : départ dans les 30 min, pas
-- encore fait pour ce jour-là.
create or replace function vigie_trajets_dus(p_t timestamptz default now())
returns table (abonnement_id uuid, sens text, jour date, depart timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select t.abonnement_id, d.sens, d.jour, d.depart
  from push_trajets t
  cross join lateral vigie_trajet_departs(t.jours, t.aller, t.retour, p_t) as d
  where p_t >= d.depart - make_interval(mins => vigie_trajet_avance_min())
    and p_t < d.depart
    and (case d.sens when 'aller' then t.verifie_aller else t.verifie_retour end) is distinct from d.jour;
$$;

-- RPC : enregistrer (ou remplacer) le trajet de ce téléphone. Il faut être
-- abonné aux alertes : le trajet est rattaché à l'abonnement.
--   p_points : [[lat, lng], …] sans les extrémités (voir plus haut)
--   p_jours  : bit 0 = lundi … bit 6 = dimanche (31 = lundi à vendredi)
--   p_aller, p_retour : heure de départ « HH:MM », au moins une des deux
create or replace function trajet_enregistrer(
  p_endpoint text,
  p_points jsonb,
  p_jours int,
  p_aller text default null,
  p_retour text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ab uuid;
  v_ligne geography;
  v_aller time;
  v_retour time;
  v_long int;
begin
  select id into v_ab from push_abonnements where endpoint = p_endpoint;
  if v_ab is null then
    raise exception 'alertes_inactives';
  end if;
  v_ligne := vigie_trajet_ligne(p_points);
  if p_jours is null or p_jours < 1 or p_jours > 127 then
    raise exception 'trajet_jours';
  end if;
  v_aller := vigie_trajet_heure(p_aller);
  v_retour := vigie_trajet_heure(p_retour);
  if v_aller is null and v_retour is null then
    raise exception 'trajet_heure';
  end if;
  v_long := round(st_length(v_ligne))::int;

  insert into push_trajets (abonnement_id, geom, longueur_m, jours, aller, retour)
  values (v_ab, v_ligne, v_long, p_jours, v_aller, v_retour)
  on conflict (abonnement_id) do update
    set geom = excluded.geom,
        longueur_m = excluded.longueur_m,
        jours = excluded.jours,
        aller = excluded.aller,
        retour = excluded.retour,
        -- heure changée : le point « avant départ » peut repartir aujourd'hui
        verifie_aller = case when push_trajets.aller is not distinct from excluded.aller
                             then push_trajets.verifie_aller end,
        verifie_retour = case when push_trajets.retour is not distinct from excluded.retour
                              then push_trajets.verifie_retour end,
        updated_at = now();

  return jsonb_build_object('ok', true, 'longueur_m', v_long);
end;
$$;

-- RPC : trajet enregistré pour ce téléphone (nul s'il n'y en a pas)
create or replace function trajet_mon(p_endpoint text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'jours', t.jours,
    'aller', left(t.aller::text, 5),
    'retour', left(t.retour::text, 5),
    'longueur_m', t.longueur_m
  )
  from push_trajets t
  join push_abonnements a on a.id = t.abonnement_id
  where a.endpoint = p_endpoint;
$$;

-- RPC : effacer le trajet de ce téléphone (les alertes de zone restent)
create or replace function trajet_supprimer(p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from push_trajets t
  using push_abonnements a
  where a.id = t.abonnement_id and a.endpoint = p_endpoint;
  return jsonb_build_object('ok', true);
end;
$$;

-- RPC : signalements en cours le long d'un trajet (point à l'ouverture de
-- l'appli). Rien n'est enregistré. Mêmes colonnes que
-- signalements_proches_v3 (distance_m nulle : la distance à la position
-- n'a pas de sens ici), plus position_m = distance depuis le début de la
-- ligne envoyée. Jamais de SOS.
--   select * from trajet_signalements('[[-22.30, 166.55], [-22.24, 166.61]]');
create or replace function trajet_signalements(p_points jsonb)
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
  actif boolean,
  fin_annoncee date,
  resume_ia text,
  resume_ia_nb int,
  position_m double precision
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
    ligne as (
      select vigie_trajet_ligne(p_points) as g
    )
  select
    r.id, r.type, r.lat, r.lng, r.photo_url, r.description, r.niveau_risque,
    r.lieu, r.source_officielle, r.relais_source, r.confirmations, r.infirmations,
    r.created_at, r.expires_at, r.last_confirmed_at,
    null::double precision as distance_m,
    coalesce(a.device_key = m.cle, false) as est_auteur,
    v.vote as mon_vote,
    true as actif,
    r.fin_annoncee,
    case when r.contenu_masque_at is null then r.resume_ia end as resume_ia,
    case when r.contenu_masque_at is null and r.resume_ia is not null then r.resume_ia_nb end as resume_ia_nb,
    round(st_linelocatepoint(l.g::geometry, r.geom::geometry) * st_length(l.g)) as position_m
  from reports r
  cross join moi m
  cross join ligne l
  left join report_authors a on a.report_id = r.id
  left join report_votes v on v.report_id = r.id and v.device_key = m.cle
  where r.expires_at > now()
    and r.resolved_at is null
    and r.type::text <> 'sos'
    and st_dwithin(r.geom, l.g, vigie_trajet_couloir_m())
  order by position_m
  limit 100;
$$;

-- RPC (serveur, avec la session du téléphone) : un calcul d'itinéraire est
-- permis ? 20 par jour et par session, 300 par heure pour toute la base.
create or replace function trajet_itineraire_autoriser()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cle text := vigie_cle_session();
begin
  if v_cle is null then
    raise exception 'connexion_requise';
  end if;
  if (select count(*) from vigie_itineraire_appels
      where device_key = v_cle and created_at > now() - interval '24 hours') >= 20
     or (select count(*) from vigie_itineraire_appels
         where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'itineraire_trop';
  end if;
  insert into vigie_itineraire_appels (device_key) values (v_cle);
  return jsonb_build_object('ok', true);
end;
$$;

-- RPC (serveur d'envoi, /api/trajet) : points « avant départ » à envoyer
-- maintenant. Chaque départ n'est traité qu'une fois par jour (même si
-- deux appels arrivent ensemble : la mise à jour verrouille la ligne).
-- Seuls les trajets avec au moins un danger confirmé sont renvoyés.
create or replace function trajet_avant_depart(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_du record;
  v_t push_trajets%rowtype;
  v_ab push_abonnements%rowtype;
  v_problemes jsonb;
  v_nb int;
  v_res jsonb := '[]'::jsonb;
begin
  if not vigie_secret_notif_ok(p_secret) then
    raise exception 'secret_invalide';
  end if;

  for v_du in select * from vigie_trajets_dus(now()) order by depart loop
    if v_du.sens = 'aller' then
      update push_trajets set verifie_aller = v_du.jour
       where abonnement_id = v_du.abonnement_id and verifie_aller is distinct from v_du.jour
      returning * into v_t;
    else
      update push_trajets set verifie_retour = v_du.jour
       where abonnement_id = v_du.abonnement_id and verifie_retour is distinct from v_du.jour
      returning * into v_t;
    end if;
    continue when not found;

    select count(*)::int,
           coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id, 'type', p.type, 'lieu', p.lieu,
             'confirmations', p.confirmations,
             'source_officielle', p.source_officielle,
             'relais_source', p.relais_source,
             'depuis_depart_m', p.depuis_depart_m
           ) order by p.depuis_depart_m) filter (where p.rang <= 5), '[]'::jsonb)
      into v_nb, v_problemes
    from (
      select r.id, r.type, r.lieu, r.confirmations, r.source_officielle, r.relais_source,
             x.depuis_depart_m,
             row_number() over (order by x.depuis_depart_m) as rang
      from reports r
      cross join lateral (
        select round(case when v_du.sens = 'retour'
                          then (1 - st_linelocatepoint(v_t.geom::geometry, r.geom::geometry)) * v_t.longueur_m
                          else st_linelocatepoint(v_t.geom::geometry, r.geom::geometry) * v_t.longueur_m
                     end) as depuis_depart_m
      ) x
      where r.resolved_at is null
        and r.expires_at > now()
        and vigie_est_danger(r.type)
        and (r.confirmations >= 1 or r.source_officielle is not null)
        and st_dwithin(r.geom, v_t.geom, vigie_trajet_couloir_m())
    ) p;

    continue when v_nb = 0;

    -- noté comme annoncé sur le trajet : l'alerte « fin » suivra
    insert into push_envois (report_id, abonnement_id, trajet_at)
    select (e->>'id')::uuid, v_t.abonnement_id, now()
    from jsonb_array_elements(v_problemes) e
    on conflict (report_id, abonnement_id) do update set trajet_at = excluded.trajet_at;

    select * into v_ab from push_abonnements where id = v_t.abonnement_id;
    v_res := v_res || jsonb_build_array(jsonb_build_object(
      'endpoint', v_ab.endpoint, 'p256dh', v_ab.p256dh, 'auth', v_ab.auth,
      'sens', v_du.sens,
      'depart', v_du.depart,
      'jour', v_du.jour,
      'nb', v_nb,
      'problemes', v_problemes
    ));
  end loop;

  return jsonb_build_object('trajets', v_res);
end;
$$;

-- Appelé par pg_cron toutes les 5 min : prévient /api/trajet s'il y a des
-- points « avant départ » à faire (sinon rien, pas d'appel pour rien).
create or replace function vigie_trajets_appeler()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from vigie_trajets_dus(now())) then
    return;
  end if;
  select valeur into v_url from vigie_config where cle = 'trajet_url';
  if v_url is null then
    select regexp_replace(valeur, '/api/notifier/?$', '/api/trajet')
      into v_url from vigie_config where cle = 'notif_url';
    if v_url !~ '/api/trajet$' then
      v_url := null;
    end if;
  end if;
  select valeur into v_secret from vigie_config where cle = 'notif_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  begin
    perform net.http_post(
      url := v_url,
      body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-vigie-secret', v_secret),
      timeout_milliseconds := 30000
    );
  exception when others then
    -- pg_net absent ou en panne : on réessaiera dans 5 min
    null;
  end;
end;
$$;

-- Déclencheur : un danger annoncé sur un trajet (dans les 12 h) vient
-- d'être déclaré terminé → /api/notifier envoie la « fin d'alerte ».
create or replace function vigie_signal_fin_trajet()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_secret text;
begin
  if old.resolved_at is not null or new.resolved_at is null or not vigie_est_danger(new.type) then
    return new;
  end if;
  if not exists (
    select 1 from push_envois e
    where e.report_id = new.id
      and e.trajet_at > now() - interval '12 hours'
      and e.fin_envoyee_at is null
  ) then
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
      body := jsonb_build_object('report_id', new.id, 'fin', true),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-vigie-secret', v_secret),
      timeout_milliseconds := 15000
    );
  exception when others then
    -- pg_net absent ou en panne : pas de « fin » cette fois, rien ne bloque
    null;
  end;
  return new;
end;
$$;

drop trigger if exists trg_vigie_fin_trajet on reports;
create trigger trg_vigie_fin_trajet
after update of resolved_at on reports
for each row execute function vigie_signal_fin_trajet();

