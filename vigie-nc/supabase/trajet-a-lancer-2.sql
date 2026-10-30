-- =====================================================================
-- Vigie NC — TRAJET FAVORI (2/2) : à lancer APRÈS la partie 1/2, dans
-- une requête neuve de l'éditeur SQL Supabase (ré-exécutable sans risque).
-- Résultat attendu : « Success. No rows returned ».
-- =====================================================================

-- RPC (serveur d'envoi) : destinataires de la « fin d'alerte » d'un danger
-- terminé, notés tout de suite (jamais deux fois).
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
       and e.trajet_at > now() - interval '12 hours'
       and e.fin_envoyee_at is null
    returning e.abonnement_id
  )
  select jsonb_build_object(
    'report', jsonb_build_object(
      'id', v_report.id,
      'type', v_report.type,
      'lieu', v_report.lieu
    ),
    'abonnements', coalesce(
      (select jsonb_agg(jsonb_build_object('endpoint', a.endpoint, 'p256dh', a.p256dh, 'auth', a.auth))
         from cibles c join push_abonnements a on a.id = c.abonnement_id),
      '[]'::jsonb)
  ) into v_res;

  return v_res;
end;
$$;

-- RPC (serveur d'envoi) : destinataires d'une alerte. Les envois sont
-- notés tout de suite : une même alerte n'est jamais envoyée deux fois.
-- Destinataires : les abonnés dont la zone contient le danger, et ceux dont
-- le trajet favori passe à moins de 300 m pendant l'heure de leur trajet
-- (de 30 min avant à 1 h après le départ ; voir « Trajet favori » plus bas).
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

  with zone as (
    select a.id,
           st_distance(st_setsrid(st_makepoint(a.lng, a.lat), 4326)::geography, v_report.geom) as distance_m
    from push_abonnements a
    where st_dwithin(st_setsrid(st_makepoint(a.lng, a.lat), 4326)::geography, v_report.geom, a.rayon_km * 1000)
  ),
  trajet as (
    select t.abonnement_id as id, d.sens,
           round(st_linelocatepoint(t.geom::geometry, v_report.geom::geometry) * t.longueur_m) as position_m,
           t.longueur_m
    from push_trajets t
    cross join lateral (
      -- le départ le plus proche de maintenant, s'il est dans la plage
      select x.sens from vigie_trajet_departs(t.jours, t.aller, t.retour, now()) x
      where now() between x.depart - make_interval(mins => vigie_trajet_avance_min())
                      and x.depart + make_interval(mins => vigie_trajet_apres_min())
      order by abs(extract(epoch from now() - x.depart))
      limit 1
    ) d
    where st_dwithin(t.geom, v_report.geom, vigie_trajet_couloir_m())
  ),
  cibles as (
    select a.id, a.endpoint, a.p256dh, a.auth, a.nom, z.distance_m,
           tr.id is not null as sur_trajet, tr.sens, tr.position_m, tr.longueur_m
    from push_abonnements a
    left join zone z on z.id = a.id
    left join trajet tr on tr.id = a.id
    where (z.id is not null or tr.id is not null)
      and not exists (
        select 1 from push_envois e where e.abonnement_id = a.id and e.report_id = p_report_id
      )
      and (
        select count(*) from push_envois e
        where e.abonnement_id = a.id and e.sent_at > now() - interval '1 hour'
      ) < 5
  ),
  notes as (
    -- trajet_at : annoncé sur le trajet (l'alerte « fin » suivra)
    insert into push_envois (report_id, abonnement_id, trajet_at)
    select p_report_id, id, case when sur_trajet then now() end from cibles
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
         'nom', c.nom, 'distance_m', round(c.distance_m),
         'sur_trajet', c.sur_trajet, 'sens', c.sens,
         -- distance depuis le départ de ce trajet-là (aller ou retour)
         'depuis_depart_m', case when c.sens = 'retour' then c.longueur_m - c.position_m else c.position_m end
       )) from cibles c),
      '[]'::jsonb)
  ) into v_res;

  return v_res;
end;
$$;

