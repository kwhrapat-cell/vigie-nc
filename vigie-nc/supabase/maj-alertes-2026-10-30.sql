-- =====================================================================
-- Vigie NC — MISE À JOUR DES ALERTES (30/10/2026) : à lancer UNE fois dans
-- une requête neuve de l'éditeur SQL Supabase (ré-exécutable sans risque).
--   - fin d'alerte aussi pour les zones d'alerte (plus seulement le trajet)
--   - option « tout est calme » du trajet
--   - mémoire des inondations le long du trajet
-- Même contenu que schema.sql, qui reste le script de référence.
-- Résultat attendu : « Success. No rows returned ».
-- =====================================================================

-- « Tout est calme » : point avant départ même sans danger (au choix)
alter table push_trajets add column if not exists calme boolean not null default false;

-- Déclencheur : un danger annoncé (zone d'alerte ou trajet, dans les 12 h)
-- vient d'être déclaré terminé → /api/notifier envoie la « fin d'alerte ».
-- (Remplace trg_vigie_fin_trajet, qui ne servait qu'aux trajets.)
drop trigger if exists trg_vigie_fin_trajet on reports;
drop function if exists vigie_signal_fin_trajet();
create or replace function vigie_signal_fin_alerte()
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
      and greatest(e.sent_at, coalesce(e.trajet_at, e.sent_at)) > now() - interval '12 hours'
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

drop trigger if exists trg_vigie_fin_alerte on reports;
create trigger trg_vigie_fin_alerte
after update of resolved_at on reports
for each row execute function vigie_signal_fin_alerte();

-- RPC (serveur d'envoi) : destinataires de la « fin d'alerte » d'un danger
-- terminé (ceux qui l'ont reçu dans les 12 h, par leur zone ou leur trajet),
-- notés tout de suite (jamais deux fois).
create or replace function notif_fin_destinataires(p_secret text, p_report_id uuid)
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
  if v_report.resolved_at is null then
    -- toujours en cours : rien à annoncer
    return jsonb_build_object('report', jsonb_build_object('id', v_report.id), 'abonnements', '[]'::jsonb);
  end if;

  with cibles as (
    update push_envois e
       set fin_envoyee_at = now()
     where e.report_id = p_report_id
       and greatest(e.sent_at, coalesce(e.trajet_at, e.sent_at)) > now() - interval '12 hours'
       and e.fin_envoyee_at is null
    returning e.abonnement_id, e.trajet_at is not null as sur_trajet
  )
  select jsonb_build_object(
    'report', jsonb_build_object(
      'id', v_report.id,
      'type', v_report.type,
      'lieu', v_report.lieu
    ),
    'abonnements', coalesce(
      (select jsonb_agg(jsonb_build_object(
         'endpoint', a.endpoint, 'p256dh', a.p256dh, 'auth', a.auth,
         'nom', a.nom, 'sur_trajet', c.sur_trajet))
         from cibles c join push_abonnements a on a.id = c.abonnement_id),
      '[]'::jsonb)
  ) into v_res;

  return v_res;
end;
$$;

-- RPC : enregistrer (ou remplacer) le trajet de ce téléphone. Il faut être
-- abonné aux alertes : le trajet est rattaché à l'abonnement.
--   p_points : [[lat, lng], …] sans les extrémités (voir plus haut)
--   p_jours  : bit 0 = lundi … bit 6 = dimanche (31 = lundi à vendredi)
--   p_aller, p_retour : heure de départ « HH:MM », au moins une des deux
--   p_calme  : point avant départ même quand tout est calme
-- (p_calme ajouté : l'ancienne version à 5 paramètres est supprimée avant.)
drop function if exists trajet_enregistrer(text, jsonb, int, text, text);
create or replace function trajet_enregistrer(
  p_endpoint text,
  p_points jsonb,
  p_jours int,
  p_aller text default null,
  p_retour text default null,
  p_calme boolean default false
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

  insert into push_trajets (abonnement_id, geom, longueur_m, jours, aller, retour, calme)
  values (v_ab, v_ligne, v_long, p_jours, v_aller, v_retour, coalesce(p_calme, false))
  on conflict (abonnement_id) do update
    set geom = excluded.geom,
        longueur_m = excluded.longueur_m,
        jours = excluded.jours,
        aller = excluded.aller,
        retour = excluded.retour,
        calme = excluded.calme,
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
    'longueur_m', t.longueur_m,
    'calme', t.calme
  )
  from push_trajets t
  join push_abonnements a on a.id = t.abonnement_id
  where a.endpoint = p_endpoint;
$$;

-- RPC (serveur d'envoi, /api/trajet) : points « avant départ » à envoyer
-- maintenant. Chaque départ n'est traité qu'une fois par jour (même si
-- deux appels arrivent ensemble : la mise à jour verrouille la ligne).
-- Sont renvoyés les trajets avec au moins un danger confirmé, et ceux qui
-- ont demandé « tout est calme » (nb = 0, avec le nombre de signalements à
-- surveiller : travaux, trafic, dangers pas encore confirmés…).
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
  v_surveiller int;
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

    continue when v_nb = 0 and not v_t.calme;

    -- le reste : ni SOS, ni danger confirmé (déjà compté)
    select count(*)::int into v_surveiller
    from reports r
    where r.resolved_at is null
      and r.expires_at > now()
      and r.type::text <> 'sos'
      and not (vigie_est_danger(r.type) and (r.confirmations >= 1 or r.source_officielle is not null))
      and st_dwithin(r.geom, v_t.geom, vigie_trajet_couloir_m());

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
      'surveiller', v_surveiller,
      'problemes', v_problemes
    ));
  end loop;

  return jsonb_build_object('trajets', v_res);
end;
$$;

-- RPC : mémoire des inondations le long d'un trajet (ouvert à tous, rien
-- n'est enregistré) : les endroits du couloir signalés inondés ces 12
-- derniers mois, regroupés à ~400 m près (« fois » = jours différents), et
-- s'il pleut en ce moment près de la route (inondation ou météo signalée et
-- en cours à moins de 10 km de la ligne). Même mémoire que
-- statistiques_zone : tous les signalements d'inondation comptent.
--   select trajet_memoire_inondations('[[-22.30, 166.55], [-22.24, 166.61]]');
create or replace function trajet_memoire_inondations(p_points jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  with
    ligne as (
      select vigie_trajet_ligne(p_points) as g
    ),
    passes as (
      select r.id, r.geom, r.lat, r.lng, r.lieu, r.created_at,
             (r.resolved_at is null and r.expires_at > now()) as en_cours
      from reports r
      cross join ligne l
      where r.type::text = 'inondation'
        and r.created_at > now() - interval '12 months'
        and st_dwithin(r.geom, l.g, vigie_trajet_couloir_m())
    ),
    -- même endroit = rattaché au plus ancien signalement à moins de 400 m
    groupes as (
      select p.*,
             (select q.id from passes q
               where st_dwithin(q.geom, p.geom, 400)
               order by q.created_at, q.id
               limit 1) as ancre
      from passes p
    ),
    zones as (
      select
        (array_agg(g.lieu order by g.created_at desc) filter (where g.lieu is not null))[1] as lieu,
        avg(g.lat) as lat,
        avg(g.lng) as lng,
        count(distinct vigie_jour_local(g.created_at))::int as fois,
        max(g.created_at) as derniere,
        bool_or(g.en_cours) as en_cours
      from groupes g
      group by g.ancre
      order by 4 desc, 5 desc
      limit 10
    )
  select jsonb_build_object(
    'zones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'lieu', z.lieu,
               'lat', z.lat,
               'lng', z.lng,
               'fois', z.fois,
               'derniere', z.derniere,
               'en_cours', z.en_cours,
               'position_m', round(st_linelocatepoint(l.g::geometry,
                               st_setsrid(st_makepoint(z.lng, z.lat), 4326)) * st_length(l.g))
             ) order by z.fois desc, z.derniere desc)
      from zones z
      cross join ligne l
    ), '[]'::jsonb),
    'pluie_en_cours', exists (
      select 1
      from reports r
      cross join ligne l
      where r.type::text in ('inondation', 'meteo')
        and r.resolved_at is null
        and r.expires_at > now()
        and st_dwithin(r.geom, l.g, 10000)
    )
  );
$$;

-- Droits
revoke execute on function vigie_signal_fin_alerte() from public, anon, authenticated;
grant execute on function trajet_enregistrer(text, jsonb, int, text, text, boolean) to anon, authenticated;
grant execute on function trajet_mon(text) to anon, authenticated;
grant execute on function trajet_avant_depart(text) to anon, authenticated;
grant execute on function notif_fin_destinataires(text, uuid) to anon, authenticated;
grant execute on function trajet_memoire_inondations(jsonb) to anon, authenticated;
