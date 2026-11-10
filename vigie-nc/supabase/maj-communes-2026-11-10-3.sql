-- =====================================================================
-- Vigie NC — MISE À JOUR « COMMUNES PARTENAIRES » (10/11/2026), PARTIE 3/3
-- À lancer dans une requête neuve de l'éditeur SQL Supabase : la partie 1,
-- puis la 2, puis la 3 (chacune ré-exécutable sans risque).
--   - annonces d'une commune : vues et notifiées seulement dans son périmètre
-- Même contenu que schema.sql, qui reste le script de référence.
-- Résultat attendu : « Success. No rows returned ».
-- =====================================================================

-- Annonce d'une commune (agent avec un périmètre) : vue et notifiée
-- seulement dans ce périmètre. Nul = toute la Calédonie.
alter table annonces add column if not exists perimetre_id text
  references perimetres(id) on update cascade;

-- RPC : annonces en cours (tout le monde, sans session). Les plus graves
-- d'abord, puis les plus récentes. Jamais qui les a publiées.
-- « zone » : nulle = toute la Calédonie ; sinon le périmètre de la
-- commune (centre + rayon), et le téléphone ne la montre que s'il est
-- dedans. 5 annonces pour toute la Calédonie au plus, 30 des communes.
create or replace function annonces_actives()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id,
      'niveau', a.niveau,
      'texte', a.texte,
      'source', a.source,
      'created_at', a.created_at,
      'expires_at', a.expires_at,
      'zone', vigie_perimetre_json(a.perimetre_id)
    ) order by case a.niveau when 'urgence' then 0 when 'vigilance' then 1 else 2 end, a.created_at desc),
    '[]'::jsonb)
  from (
    (select * from annonces
     where retiree_at is null and expires_at > now() and perimetre_id is null
     order by created_at desc
     limit 5)
    union all
    (select * from annonces
     where retiree_at is null and expires_at > now() and perimetre_id is not null
     order by created_at desc
     limit 30)
  ) a;
$$;