-- RPC : chiffres pour l'écran de modération (code du modérateur vérifié).
-- Uniquement des totaux : aucune liste d'appareils.
create or replace function moderation_statistiques(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_jour date := vigie_jour_local();
  v_res jsonb;
begin
  perform vigie_moderateur(p_code);

  with
    jours as (
      select d::date as jour
      from generate_series((v_jour - 29)::timestamp, v_jour::timestamp, interval '1 day') as d
    ),
    actifs_jour as (
      select jour, count(*)::int as n
      from vigie_activite
      where jour > v_jour - 30
      group by jour
    ),
    sig as (
      select r.*, vigie_jour_local(r.created_at) as jour
      from reports r
      where r.created_at > now() - interval '31 days'
        and r.type::text <> 'sos'
    ),
    sig_jour as (
      select jour, count(*)::int as n from sig group by jour
    ),
    premiere_confirmation as (
      select extract(epoch from (min(v.created_at) - s.created_at)) / 60 as minutes
      from sig s
      join report_votes v on v.report_id = s.id and v.vote = 'present'
      where s.created_at > now() - interval '30 days'
      group by s.id, s.created_at
    ),
    avant as (
      select distinct cle from vigie_activite where jour between v_jour - 14 and v_jour - 8
    ),
    apres as (
      select distinct cle from vigie_activite where jour between v_jour - 7 and v_jour - 1
    )
  select jsonb_build_object(
    'maintenant', (select count(*) from vigie_activite
                   where jour >= v_jour - 1 and derniere_vue > now() - interval '5 minutes'),
    'aujourdhui', (select count(*) from vigie_activite where jour = v_jour),
    'semaine', (select count(distinct cle) from vigie_activite where jour > v_jour - 7),
    'mois', (select count(distinct cle) from vigie_activite where jour > v_jour - 30),
    'nouveaux_mois', coalesce((select sum(nouveaux) from vigie_stats_jour where jour > v_jour - 30), 0),
    'visiteurs_total', coalesce((select sum(nouveaux) from vigie_stats_jour), 0),
    'debut', (select min(jour) from vigie_stats_jour),
    'record', (select jsonb_build_object('nombre', max_simultanes, 'jour', jour)
               from vigie_stats_jour
               where max_simultanes > 0
               order by max_simultanes desc, jour desc
               limit 1),
    'fidelite', jsonb_build_object(
      'base', (select count(*) from avant),
      'revenus', (select count(*) from avant where cle in (select cle from apres))
    ),
    'signalements', jsonb_build_object(
      'aujourdhui', (select count(*) from sig where jour = v_jour),
      'semaine', (select count(*) from sig where created_at > now() - interval '7 days'),
      'mois', (select count(*) from sig where created_at > now() - interval '30 days'),
      'confirmes_mois', (select count(*) from sig
                         where created_at > now() - interval '30 days'
                           and (confirmations >= 1 or source_officielle is not null)),
      'delai_confirmation_min', (select round(percentile_cont(0.5) within group (order by minutes::double precision))
                                 from premiere_confirmation),
      'votes_mois', (select count(*) from report_votes where updated_at > now() - interval '30 days')
    ),
    'abonnes_alertes', (select count(*) from push_abonnements),
    'abonnes_trajet', (select count(*) from push_trajets),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('source', source, 'nouveaux', n) order by n desc, source)
      from (
        select source, sum(nouveaux)::int as n
        from vigie_sources_jour
        where jour > v_jour - 30
        group by source
      ) x), '[]'::jsonb),
    'courbe', (
      select jsonb_agg(jsonb_build_object(
               'jour', j.jour,
               'actifs', coalesce(a.n, st.actifs, 0),
               'signalements', coalesce(sj.n, 0),
               'max_simultanes', coalesce(st.max_simultanes, 0)
             ) order by j.jour)
      from jours j
      left join actifs_jour a on a.jour = j.jour
      left join sig_jour sj on sj.jour = j.jour
      left join vigie_stats_jour st on st.jour = j.jour
    )
  ) into v_res;

  return v_res;
end;
$$;

