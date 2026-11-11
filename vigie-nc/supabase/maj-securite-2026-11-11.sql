-- =====================================================================
-- Vigie NC — MISE À JOUR « SÉCURITÉ » (11/11/2026), en une seule partie
-- À lancer dans une requête neuve de l'éditeur SQL Supabase (ré-exécutable
-- sans risque). Même contenu que schema.sql, qui reste le script de référence.
--   - l'appli ne peut plus que LIRE les tables publiques (plus de vidage,
--     de déclencheur ni de clé étrangère : TRUNCATE, TRIGGER, REFERENCES)
--   - inscription aux alertes : seulement avec de vraies clés de navigateur,
--     et 300 nouvelles inscriptions par heure au plus pour toute la base
--     (des milliers de faux abonnements ralentiraient les vraies alertes)
--   - vigie_texte_erreur : chemin de recherche fixé (conseil Supabase)
-- Résultat attendu : « Success. No rows returned ».
-- =====================================================================

revoke insert, update, delete, truncate, references, trigger on vigie_signal from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on zones from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on vigie_annonce_signal from anon, authenticated;
grant select on zones to anon, authenticated;
grant select on vigie_signal to anon, authenticated;
grant select on vigie_annonce_signal to anon, authenticated;

create or replace function vigie_texte_erreur(p_texte text, p_max int)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select nullif(left(btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(coalesce(p_texte, ''), E'[\\x01-\\x1f\\x7f]+', ' ', 'g'),
            '\?[^\s"'')]*', '', 'g'),
          '[^\s@"''<>]+@[^\s@"''<>]+', '<courriel>', 'g'),
        '-?\d{1,3}\.\d{3,}', '<nombre>', 'g'),
      '\d{6,}', '<nombre>', 'g')
  ), p_max), '')
$$;

-- Nouvelles inscriptions aux alertes acceptées par heure, pour toute la
-- base (revue de sécurité du 11/11/2026) : des milliers de faux abonnements
-- ralentiraient l'envoi des vraies alertes. 300 par défaut, clé
-- abonnements_max_heure de vigie_config (5 à 5000). Changer de lieu ou de
-- rayon n'est jamais compté.
create or replace function vigie_abonnements_max_heure()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select least(greatest(coalesce(
    (select case when valeur ~ '^[0-9]{1,4}$' then valeur::int end
     from vigie_config where cle = 'abonnements_max_heure'),
    300), 5), 5000);
$$;

revoke execute on function vigie_abonnements_max_heure() from public, anon, authenticated;

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
  -- Clés d'un vrai abonnement du navigateur (base64 « url ») : p256dh =
  -- 65 octets (87 caractères), auth = 16 octets (22 caractères).
  if not vigie_endpoint_valide(p_endpoint)
     or p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{80,100}={0,2}$'
     or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{16,32}={0,2}$' then
    raise exception 'abonnement_invalide';
  end if;
  if p_lat is null or p_lng is null or not vigie_dans_nc(p_lat, p_lng) then
    raise exception 'position_hors_nc';
  end if;
  if p_rayon_km is null or p_rayon_km not in (3, 5, 10) then
    raise exception 'rayon_invalide';
  end if;
  if not exists (select 1 from push_abonnements where endpoint = p_endpoint)
     and (select count(*) from push_abonnements where created_at > now() - interval '1 hour')
         >= vigie_abonnements_max_heure() then
    raise exception 'abonnements_trop';
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

grant execute on function notif_abonner(text, text, text, double precision, double precision, integer, text) to anon, authenticated;
