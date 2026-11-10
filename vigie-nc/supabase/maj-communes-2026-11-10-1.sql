-- =====================================================================
-- Vigie NC — MISE À JOUR « COMMUNES PARTENAIRES » (10/11/2026), PARTIE 1/3
-- À lancer dans une requête neuve de l'éditeur SQL Supabase : la partie 1,
-- puis la 2, puis la 3 (chacune ré-exécutable sans risque).
--   - table des périmètres (cercle autour d'une commune) et agents limités
--   - écran de modération : liste, actions et chantiers limités au périmètre
-- Même contenu que schema.sql, qui reste le script de référence.
-- Résultat attendu : « Success. No rows returned ».
-- =====================================================================

-- ---------------------------------------------------------------------
-- Périmètres des communes partenaires (décision de Patrice du 10/11/2026)
--   Un modérateur peut être limité à un périmètre (ex. la Ville du
--   Mont-Dore) : il ne voit et ne modère que les signalements de ce
--   périmètre, et ses annonces ne vont qu'aux téléphones de ce périmètre.
--   Sans périmètre (perimetre_id nul) : toute la Calédonie, comme avant
--   (équipe Vigie NC). Réservé à l'équipe : chiffres, erreurs, essai de
--   l'IA, alarme de sécurité et « Effacer (essai) ».
--   Le périmètre est un cercle (centre + rayon de 1 à 60 km), comme les
--   zones d'alerte. Un périmètre encore utilisé ne peut pas être supprimé :
--   sinon ses modérateurs passeraient à toute la Calédonie. Changer son
--   centre ou son rayon déclenche l'alarme de sécurité.
--   Dans l'éditeur SQL :
--     select vigie_ajouter_perimetre('mont-dore', 'Ville du Mont-Dore', -22.2312, 166.5262, 12);
--     select vigie_ajouter_agent('Mont-Dore Sécurité', '<code>', 'mont-dore');
--     select vigie_limiter_moderateur('Mont-Dore Sécurité', null);  -- toute la NC
-- ---------------------------------------------------------------------
create table if not exists perimetres (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  nom text not null check (char_length(nom) between 2 and 60),
  lat double precision not null,
  lng double precision not null,
  rayon_m int not null check (rayon_m between 1000 and 60000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table moderateurs add column if not exists perimetre_id text
  references perimetres(id) on update cascade;

-- Périmètre d'un modérateur (nul = toute la Calédonie ; fonction interne).
create or replace function vigie_perimetre_moderateur(p_nom text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select perimetre_id from moderateurs where nom = p_nom;
$$;

-- Le périmètre tel que l'appli l'affiche (nul si pas de périmètre).
create or replace function vigie_perimetre_json(p_perimetre text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', p.id, 'nom', p.nom, 'lat', p.lat, 'lng', p.lng, 'rayon_m', p.rayon_m)
  from perimetres p
  where p.id = p_perimetre;
$$;

-- Un point est-il dans le périmètre ? Nul = toute la Calédonie : oui.
create or replace function vigie_dans_perimetre(p_perimetre text, p_lat double precision, p_lng double precision)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select p_perimetre is null
      or exists (
        select 1 from perimetres p
        where p.id = p_perimetre
          and p_lat is not null and p_lng is not null
          and st_dwithin(st_setsrid(st_makepoint(p.lng, p.lat), 4326)::geography,
                         st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
                         p.rayon_m)
      );
$$;

-- Une zone d'alerte (lieu + rayon) touche-t-elle le périmètre ? Sert à
-- choisir les abonnés qui reçoivent l'annonce d'une commune.
create or replace function vigie_zone_touche_perimetre(
  p_perimetre text, p_lat double precision, p_lng double precision, p_rayon_m int
)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select p_perimetre is null
      or exists (
        select 1 from perimetres p
        where p.id = p_perimetre
          and p_lat is not null and p_lng is not null
          and st_dwithin(st_setsrid(st_makepoint(p.lng, p.lat), 4326)::geography,
                         st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
                         p.rayon_m + greatest(coalesce(p_rayon_m, 0), 0))
      );
$$;

-- Créer ou changer un périmètre (éditeur SQL seulement).
create or replace function vigie_ajouter_perimetre(
  p_id text, p_nom text, p_lat double precision, p_lng double precision, p_rayon_km numeric
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_lat is null or p_lng is null or not vigie_dans_nc(p_lat, p_lng) then
    raise exception 'position_hors_nc';
  end if;
  if p_rayon_km is null or p_rayon_km < 1 or p_rayon_km > 60 then
    raise exception 'perimetre_rayon_invalide';
  end if;
  insert into perimetres (id, nom, lat, lng, rayon_m)
  values (lower(btrim(p_id)), btrim(p_nom), p_lat, p_lng, round(p_rayon_km * 1000)::int)
  on conflict (id) do update
    set nom = excluded.nom, lat = excluded.lat, lng = excluded.lng,
        rayon_m = excluded.rayon_m, updated_at = now();
  return 'ok';
end;
$$;

-- Limiter un modérateur à un périmètre, ou le remettre sur toute la
-- Calédonie (p_perimetre nul). Éditeur SQL seulement.
create or replace function vigie_limiter_moderateur(p_nom text, p_perimetre text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  update moderateurs set perimetre_id = p_perimetre where nom = p_nom;
  if not found then
    raise exception 'moderateur_introuvable';
  end if;
  return coalesce(p_perimetre, 'toute la Calédonie');
end;
$$;

-- Agent d'une commune : modérateur créé directement avec son périmètre
-- (jamais un instant sur toute la Calédonie). Éditeur SQL seulement.
create or replace function vigie_ajouter_agent(p_nom text, p_code text, p_perimetre text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_code is null or char_length(p_code) < 16 then
    raise exception 'code_trop_court';
  end if;
  if p_perimetre is null or not exists (select 1 from perimetres where id = p_perimetre) then
    raise exception 'perimetre_introuvable';
  end if;
  insert into moderateurs (nom, code_hash, perimetre_id)
  values (btrim(p_nom), vigie_code_moderation(p_code), p_perimetre)
  on conflict (nom) do update
    set code_hash = excluded.code_hash, actif = true, perimetre_id = excluded.perimetre_id;
  return 'ok';
end;
$$;

-- Comme vigie_moderateur, mais refuse un agent de commune (périmètre) :
-- chiffres, erreurs, essai de l'IA, alarme de sécurité (fonction interne).
create or replace function vigie_moderateur_equipe(p_code text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_nom text;
begin
  v_nom := vigie_moderateur(p_code);
  if vigie_perimetre_moderateur(v_nom) is not null then
    raise exception 'reserve_equipe';
  end if;
  return v_nom;
end;
$$;

-- RPC : vérifier un code (connexion à l'écran de modération). L'appareil
-- devient un appareil de l'équipe : il ne compte plus dans les chiffres.
-- « perimetre » : nul pour l'équipe (toute la Calédonie), sinon la commune.
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
  return jsonb_build_object(
    'nom', v_nom,
    'perimetre', vigie_perimetre_json(vigie_perimetre_moderateur(v_nom))
  );
end;
$$;

create or replace function moderation_liste(p_code text, p_filtre text default 'signales')
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_res jsonb;
  v_perimetre text;
  v_centre geography;
  v_rayon int;
begin
  v_perimetre := vigie_perimetre_moderateur(vigie_moderateur(p_code));
  if v_perimetre is not null then
    select st_setsrid(st_makepoint(p.lng, p.lat), 4326)::geography, p.rayon_m
      into v_centre, v_rayon
      from perimetres p where p.id = v_perimetre;
  end if;

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
      r.fin_annoncee,
      r.resume_ia, r.resume_ia_nb,
      coalesce(f.nb, 0) as nb_signalements,
      coalesce(f.motifs, '{}'::jsonb) as motifs,
      case when p_filtre = 'historique' then r.created_at
           else coalesce(f.dernier, r.contenu_masque_at, r.created_at) end as tri
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
      when p_filtre = 'travaux' then
        r.type::text = 'travaux' and r.expires_at > now() - interval '7 days'
      when p_filtre = 'historique' then
        r.type::text <> 'sos'
      else
        ((coalesce(f.nb, 0) > 0 or r.contenu_masque_at is not null)
          and r.created_at > now() - interval '30 days')
        or (r.fin_annoncee is not null and r.infirmations > 0
            and r.resolved_at is null and r.expires_at > now())
    end
      and (v_perimetre is null or st_dwithin(r.geom, v_centre, v_rayon))
    order by tri desc
    limit case when p_filtre = 'historique' then 300 else 100 end
  ) t;

  return v_res;
end;
$$;

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
  v_perimetre text;
begin
  v_nom := vigie_moderateur(p_code);
  if not exists (select 1 from reports where id = p_report_id) then
    raise exception 'signalement_introuvable';
  end if;
  -- Agent d'une commune : seulement dans son périmètre, et jamais « Effacer ».
  v_perimetre := vigie_perimetre_moderateur(v_nom);
  if v_perimetre is not null then
    if not exists (select 1 from reports r
                   where r.id = p_report_id and vigie_dans_perimetre(v_perimetre, r.lat, r.lng)) then
      raise exception 'hors_perimetre';
    end if;
    if p_action = 'effacer' then
      raise exception 'reserve_equipe';
    end if;
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
    -- Un chantier perd aussi sa date de fin : il redevient un signalement
    -- ordinaire, qui s'efface sans nouvelle confirmation.
    update reports
    set source_officielle = null,
        expires_at = case when fin_annoncee is null then expires_at
                          else least(expires_at, now() + vigie_duree_vie(type)) end,
        fin_annoncee = null
    where id = p_report_id;
  elsif p_action = 'effacer' then
    select left(r.type::text || ' · ' || coalesce(r.lieu, 'lieu inconnu') || ' · '
                || to_char(timezone('Pacific/Noumea', r.created_at), 'DD/MM/YYYY HH24:MI'), 200)
      into v_source
      from reports r where r.id = p_report_id;
    -- Encore sur la carte : les téléphones de la zone rechargent tout de
    -- suite (même signal sans contenu que trg_vigie_signal).
    insert into vigie_signal (cellule_lat, cellule_lng)
    select round(r.lat::numeric, 1)::real, round(r.lng::numeric, 1)::real
      from reports r
     where r.id = p_report_id and r.resolved_at is null and r.expires_at > now();
    delete from reports where id = p_report_id;
  else
    raise exception 'action_invalide';
  end if;

  insert into moderation_journal (moderateur, report_id, action, detail)
  values (v_nom, p_report_id, p_action, v_source);

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function moderation_chantier(
  p_code text,
  p_report_id uuid,
  p_source text,
  p_fin date
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_nom text;
  v_source text := left(nullif(btrim(p_source), ''), 60);
  v_type text;
  v_aujourdhui date := vigie_jour_local();
begin
  v_nom := vigie_moderateur(p_code);
  select type::text into v_type from reports where id = p_report_id;
  if v_type is null then
    raise exception 'signalement_introuvable';
  end if;
  if not exists (select 1 from reports r
                 where r.id = p_report_id
                   and vigie_dans_perimetre(vigie_perimetre_moderateur(v_nom), r.lat, r.lng)) then
    raise exception 'hors_perimetre';
  end if;
  if v_type <> 'travaux' then
    raise exception 'chantier_type_invalide';
  end if;
  if v_source is null then
    raise exception 'source_manquante';
  end if;
  if p_fin is null or p_fin < v_aujourdhui or p_fin > v_aujourdhui + vigie_chantier_jours_max() then
    raise exception 'chantier_date_invalide';
  end if;

  update reports
  set source_officielle = v_source,
      fin_annoncee = p_fin,
      -- minuit à la fin du jour annoncé, heure de Nouméa
      expires_at = (p_fin + 1)::timestamp at time zone 'Pacific/Noumea',
      resolved_at = null
  where id = p_report_id;

  insert into moderation_journal (moderateur, report_id, action, detail)
  values (v_nom, p_report_id, 'chantier', v_source || ' · jusqu''au ' || to_char(p_fin, 'DD/MM/YYYY'));

  return jsonb_build_object('ok', true, 'fin_annoncee', p_fin);
end;
$$;

-- Droits : rien de lisible ni d'appelable depuis l'appli
alter table perimetres enable row level security;
revoke all on perimetres from anon, authenticated;
revoke execute on function vigie_moderateur_equipe(text) from public, anon, authenticated;
revoke execute on function vigie_perimetre_moderateur(text) from public, anon, authenticated;
revoke execute on function vigie_perimetre_json(text) from public, anon, authenticated;
revoke execute on function vigie_dans_perimetre(text, double precision, double precision) from public, anon, authenticated;
revoke execute on function vigie_zone_touche_perimetre(text, double precision, double precision, int) from public, anon, authenticated;
revoke execute on function vigie_ajouter_perimetre(text, text, double precision, double precision, numeric) from public, anon, authenticated;
revoke execute on function vigie_limiter_moderateur(text, text) from public, anon, authenticated;
revoke execute on function vigie_ajouter_agent(text, text, text) from public, anon, authenticated;