-- ---------------------------------------------------------------------
-- Purge (lancée chaque nuit, voir en bas du fichier) :
--   - 30 jours après la fin d'un signalement, le lien entre l'empreinte du
--     téléphone et ce signalement est effacé (auteur, votes, signalements
--     de contenu) ;
--   - le contenu masqué par la modération est effacé après 90 jours ;
--   - le journal de modération et les annonces générales sont gardés un an ;
--   - la trace des alertes envoyées (anti-doublon) est gardée 7 jours ;
--   - la trace des calculs d'itinéraire (trajet favori, empreinte de la
--     session) : 24 heures ;
--   - les témoignages (textes de chaque personne, servant au résumé
--     automatique) et la trace des appels à l'IA : 7 jours (24 heures pour
--     les points route, qui gardent l'empreinte de la session) ;
--   - les sessions anonymes inactives depuis 90 jours sont supprimées ;
--   - le journal de sécurité de Supabase Auth est gardé 30 jours ;
--   - chiffres d'utilisation : le détail par appareil est ramené à des
--     totaux par jour, puis effacé après 35 jours (90 jours sans visite
--     pour le premier/dernier jour d'un appareil).
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
  delete from report_temoignages t
   where t.created_at < now() - interval '7 days';
  delete from vigie_ia_appels i
   where i.created_at < now() - interval '7 days'
      or (i.device_key is not null and i.created_at < now() - interval '24 hours');
  delete from vigie_itineraire_appels c
   where c.created_at < now() - interval '24 hours';
  delete from vigie_signal s
   where s.created_at < now() - interval '1 day';
  delete from vigie_annonce_signal s
   where s.created_at < now() - interval '1 day';
  delete from annonces a
   where a.created_at < now() - interval '1 year';
  delete from vigie_erreurs e
   where e.jour < vigie_jour_local() - 14;

  -- Chiffres d'utilisation : totaux par jour (jours terminés), puis le
  -- détail par appareil est effacé.
  insert into vigie_stats_jour (jour, actifs)
  select a.jour, count(*)::int
  from vigie_activite a
  where a.jour < vigie_jour_local()
  group by a.jour
  on conflict (jour) do update set actifs = excluded.actifs;
  delete from vigie_activite a
   where a.jour < vigie_jour_local() - 35;
  delete from vigie_visiteurs v
   where v.dernier_jour < vigie_jour_local() - 90;

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

-- Droits
alter table push_trajets enable row level security;
alter table vigie_itineraire_appels enable row level security;
revoke all on push_trajets from anon, authenticated;
revoke all on vigie_itineraire_appels from anon, authenticated;
-- Trajet favori : réglage avec l'adresse d'abonnement du téléphone (comme
-- les alertes) ; point sur le trajet ouvert à tous (la carte est publique) ;
-- calcul d'itinéraire avec une session ; envois avec le secret du serveur.
revoke execute on function vigie_trajet_ligne(jsonb) from public, anon, authenticated;
revoke execute on function vigie_trajet_heure(text) from public, anon, authenticated;
revoke execute on function vigie_trajet_departs(int, time, time, timestamptz) from public, anon, authenticated;
revoke execute on function vigie_trajets_dus(timestamptz) from public, anon, authenticated;
revoke execute on function vigie_trajets_appeler() from public, anon, authenticated;
revoke execute on function vigie_signal_fin_trajet() from public, anon, authenticated;
grant execute on function trajet_enregistrer(text, jsonb, int, text, text) to anon, authenticated;
grant execute on function trajet_mon(text) to anon, authenticated;
grant execute on function trajet_supprimer(text) to anon, authenticated;
grant execute on function trajet_signalements(jsonb) to anon, authenticated;
revoke execute on function trajet_itineraire_autoriser() from public, anon;
grant execute on function trajet_itineraire_autoriser() to authenticated;
grant execute on function trajet_avant_depart(text) to anon, authenticated;
grant execute on function notif_fin_destinataires(text, uuid) to anon, authenticated;

-- Point « avant départ » toutes les 5 min
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'vigie-trajets-avant-depart',
      '*/5 * * * *',
      'select public.vigie_trajets_appeler()'
    );
  else
    raise notice 'pg_cron indisponible : points avant départ non programmés.';
  end if;
end $$;
