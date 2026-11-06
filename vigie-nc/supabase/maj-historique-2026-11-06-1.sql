-- =====================================================================
-- Vigie NC — MISE À JOUR « HISTORIQUE ET CHIFFRES » (06/11/2026), PARTIE 1/2
-- À lancer dans une requête neuve de l'éditeur SQL Supabase, la partie 1
-- puis la partie 2 (chacune ré-exécutable sans risque).
--   - les appareils de l'équipe (modération ouverte dessus) ne comptent
--     plus dans les chiffres, et ce qui avait été compté est retiré
-- Même contenu que schema.sql, qui reste le script de référence.
-- Résultat attendu : « Success. No rows returned ».
-- =====================================================================

-- Appareils de l'équipe (décision de Patrice du 06/11/2026) : jamais
-- comptés dans les chiffres. Un appareil y entre quand on ouvre l'écran
-- /moderation avec un code valide (moderation_verifier) ; ce qui avait
-- déjà été compté pour lui est alors retiré (vigie_noter_appareil_equipe).
-- Empreinte de la session seulement, comme vigie_activite. Quelques
-- lignes, effacées après 1 an sans passage en modération.
create table if not exists vigie_appareils_equipe (
  cle text primary key,
  ajoute_at timestamptz not null default now(),
  derniere_vue timestamptz not null default now()
);

alter table vigie_appareils_equipe enable row level security;
revoke all on vigie_appareils_equipe from anon, authenticated;

-- Cet appareil appartient à l'équipe (appelé par moderation_verifier, code
-- déjà vérifié) : il n'est plus compté, et ce qui l'avait été est retiré
-- — ses jours d'activité (actifs, fidélité, courbe) et, s'il avait été
-- compté comme nouveau, un nouveau de son premier jour. Ni sa provenance
-- (comptée sans lien avec l'appareil) ni les records passés ne peuvent
-- être corrigés.
create or replace function vigie_noter_appareil_equipe()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text := vigie_cle_session();
  v_nouveau boolean;
  v_premier date;
begin
  if v_key is null then
    return;
  end if;
  insert into vigie_appareils_equipe (cle) values (v_key)
  on conflict (cle) do update set derniere_vue = now()
  returning (xmax = 0) into v_nouveau;
  if not v_nouveau then
    return;
  end if;

  -- Jours déjà rangés en totaux : un actif de moins (la purge de nuit
  -- recalcule les jours encore détaillés, pas ceux où il était seul).
  update vigie_stats_jour s
     set actifs = greatest(s.actifs - 1, 0)
    from vigie_activite a
   where a.cle = v_key and a.jour = s.jour;
  delete from vigie_activite where cle = v_key;

  delete from vigie_visiteurs where cle = v_key
  returning premier_jour into v_premier;
  if v_premier is not null then
    update vigie_stats_jour
       set nouveaux = greatest(nouveaux - 1, 0)
     where jour = v_premier;
  end if;
end;
$$;

revoke execute on function vigie_noter_appareil_equipe() from public, anon, authenticated;

-- RPC : vérifier un code (connexion à l'écran de modération). L'appareil
-- devient un appareil de l'équipe : il ne compte plus dans les chiffres.
create or replace function moderation_verifier(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_nom text;
begin
  v_nom := vigie_moderateur(p_code);
  perform vigie_noter_appareil_equipe();
  return jsonb_build_object('nom', v_nom);
end;
$$;

-- RPC : « ce téléphone utilise l'appli ». Session anonyme obligatoire ;
-- sans session, rien n'est compté. Au plus une écriture par minute.
--   select vigie_presence('affiche');
create or replace function vigie_presence(p_source text default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text := vigie_cle_session();
  v_jour date := vigie_jour_local();
  v_source text := lower(btrim(coalesce(p_source, '')));
  v_vue timestamptz;
  v_nouveau boolean;
  v_simultanes int;
begin
  if v_key is null then
    return;
  end if;
  -- Appareil de l'équipe : jamais compté
  if exists (select 1 from vigie_appareils_equipe where cle = v_key) then
    return;
  end if;

  select derniere_vue into v_vue
  from vigie_activite
  where cle = v_key and jour = v_jour;
  if v_vue is not null and v_vue > now() - interval '60 seconds' then
    return;
  end if;

  insert into vigie_activite (cle, jour, derniere_vue)
  values (v_key, v_jour, now())
  on conflict (cle, jour) do update set derniere_vue = excluded.derniere_vue;

  v_nouveau := not exists (select 1 from vigie_visiteurs where cle = v_key);
  insert into vigie_visiteurs (cle, premier_jour, dernier_jour)
  values (v_key, v_jour, v_jour)
  on conflict (cle) do update set dernier_jour = excluded.dernier_jour;

  if v_nouveau then
    if v_source !~ '^[a-z0-9_-]{1,30}$' then
      v_source := 'direct';
    end if;
    insert into vigie_sources_jour (jour, source, nouveaux)
    values (v_jour, v_source, 1)
    on conflict (jour, source) do update set nouveaux = vigie_sources_jour.nouveaux + 1;
    insert into vigie_stats_jour (jour, nouveaux)
    values (v_jour, 1)
    on conflict (jour) do update set nouveaux = vigie_stats_jour.nouveaux + 1;
  end if;

  -- Record du jour : appareils actifs dans les 5 dernières minutes
  select count(*) into v_simultanes
  from vigie_activite
  where jour >= v_jour - 1 and derniere_vue > now() - interval '5 minutes';
  insert into vigie_stats_jour (jour, max_simultanes)
  values (v_jour, v_simultanes)
  on conflict (jour) do update
    set max_simultanes = greatest(vigie_stats_jour.max_simultanes, excluded.max_simultanes);
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
-- Les signalements eux-mêmes restent, anonymes, pour l'historique (sauf
-- les essais effacés par la modération, onglet « Historique »).
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
  delete from vigie_appareils_equipe e
   where e.derniere_vue < now() - interval '1 year';

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
