-- =====================================================================
-- Vigie NC — MISE À JOUR « COMMUNES PARTENAIRES » (10/11/2026), PARTIE 2/3
-- À lancer dans une requête neuve de l'éditeur SQL Supabase : la partie 1,
-- puis la 2, puis la 3 (chacune ré-exécutable sans risque).
--   - chiffres, erreurs, essai de l'IA et alarme de sécurité réservés à l'équipe
--   - alarme de sécurité quand le périmètre d'un modérateur change
-- Même contenu que schema.sql, qui reste le script de référence.
-- Résultat attendu : « Success. No rows returned ».
-- =====================================================================

-- Réservé à l'équipe (un agent de commune reçoit « reserve_equipe »)
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
  v_nom := vigie_moderateur_equipe(p_code);
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

create or replace function moderation_alertes_etat(p_code text, p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform vigie_moderateur_equipe(p_code);
  return jsonb_build_object(
    'active', exists (select 1 from moderation_alertes where endpoint = p_endpoint)
  );
end;
$$;

create or replace function moderation_alertes_desactiver(p_code text, p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform vigie_moderateur_equipe(p_code);
  delete from moderation_alertes where endpoint = p_endpoint;
  return jsonb_build_object('ok', true);
end;
$$;

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
  perform vigie_moderateur_equipe(p_code);

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
    'appareils_equipe', (select count(*) from vigie_appareils_equipe),
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

create or replace function moderation_ia_essai(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_nom text;
begin
  v_nom := vigie_moderateur_equipe(p_code);
  if not vigie_ia_active() then
    raise exception 'ia_coupee';
  end if;
  if not vigie_ia_quota_ok() then
    raise exception 'ia_quota';
  end if;
  insert into vigie_ia_appels (report_id, origine) values (null, 'essai');
  return jsonb_build_object(
    'ok', true,
    'nom', v_nom,
    'appels_heure', (select count(*) from vigie_ia_appels
                     where origine in ('resume', 'essai') and created_at > now() - interval '1 hour'),
    'max_heure', vigie_ia_max_heure()
  );
end;
$$;

create or replace function moderation_erreurs(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform vigie_moderateur_equipe(p_code);
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'message', e.message,
        'ecran', e.ecran,
        'navigateur', e.navigateur,
        'nombre', e.nombre,
        'jours', e.jours,
        'derniere', e.derniere
      )
      order by e.derniere desc
    )
    from (
      select message, ecran, max(navigateur) as navigateur, sum(nombre)::int as nombre,
             count(*)::int as jours, max(derniere) as derniere
      from vigie_erreurs
      where jour > vigie_jour_local() - 14
      group by message, ecran
      order by max(derniere) desc
      limit 50
    ) e
  ), '[]'::jsonb);
end;
$$;

-- Note un changement dans le journal et prévient le serveur d'envoi
-- (fonction interne). Sans configuration ou sans pg_net, il note seulement.
create or replace function vigie_envoyer_alarme(p_evenement text, p_nom text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_secret text;
begin
  insert into moderation_journal (moderateur, report_id, action, detail)
  values ('Supabase', null, 'moderateurs_' || p_evenement, left(p_nom, 85));

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
    return;
  end if;

  begin
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('evenement', p_evenement, 'nom', p_nom),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-vigie-secret', v_secret),
      timeout_milliseconds := 15000
    );
  exception when others then
    -- pg_net absent ou en panne : le changement reste noté dans le journal.
    null;
  end;
end;
$$;

-- Nom du périmètre pour l'alarme (« toute la Calédonie » si nul).
create or replace function vigie_nom_perimetre(p_perimetre text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select nom from perimetres where id = p_perimetre), 'toute la Calédonie');
$$;

-- Déclencheur de la table moderateurs. Un périmètre changé (agent d'une
-- commune remis sur toute la Calédonie, par exemple) déclenche aussi
-- l'alarme : c'est un changement de droits.
create or replace function vigie_alarme_moderateurs()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_evenement text;
  v_nom text;
begin
  if tg_op = 'TRUNCATE' then
    v_evenement := 'vidage';
  elsif tg_op = 'INSERT' then
    v_evenement := 'ajout';
    v_nom := new.nom || coalesce(' (' || (select nom from perimetres where id = new.perimetre_id) || ')', '');
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
  elsif old.perimetre_id is distinct from new.perimetre_id then
    v_evenement := 'perimetre';
    v_nom := new.nom || ' → ' || vigie_nom_perimetre(new.perimetre_id)
             || case when old.code_hash is distinct from new.code_hash then ', code changé' else '' end;
  elsif old.code_hash is distinct from new.code_hash then
    v_evenement := 'code';
    v_nom := new.nom;
  else
    return null;
  end if;

  perform vigie_envoyer_alarme(v_evenement, v_nom);
  return null;
end;
$$;

drop trigger if exists trg_vigie_alarme_moderateurs_maj on moderateurs;
create trigger trg_vigie_alarme_moderateurs_maj
after update of nom, code_hash, actif, perimetre_id on moderateurs
for each row
when (old.nom is distinct from new.nom
      or old.code_hash is distinct from new.code_hash
      or old.actif is distinct from new.actif
      or old.perimetre_id is distinct from new.perimetre_id)
execute function vigie_alarme_moderateurs();

-- Déclencheur de la table perimetres : centre ou rayon changé alors qu'un
-- modérateur l'utilise = ses droits changent.
create or replace function vigie_alarme_perimetres()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (select 1 from moderateurs where perimetre_id = new.id) then
    perform vigie_envoyer_alarme(
      'perimetre',
      new.nom || ' : ' || to_char(new.rayon_m / 1000.0, 'FM990.0') || ' km autour de '
        || to_char(new.lat, 'FM990.0000') || ', ' || to_char(new.lng, 'FM990.0000'));
  end if;
  return null;
end;
$$;

drop trigger if exists trg_vigie_alarme_perimetres on perimetres;
create trigger trg_vigie_alarme_perimetres
after update of lat, lng, rayon_m on perimetres
for each row
when (old.lat is distinct from new.lat
      or old.lng is distinct from new.lng
      or old.rayon_m is distinct from new.rayon_m)
execute function vigie_alarme_perimetres();

revoke execute on function vigie_envoyer_alarme(text, text) from public, anon, authenticated;
revoke execute on function vigie_nom_perimetre(text) from public, anon, authenticated;
revoke execute on function vigie_alarme_perimetres() from public, anon, authenticated;