-- RPC (modération) : publier une annonce pour toute la Calédonie, ou pour
-- le périmètre de l'agent d'une commune (choisi par la base, jamais par
-- l'appli)
create or replace function moderation_annonce_publier(
  p_code text,
  p_niveau text,
  p_texte text,
  p_source text default null,
  p_duree_h int default 6,
  p_notifier boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_nom text;
  v_texte text := vigie_texte_annonce(p_texte);
  v_source text := left(nullif(btrim(regexp_replace(coalesce(p_source, ''), E'[\\x01-\\x1f\\x7f]+', ' ', 'g')), ''), 60);
  v_notifier boolean := coalesce(p_notifier, false);
  v_id uuid;
  v_url text;
  v_secret text;
  v_perimetre text;
begin
  v_nom := vigie_moderateur(p_code);
  v_perimetre := vigie_perimetre_moderateur(v_nom);

  if p_niveau is null or p_niveau not in ('info', 'vigilance', 'urgence') then
    raise exception 'annonce_niveau_invalide';
  end if;
  if char_length(v_texte) < 10 then
    raise exception 'annonce_trop_courte';
  end if;
  if char_length(v_texte) > 280 then
    raise exception 'annonce_trop_longue';
  end if;
  if p_duree_h is null or p_duree_h < 1 or p_duree_h > 72 then
    raise exception 'annonce_duree_invalide';
  end if;
  if v_notifier and p_niveau = 'info' then
    raise exception 'annonce_notif_info';
  end if;

  -- Garde-fous comptés par périmètre (toute la Calédonie = nul)
  if (select count(*) from annonces
      where created_at > now() - interval '24 hours'
        and perimetre_id is not distinct from v_perimetre) >= 10 then
    raise exception 'trop_d_annonces';
  end if;
  if v_notifier
     and (select count(*) from annonces
          where notifier and created_at > now() - interval '24 hours'
            and perimetre_id is not distinct from v_perimetre) >= 3 then
    raise exception 'trop_de_notifications';
  end if;

  insert into annonces (niveau, texte, source, expires_at, notifier, perimetre_id)
  values (p_niveau, v_texte, v_source, now() + make_interval(hours => p_duree_h), v_notifier, v_perimetre)
  returning id into v_id;

  insert into moderation_journal (moderateur, report_id, action, detail)
  values (v_nom, null, 'annonce_publier', v_id::text);

  -- Notification à tous les abonnés : le serveur d'envoi est prévenu. Sans
  -- configuration ou sans pg_net, l'annonce est quand même publiée.
  if v_notifier then
    select valeur into v_url from vigie_config where cle = 'annonce_url';
    if v_url is null then
      select regexp_replace(valeur, '/api/notifier/?$', '/api/annonce')
      into v_url from vigie_config where cle = 'notif_url';
      if v_url !~ '/api/annonce$' then
        v_url := null;
      end if;
    end if;
    select valeur into v_secret from vigie_config where cle = 'notif_secret';
    if v_url is not null and v_secret is not null then
      begin
        perform net.http_post(
          url := v_url,
          body := jsonb_build_object('annonce_id', v_id),
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-vigie-secret', v_secret),
          timeout_milliseconds := 60000
        );
        update annonces set notifie_at = now() where id = v_id;
      exception when others then
        -- pg_net absent ou en panne : annonce visible, sans notification.
        null;
      end;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'notifiee', exists (select 1 from annonces where id = v_id and notifie_at is not null),
    'zone', vigie_perimetre_json(v_perimetre)
  );
end;
$$;

-- RPC (modération) : retirer une annonce avant l'heure prévue
create or replace function moderation_annonce_retirer(p_code text, p_annonce_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_nom text;
  v_perimetre text;
begin
  v_nom := vigie_moderateur(p_code);
  v_perimetre := vigie_perimetre_moderateur(v_nom);
  -- Agent d'une commune : seulement les annonces de son périmètre.
  update annonces
  set retiree_at = coalesce(retiree_at, now())
  where id = p_annonce_id
    and (v_perimetre is null or perimetre_id = v_perimetre);
  if not found then
    raise exception 'annonce_introuvable';
  end if;
  insert into moderation_journal (moderateur, report_id, action, detail)
  values (v_nom, null, 'annonce_retirer', p_annonce_id::text);
  return jsonb_build_object('ok', true);
end;
$$;

-- RPC (modération) : annonces des 7 derniers jours (et en cours), qui les
-- a publiées, et nombre de téléphones abonnés aux alertes. Agent d'une
-- commune : seulement son périmètre, et les abonnés qui le touchent.
create or replace function moderation_annonces(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_liste jsonb;
  v_perimetre text;
begin
  v_perimetre := vigie_perimetre_moderateur(vigie_moderateur(p_code));

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id,
      'niveau', a.niveau,
      'texte', a.texte,
      'source', a.source,
      'created_at', a.created_at,
      'expires_at', a.expires_at,
      'retiree_at', a.retiree_at,
      'actif', (a.retiree_at is null and a.expires_at > now()),
      'notifier', a.notifier,
      'envoyee', (a.envoyee_at is not null),
      'auteur', (select j.moderateur from moderation_journal j
                 where j.action = 'annonce_publier' and j.detail = a.id::text
                 order by j.created_at limit 1),
      'zone', vigie_perimetre_json(a.perimetre_id)
    ) order by a.created_at desc), '[]'::jsonb)
  into v_liste
  from (
    select * from annonces
    where (created_at > now() - interval '7 days'
           or (retiree_at is null and expires_at > now()))
      and (v_perimetre is null or perimetre_id = v_perimetre)
    order by created_at desc
    limit 50
  ) a;

  return jsonb_build_object(
    'annonces', v_liste,
    'perimetre', vigie_perimetre_json(v_perimetre),
    'abonnes', (select count(*) from push_abonnements p
                where vigie_zone_touche_perimetre(v_perimetre, p.lat, p.lng, p.rayon_km * 1000)),
    'notifiees_24h', (select count(*) from annonces
                      where notifier and created_at > now() - interval '24 hours'
                        and perimetre_id is not distinct from v_perimetre),
    'publiees_24h', (select count(*) from annonces
                     where created_at > now() - interval '24 hours'
                       and perimetre_id is not distinct from v_perimetre)
  );
end;
$$;

-- RPC (serveur d'envoi) : l'annonce et TOUS les téléphones abonnés aux
-- alertes, quel que soit leur lieu (annonce d'une commune : ceux dont la
-- zone d'alerte touche son périmètre). Remis une seule fois par annonce.
create or replace function annonce_destinataires(p_secret text, p_annonce_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_a annonces%rowtype;
  v_premiere boolean;
begin
  if not vigie_secret_notif_ok(p_secret) then
    raise exception 'secret_invalide';
  end if;

  update annonces
  set envoyee_at = now()
  where id = p_annonce_id and notifier and envoyee_at is null
  returning true into v_premiere;

  select * into v_a from annonces where id = p_annonce_id;
  if not found then
    raise exception 'annonce_introuvable';
  end if;

  return jsonb_build_object(
    'annonce', jsonb_build_object(
      'id', v_a.id,
      'niveau', v_a.niveau,
      'texte', v_a.texte,
      'source', v_a.source,
      'expires_at', v_a.expires_at,
      'actif', (v_a.retiree_at is null and v_a.expires_at > now()),
      'zone', vigie_perimetre_json(v_a.perimetre_id)
    ),
    'abonnements', case when coalesce(v_premiere, false) then coalesce(
      (select jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth))
       from push_abonnements p
       where vigie_zone_touche_perimetre(v_a.perimetre_id, p.lat, p.lng, p.rayon_km * 1000)),
      '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;
