-- =====================================================================
-- Essais de schema.sql : identité anonyme, votes, SOS, photos, droits,
-- type « feu », chiffres d'utilisation.
-- À lancer APRÈS schema.sql. Chaque essai qui échoue arrête tout avec un
-- message « Ex échec : … ». Rien n'est envoyé : l'adresse d'envoi des
-- alertes est retirée pendant l'essai.
-- Sur le vrai projet : seulement à l'intérieur d'une transaction annulée
-- à la fin (les données d'essai ne doivent pas rester).
-- =====================================================================
do $essais$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_c uuid := gen_random_uuid();
  v_d uuid := gen_random_uuid();
  v_r jsonb;
  v_id uuid;
  v_id2 uuid;
  v_id3 uuid;
  v_n int;
  v_t timestamptz;
  -- Mont-Dore ; 0,009° de latitude ≈ 1 km, 0,09° ≈ 10 km
  lat0 constant double precision := -22.2700;
  lng0 constant double precision := 166.5800;
  sig_creer constant text := 'creer_signalement_v3(report_type, double precision, double precision, text, text, text, text)';
  code_essai constant text := 'code-essai-statistiques-0000';
  v_stats jsonb;
  v_e uuid := gen_random_uuid();
begin
  delete from vigie_config where cle in ('notif_url', 'securite_url');
  insert into vigie_config (cle, valeur) values ('photo_host', 'essai.supabase.co')
  on conflict (cle) do update set valeur = excluded.valeur;
  delete from vigie_config where cle = 'photos_jours';

  -- E1 : sans session, écrire est refusé
  perform set_config('request.jwt.claims', '', true);
  begin
    perform creer_signalement_v3('inondation', lat0, lng0);
    raise exception 'E1 échec : écriture acceptée sans session';
  exception when others then
    if sqlerrm not like '%connexion_requise%' then raise exception 'E1 échec : %', sqlerrm; end if;
  end;

  -- E2 : la session A crée une inondation
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  v_r := creer_signalement_v3('inondation', lat0, lng0, null, 'Radier inondé', 'eleve', 'Essai');
  if v_r->>'resultat' is distinct from 'cree' then raise exception 'E2 échec : %', v_r; end if;
  v_id := (v_r->>'id')::uuid;

  -- E3 : un 2e signalement de A dans la minute est refusé
  begin
    perform creer_signalement_v3('travaux', lat0 + 0.05, lng0);
    raise exception 'E3 échec : limite par minute non appliquée';
  exception when others then
    if sqlerrm not like '%rate_limit%' then raise exception 'E3 échec : %', sqlerrm; end if;
  end;

  -- E4 : le SOS n'est pas un signalement
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  begin
    perform creer_signalement_v3('sos', lat0, lng0);
    raise exception 'E4 échec : SOS publié';
  exception when others then
    if sqlerrm not like '%type_invalide%' then raise exception 'E4 échec : %', sqlerrm; end if;
  end;

  -- E5 : une photo venant d'un autre site est refusée
  begin
    perform creer_signalement_v3('travaux', lat0, lng0 + 0.05,
      'https://pirate.example/storage/v1/object/public/report-photos/x.jpg');
    raise exception 'E5 échec : photo d''un autre site acceptée';
  exception when others then
    if sqlerrm not like '%photo_invalide%' then raise exception 'E5 échec : %', sqlerrm; end if;
  end;

  -- E6 : une photo de notre projet est acceptée (B, travaux)
  v_r := creer_signalement_v3('travaux', lat0 + 0.02, lng0 + 0.02,
    'https://essai.supabase.co/storage/v1/object/public/report-photos/abc-123.jpg');
  if v_r->>'resultat' is distinct from 'cree' then raise exception 'E6 échec : %', v_r; end if;
  v_id2 := (v_r->>'id')::uuid;

  -- E7 : un seul « terminé » ne retire pas un danger
  v_r := voter_signalement_v3(v_id, 'termine', lat0 + 0.009, lng0);
  if v_r->>'resultat' is distinct from 'conteste' or (v_r->>'resolu')::boolean then
    raise exception 'E7 échec : %', v_r;
  end if;

  -- E8 : voter sans position est refusé
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  begin
    perform voter_signalement_v3(v_id, 'termine');
    raise exception 'E8 échec : vote sans position accepté';
  exception when others then
    if sqlerrm not like '%position_requise%' then raise exception 'E8 échec : %', sqlerrm; end if;
  end;

  -- E9 : voter à 10 km est refusé
  begin
    perform voter_signalement_v3(v_id, 'termine', lat0 + 0.09, lng0);
    raise exception 'E9 échec : vote à 10 km accepté';
  exception when others then
    if sqlerrm not like '%trop_loin%' then raise exception 'E9 échec : %', sqlerrm; end if;
  end;

  -- E10 : un 2e « terminé » sur place retire le danger
  v_r := voter_signalement_v3(v_id, 'termine', lat0, lng0);
  if v_r->>'resultat' is distinct from 'resolu' then raise exception 'E10 échec : %', v_r; end if;

  -- E11 : un signalement vérifié ne se retire que par la modération
  perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);
  v_r := creer_signalement_v3('route_coupee', lat0 - 0.03, lng0);
  v_id3 := (v_r->>'id')::uuid;
  update reports set source_officielle = 'Mairie (essai)' where id = v_id3;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  v_r := voter_signalement_v3(v_id3, 'termine', lat0 - 0.03, lng0);
  if v_r->>'resultat' is distinct from 'verifie' then raise exception 'E11 échec (B) : %', v_r; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  v_r := voter_signalement_v3(v_id3, 'termine', lat0 - 0.03, lng0);
  if v_r->>'resultat' is distinct from 'verifie' then raise exception 'E11 échec (C) : %', v_r; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);
  v_r := voter_signalement_v3(v_id3, 'termine');
  if v_r->>'resultat' is distinct from 'verifie' or (v_r->>'resolu')::boolean then
    raise exception 'E11 échec (auteur) : %', v_r;
  end if;

  -- E12 : sans session, la carte se lit, sans « mes signalements »
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_n from signalements_proches_v3(lat0, lng0, 20000) s where s.est_auteur;
  if v_n <> 0 then raise exception 'E12 échec : est_auteur sans session'; end if;
  select count(*) into v_n from signalements_proches_v3(lat0, lng0, 20000) s where s.id in (v_id2, v_id3);
  if v_n <> 2 then raise exception 'E12 échec : % signalement(s) actif(s) sur 2', v_n; end if;
  select count(*) into v_n from signalements_proches_v3(lat0, lng0, 20000) s where s.id = v_id;
  if v_n <> 0 then raise exception 'E12 échec : signalement retiré encore affiché'; end if;

  -- E13 : avec sa session, D reconnaît son signalement
  perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);
  select count(*) into v_n from signalements_proches_v3(lat0, lng0, 20000) s where s.est_auteur and s.id = v_id3;
  if v_n <> 1 then raise exception 'E13 échec : est_auteur absent'; end if;

  -- E14 : droits
  if has_table_privilege('anon', 'public.reports', 'select')
     or has_table_privilege('authenticated', 'public.reports', 'select') then
    raise exception 'E14 échec : table reports lisible directement';
  end if;
  if has_function_privilege('anon', sig_creer, 'execute') then
    raise exception 'E14 échec : anon peut écrire';
  end if;
  if not has_function_privilege('authenticated', sig_creer, 'execute') then
    raise exception 'E14 échec : une session ne peut pas écrire';
  end if;
  if not has_function_privilege('anon', 'signalements_proches_v3(double precision, double precision, integer)', 'execute') then
    raise exception 'E14 échec : la carte ne se lit pas sans session';
  end if;
  if to_regprocedure('creer_signalement(report_type, double precision, double precision, text, text, text, text, text)') is not null
     or to_regprocedure('voter_signalement(uuid, text, text)') is not null then
    raise exception 'E14 échec : anciennes fonctions (p_device_id) encore présentes';
  end if;
  if not has_table_privilege('anon', 'public.vigie_signal', 'select') then
    raise exception 'E14 échec : vigie_signal illisible (temps réel)';
  end if;
  if has_function_privilege('anon', 'photos_a_supprimer(integer)', 'execute') then
    raise exception 'E14 échec : photos_a_supprimer appelable sans clé serveur';
  end if;

  -- E15 : le temps réel a reçu des signaux (sans contenu)
  select count(*) into v_n from vigie_signal where created_at >= now();
  if v_n = 0 then raise exception 'E15 échec : aucun signal temps réel'; end if;

  -- E16 : un mauvais code de modération répond tout de suite
  v_t := clock_timestamp();
  begin
    perform moderation_verifier('mauvais-code-de-test-0000');
    raise exception 'E16 échec : code accepté';
  exception when others then
    if sqlerrm not like '%code_invalide%' then raise exception 'E16 échec : %', sqlerrm; end if;
  end;
  if clock_timestamp() - v_t > interval '200 milliseconds' then
    raise exception 'E16 échec : attente sur un mauvais code';
  end if;

  -- E17 : durée de conservation des photos
  if vigie_photos_jours() <> 7 then raise exception 'E17 échec : % jours par défaut', vigie_photos_jours(); end if;
  insert into vigie_config (cle, valeur) values ('photos_jours', '30');
  if vigie_photos_jours() <> 30 then raise exception 'E17 échec : réglage 30 ignoré'; end if;
  update vigie_config set valeur = '999' where cle = 'photos_jours';
  if vigie_photos_jours() <> 90 then raise exception 'E17 échec : plafond de 90 jours'; end if;
  update vigie_config set valeur = 'abc' where cle = 'photos_jours';
  if vigie_photos_jours() <> 7 then raise exception 'E17 échec : valeur invalide'; end if;
  delete from vigie_config where cle = 'photos_jours';

  -- E18 : une photo effacée perd son lien
  perform photos_supprimees(array['abc-123.jpg']);
  if (select photo_url from reports where id = v_id2) is not null then
    raise exception 'E18 échec : lien de photo effacée toujours là';
  end if;

  -- E19 : la purge de nuit tourne
  perform vigie_purger_donnees_appareil();

  -- E20 : santé
  if (vigie_sante()->>'ok')::boolean is not true then raise exception 'E20 échec : santé'; end if;

  -- E21 : le type « feu » est un danger, avec sa durée et son rayon.
  -- (Dans un essai à blanc sur la vraie base, schema.sql et ces essais
  -- tournent dans la même transaction : une valeur d'enum toute neuve n'y
  -- est pas encore utilisable. L'essai est alors sauté.)
  begin
    if not vigie_est_danger('feu') then raise exception 'E21 échec : le feu n''est pas un danger'; end if;
    if vigie_duree_vie('feu') <> interval '4 hours' then raise exception 'E21 échec : durée %', vigie_duree_vie('feu'); end if;
    if vigie_rayon_fusion_m('feu') <> 1500 then raise exception 'E21 échec : rayon %', vigie_rayon_fusion_m('feu'); end if;
    perform set_config('request.jwt.claims', json_build_object('sub', v_e, 'role', 'authenticated')::text, true);
    v_r := creer_signalement_v3('feu', lat0 + 0.04, lng0 - 0.04, null, null, null, 'Essai feu');
    if v_r->>'resultat' is distinct from 'cree' then raise exception 'E21 échec : %', v_r; end if;
  exception when others then
    if sqlerrm like '%unsafe use of new value%' then
      raise notice 'E21 sauté : valeur « feu » ajoutée dans cette même transaction';
    else
      raise;
    end if;
  end;

  -- E22 : comptage des appareils actifs
  perform set_config('request.jwt.claims', '', true);
  perform vigie_presence('affiche');  -- sans session : rien n'est compté
  if exists (select 1 from vigie_sources_jour where jour = vigie_jour_local() and source = 'affiche') then
    raise exception 'E22 échec : comptage sans session';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  perform vigie_presence('affiche');
  perform vigie_presence('affiche');  -- 2e appel dans la minute : ignoré
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  perform vigie_presence('Pas Valide !');  -- provenance invalide : « direct »
  select coalesce(sum(nouveaux), 0) into v_n from vigie_sources_jour
   where jour = vigie_jour_local() and source = 'affiche';
  if v_n <> 1 then raise exception 'E22 échec : % nouveau(x) « affiche » au lieu de 1', v_n; end if;
  if exists (select 1 from vigie_sources_jour where source <> 'affiche' and source <> 'direct'
               and jour = vigie_jour_local()) then
    raise exception 'E22 échec : provenance invalide enregistrée';
  end if;
  select count(*) into v_n from vigie_activite where jour = vigie_jour_local();
  if v_n < 2 then raise exception 'E22 échec : % appareil(s) actif(s)', v_n; end if;

  -- E23 : les chiffres ne se lisent qu'avec un code de modérateur
  begin
    perform moderation_statistiques('mauvais-code-de-test-0000');
    raise exception 'E23 échec : chiffres lus sans code';
  exception when others then
    if sqlerrm not like '%code_invalide%' then raise exception 'E23 échec : %', sqlerrm; end if;
  end;
  perform vigie_ajouter_moderateur('Essai chiffres', code_essai);
  v_stats := moderation_statistiques(code_essai);
  if (v_stats->>'maintenant')::int < 2 or (v_stats->>'aujourdhui')::int < 2 then
    raise exception 'E23 échec : %', v_stats;
  end if;
  if jsonb_array_length(v_stats->'courbe') <> 30 then
    raise exception 'E23 échec : courbe de % jours', jsonb_array_length(v_stats->'courbe');
  end if;
  if not (v_stats->'sources' @> '[{"source": "affiche"}]'::jsonb) then
    raise exception 'E23 échec : provenance absente %', v_stats->'sources';
  end if;
  delete from moderateurs where nom = 'Essai chiffres';

  -- E24 : droits et purge des chiffres d'utilisation
  if has_table_privilege('anon', 'public.vigie_activite', 'select')
     or has_table_privilege('authenticated', 'public.vigie_activite', 'select')
     or has_table_privilege('authenticated', 'public.vigie_stats_jour', 'select') then
    raise exception 'E24 échec : chiffres lisibles directement';
  end if;
  if has_function_privilege('anon', 'vigie_presence(text)', 'execute') then
    raise exception 'E24 échec : comptage sans session possible';
  end if;
  if not has_function_privilege('authenticated', 'vigie_presence(text)', 'execute') then
    raise exception 'E24 échec : une session ne peut pas être comptée';
  end if;
  insert into vigie_activite (cle, jour, derniere_vue)
  values ('essai-ancien', vigie_jour_local() - 40, now() - interval '40 days');
  perform vigie_purger_donnees_appareil();
  if exists (select 1 from vigie_activite where cle = 'essai-ancien') then
    raise exception 'E24 échec : détail de plus de 35 jours non effacé';
  end if;
  if coalesce((select actifs from vigie_stats_jour where jour = vigie_jour_local() - 40), 0) < 1 then
    raise exception 'E24 échec : total du jour non gardé';
  end if;

  raise notice 'ESSAIS OK (24)';
end
$essais$;
