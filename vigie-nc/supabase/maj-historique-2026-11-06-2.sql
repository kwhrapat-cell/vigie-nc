-- =====================================================================
-- Vigie NC — MISE À JOUR « HISTORIQUE ET CHIFFRES » (06/11/2026), PARTIE 2/2
-- À lancer dans une requête neuve de l'éditeur SQL Supabase, la partie 1
-- puis la partie 2 (chacune ré-exécutable sans risque).
--   - onglet « Historique » de la modération : tout ce qui a été publié,
--     et « Effacer (essai) » pour supprimer définitivement un essai
--   - erreurs du navigateur (Firefox iPhone, portefeuille crypto, scripts
--     ajoutés) ignorées, et les 4 déjà reçues effacées
-- Même contenu que schema.sql, qui reste le script de référence.
-- Résultat attendu : « Success. No rows returned ».
-- =====================================================================

-- RPC : liste à modérer
--   'signales' : signalés ou masqués, 30 derniers jours, et chantiers en
--                cours que des usagers disent terminés
--   'recents'  : tous les signalements des dernières 48 h (sauf SOS)
--   'travaux'  : travaux en cours ou terminés depuis moins de 7 jours
--                (pour fixer ou changer la date de fin d'un chantier)
--   'historique' : tout ce qui a été publié depuis le début (sauf SOS),
--                du plus récent au plus ancien, 300 au plus (pour effacer
--                les essais, décision de Patrice du 06/11/2026)
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
    order by tri desc
    limit case when p_filtre = 'historique' then 300 else 100 end
  ) t;

  return v_res;
end;
$$;

-- RPC : agir sur un signalement
--   masquer / retablir : photo et texte
--   ignorer            : « c'est OK », efface les signalements de contenu
--   retirer            : enlève le signalement de la carte
--   verifier / deverifier : niveau « Vérifié » (p_valeur = la source)
--   effacer            : supprime DÉFINITIVEMENT un essai (onglet
--                        « Historique ») : carte, historique, mémoire de
--                        zone, chiffres. Votes, témoignages, alertes
--                        envoyées partent avec lui (on delete cascade) ;
--                        la photo est effacée par la purge des 7 jours.
--                        Le journal garde le type, le lieu et la date.
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

create or replace function vigie_erreur_signaler(
  p_message text,
  p_ecran text default null,
  p_navigateur text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_jour date := vigie_jour_local();
  v_message text := vigie_texte_erreur(p_message, 300);
  v_ecran text := vigie_texte_erreur(p_ecran, 80);
  v_nav text := vigie_texte_erreur(p_navigateur, 60);
  v_empreinte text;
begin
  if v_message is null then
    return;
  end if;
  -- Erreurs du navigateur, pas de l'appli (Firefox sur iPhone, portefeuille
  -- crypto, scripts ajoutés par l'utilisateur) : vues le 05/11/2026 sur
  -- iPhone. Aussi filtrées sur le téléphone (IGNOREES de
  -- lib/erreurs-texte.ts) : garder les deux listes alignées.
  if v_message ~* '(__firefox__|window\.ethereum|user-script:)' then
    return;
  end if;
  v_empreinte := md5(v_message || '|' || coalesce(v_ecran, ''));
  update vigie_erreurs
     set nombre = least(nombre + 1, 1000000), derniere = now()
   where jour = v_jour and empreinte = v_empreinte;
  if found then
    return;
  end if;
  -- Trop d'erreurs différentes aujourd'hui : les suivantes sont ignorées
  -- (la table ne peut pas grossir sans limite).
  if (select count(*) from vigie_erreurs where jour = v_jour) >= 300 then
    return;
  end if;
  insert into vigie_erreurs (jour, empreinte, message, ecran, navigateur)
  values (v_jour, v_empreinte, v_message, v_ecran, v_nav)
  on conflict (jour, empreinte) do update
    set nombre = least(vigie_erreurs.nombre + 1, 1000000), derniere = now();
end;
$$;

-- Les erreurs déjà reçues qui venaient du navigateur, pas de l'appli
delete from vigie_erreurs
 where message ~* '(__firefox__|window\.ethereum|user-script:)';
