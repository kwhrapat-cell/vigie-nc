-- =====================================================================
-- Essais de schema.sql : identité anonyme, votes, SOS, photos, droits,
-- type « feu », chiffres d'utilisation, annonces générales, chantiers,
-- témoignages et résumé automatique (IA), point route (mode conduite),
-- erreurs des téléphones, grade des vigies, vigies actives autour.
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
  code_annonce constant text := 'code-essai-annonces-00000000';
  v_annonce uuid;
  v_secret text;
  v_f uuid := gen_random_uuid();
  v_g uuid := gen_random_uuid();
  v_chantier uuid;
  code_chantier constant text := 'code-essai-chantiers-000000000';
  v_h uuid := gen_random_uuid();
  v_i uuid := gen_random_uuid();
  v_j uuid := gen_random_uuid();
  v_ia uuid;
  v_id_n int;
  v_version timestamptz;
  code_ia constant text := 'code-essai-resume-ia-000000000';
  v_k uuid := gen_random_uuid();
  v_l uuid := gen_random_uuid();
  sig_point_route constant text := 'ia_point_route_preparer(uuid[])';
  code_erreurs constant text := 'code-essai-erreurs-0000000000';
  v_m uuid := gen_random_uuid();
  v_n2 uuid := gen_random_uuid();
  v_o uuid := gen_random_uuid();
  v_p uuid := gen_random_uuid();
  v_q uuid := gen_random_uuid();
  v_r2 uuid := gen_random_uuid();
  v_s uuid := gen_random_uuid();
  v_t uuid := gen_random_uuid();
  v_u uuid := gen_random_uuid();
  v_cle_m text;
  v_grade uuid;
  v_vu timestamptz;
  -- Grade et vigies actives : loin des autres essais (≈ 20 km au nord-ouest)
  lat1 constant double precision := -22.0700;
  lng1 constant double precision := 166.3800;
begin
  delete from vigie_config where cle in ('notif_url', 'securite_url', 'ia_url');
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

  -- E25 : annonce générale — code obligatoire, contenu contrôlé
  begin
    perform moderation_annonce_publier('mauvais-code-de-test-0000', 'info', 'Essai sans code valide');
    raise exception 'E25 échec : annonce publiée sans code';
  exception when others then
    if sqlerrm not like '%code_invalide%' then raise exception 'E25 échec : %', sqlerrm; end if;
  end;
  perform vigie_ajouter_moderateur('Essai annonces', code_annonce);
  begin
    perform moderation_annonce_publier(code_annonce, 'alerte', 'Niveau qui n''existe pas');
    raise exception 'E25 échec : niveau inconnu accepté';
  exception when others then
    if sqlerrm not like '%annonce_niveau_invalide%' then raise exception 'E25 échec : %', sqlerrm; end if;
  end;
  begin
    perform moderation_annonce_publier(code_annonce, 'info', E'  court \n ');
    raise exception 'E25 échec : texte trop court accepté';
  exception when others then
    if sqlerrm not like '%annonce_trop_courte%' then raise exception 'E25 échec : %', sqlerrm; end if;
  end;
  begin
    perform moderation_annonce_publier(code_annonce, 'info', repeat('x', 281));
    raise exception 'E25 échec : texte trop long accepté';
  exception when others then
    if sqlerrm not like '%annonce_trop_longue%' then raise exception 'E25 échec : %', sqlerrm; end if;
  end;
  begin
    perform moderation_annonce_publier(code_annonce, 'info', 'Durée beaucoup trop longue', null, 100);
    raise exception 'E25 échec : durée de 100 h acceptée';
  exception when others then
    if sqlerrm not like '%annonce_duree_invalide%' then raise exception 'E25 échec : %', sqlerrm; end if;
  end;
  begin
    perform moderation_annonce_publier(code_annonce, 'info', 'Une simple info ne sonne pas', null, 6, true);
    raise exception 'E25 échec : notification acceptée pour une simple info';
  exception when others then
    if sqlerrm not like '%annonce_notif_info%' then raise exception 'E25 échec : %', sqlerrm; end if;
  end;

  -- E26 : publiée, elle est visible par tous ; retirée, elle disparaît
  select count(*) into v_n from vigie_annonce_signal;
  v_r := moderation_annonce_publier(code_annonce, 'vigilance',
           E'Essai : RT1 coupée\u0007 à Boulouparis,\n\n\n\nprudence.', ' Sécurité civile ', 6, false);
  v_annonce := (v_r->>'id')::uuid;
  if v_annonce is null then raise exception 'E26 échec : %', v_r; end if;
  if (select texte from annonces where id = v_annonce) <> E'Essai : RT1 coupée  à Boulouparis,\n\nprudence.'
     or (select source from annonces where id = v_annonce) <> 'Sécurité civile' then
    raise exception 'E26 échec : texte mal nettoyé « % »', (select texte from annonces where id = v_annonce);
  end if;
  if not (annonces_actives() @> jsonb_build_array(jsonb_build_object('id', v_annonce, 'niveau', 'vigilance'))) then
    raise exception 'E26 échec : annonce absente des annonces en cours';
  end if;
  if annonces_actives()::text like '%Essai annonces%' then
    raise exception 'E26 échec : le nom du modérateur est visible';
  end if;
  if (select count(*) from vigie_annonce_signal) <= v_n then
    raise exception 'E26 échec : pas de signal temps réel';
  end if;
  if not exists (select 1 from moderation_journal where action = 'annonce_publier' and detail = v_annonce::text
                   and moderateur = 'Essai annonces') then
    raise exception 'E26 échec : publication non notée dans le journal';
  end if;
  if not ((moderation_annonces(code_annonce)->'annonces')
          @> jsonb_build_array(jsonb_build_object('id', v_annonce, 'auteur', 'Essai annonces', 'actif', true))) then
    raise exception 'E26 échec : liste de modération %', moderation_annonces(code_annonce);
  end if;
  perform moderation_annonce_retirer(code_annonce, v_annonce);
  if annonces_actives() @> jsonb_build_array(jsonb_build_object('id', v_annonce)) then
    raise exception 'E26 échec : annonce retirée encore visible';
  end if;
  update annonces set expires_at = now() - interval '1 minute', retiree_at = null where id = v_annonce;
  if annonces_actives() @> jsonb_build_array(jsonb_build_object('id', v_annonce)) then
    raise exception 'E26 échec : annonce expirée encore visible';
  end if;

  -- E27 : notification à tous (une seule fois, 3 par 24 h), droits
  select valeur into v_secret from vigie_config where cle = 'notif_secret';
  if v_secret is null then
    v_secret := 'secret-essai-annonces-0000000000000000';
    insert into vigie_config (cle, valeur) values ('notif_secret', v_secret);
  end if;
  insert into push_abonnements (endpoint, p256dh, auth, lat, lng, rayon_km)
  values ('https://fcm.googleapis.com/fcm/send/essai-annonce-loin', 'cle', 'auth', -20.70, 164.90, 3);
  v_r := moderation_annonce_publier(code_annonce, 'urgence', 'Essai : cyclone, restez chez vous.', null, 12, true);
  v_annonce := (v_r->>'id')::uuid;
  begin
    perform annonce_destinataires('mauvais-secret', v_annonce);
    raise exception 'E27 échec : destinataires remis sans secret';
  exception when others then
    if sqlerrm not like '%secret_invalide%' then raise exception 'E27 échec : %', sqlerrm; end if;
  end;
  v_r := annonce_destinataires(v_secret, v_annonce);
  if not ((v_r->'abonnements') @> '[{"endpoint": "https://fcm.googleapis.com/fcm/send/essai-annonce-loin"}]'::jsonb) then
    raise exception 'E27 échec : un abonné loin (Koumac) ne reçoit pas l''annonce : %', v_r;
  end if;
  if jsonb_array_length(annonce_destinataires(v_secret, v_annonce)->'abonnements') <> 0 then
    raise exception 'E27 échec : annonce envoyée deux fois';
  end if;
  perform moderation_annonce_publier(code_annonce, 'urgence', 'Essai : deuxième notification.', null, 1, true);
  perform moderation_annonce_publier(code_annonce, 'vigilance', 'Essai : troisième notification.', null, 1, true);
  begin
    perform moderation_annonce_publier(code_annonce, 'urgence', 'Essai : quatrième notification.', null, 1, true);
    raise exception 'E27 échec : 4e notification en 24 h acceptée';
  exception when others then
    if sqlerrm not like '%trop_de_notifications%' then raise exception 'E27 échec : %', sqlerrm; end if;
  end;
  if has_table_privilege('anon', 'public.annonces', 'select')
     or has_table_privilege('authenticated', 'public.annonces', 'insert')
     or has_table_privilege('anon', 'public.vigie_annonce_signal', 'insert') then
    raise exception 'E27 échec : table des annonces accessible directement';
  end if;
  if not has_function_privilege('anon', 'annonces_actives()', 'execute')
     or not has_table_privilege('anon', 'public.vigie_annonce_signal', 'select') then
    raise exception 'E27 échec : les annonces ne sont pas lisibles par tous';
  end if;
  delete from annonces where texte like 'Essai%';
  delete from push_abonnements where endpoint like '%essai-annonce%';
  delete from moderateurs where nom = 'Essai annonces';

  -- E28 : chantier de longue durée (travaux seulement, fin à 6 mois au plus)
  perform set_config('request.jwt.claims', json_build_object('sub', v_f, 'role', 'authenticated')::text, true);
  v_r := creer_signalement_v3('travaux', lat0 - 0.03, lng0, null, 'Essai chantier', null, 'Essai');
  if v_r->>'resultat' is distinct from 'cree' then raise exception 'E28 échec : %', v_r; end if;
  v_chantier := (v_r->>'id')::uuid;
  perform vigie_ajouter_moderateur('Essai chantiers', code_chantier);
  begin
    perform moderation_chantier('mauvais-code-de-test-0000', v_chantier, 'Mairie', vigie_jour_local() + 30);
    raise exception 'E28 échec : chantier fixé sans code';
  exception when others then
    if sqlerrm not like '%code_invalide%' then raise exception 'E28 échec : %', sqlerrm; end if;
  end;
  begin
    perform moderation_chantier(code_chantier, v_id, 'Mairie', vigie_jour_local() + 30);
    raise exception 'E28 échec : date de fin acceptée pour une inondation';
  exception when others then
    if sqlerrm not like '%chantier_type_invalide%' then raise exception 'E28 échec : %', sqlerrm; end if;
  end;
  begin
    perform moderation_chantier(code_chantier, v_chantier, '   ', vigie_jour_local() + 30);
    raise exception 'E28 échec : chantier sans source accepté';
  exception when others then
    if sqlerrm not like '%source_manquante%' then raise exception 'E28 échec : %', sqlerrm; end if;
  end;
  begin
    perform moderation_chantier(code_chantier, v_chantier, 'Mairie', vigie_jour_local() - 1);
    raise exception 'E28 échec : date de fin passée acceptée';
  exception when others then
    if sqlerrm not like '%chantier_date_invalide%' then raise exception 'E28 échec : %', sqlerrm; end if;
  end;
  begin
    perform moderation_chantier(code_chantier, v_chantier, 'Mairie', vigie_jour_local() + vigie_chantier_jours_max() + 1);
    raise exception 'E28 échec : date de fin à plus de 6 mois acceptée';
  exception when others then
    if sqlerrm not like '%chantier_date_invalide%' then raise exception 'E28 échec : %', sqlerrm; end if;
  end;
  perform moderation_chantier(code_chantier, v_chantier, ' Province Sud ', vigie_jour_local() + 60);
  select expires_at into v_t from reports where id = v_chantier;
  if v_t is distinct from ((vigie_jour_local() + 61)::timestamp at time zone 'Pacific/Noumea') then
    raise exception 'E28 échec : fin du chantier à %', v_t;
  end if;
  if not exists (select 1 from signalements_proches_v3(lat0, lng0, 20000) s
                 where s.id = v_chantier and s.fin_annoncee = vigie_jour_local() + 60
                   and s.source_officielle = 'Province Sud') then
    raise exception 'E28 échec : chantier absent de la carte ou sans date de fin';
  end if;
  if not exists (select 1 from signalement_detail_v3(v_chantier) s where s.fin_annoncee = vigie_jour_local() + 60) then
    raise exception 'E28 échec : date de fin absente de la fiche';
  end if;
  if not (moderation_liste(code_chantier, 'travaux') @> jsonb_build_array(jsonb_build_object('id', v_chantier))) then
    raise exception 'E28 échec : chantier absent de l''onglet Travaux';
  end if;
  if not exists (select 1 from moderation_journal where report_id = v_chantier and action = 'chantier'
                 and detail like 'Province Sud · jusqu''au %') then
    raise exception 'E28 échec : chantier non noté dans le journal';
  end if;

  -- E29 : « C'est terminé » ne l'efface pas (il remonte à la modération) ;
  -- « Retirer vérifié » en refait un signalement ordinaire ; un chantier
  -- retiré peut être remis
  perform set_config('request.jwt.claims', json_build_object('sub', v_g, 'role', 'authenticated')::text, true);
  v_r := voter_signalement_v3(v_chantier, 'termine', lat0 - 0.03, lng0);
  if v_r->>'resultat' is distinct from 'verifie' or (v_r->>'resolu')::boolean then
    raise exception 'E29 échec : vote %', v_r;
  end if;
  if not (moderation_liste(code_chantier, 'signales') @> jsonb_build_array(jsonb_build_object('id', v_chantier))) then
    raise exception 'E29 échec : chantier contesté absent de l''onglet Signalés';
  end if;
  perform moderation_action(code_chantier, v_chantier, 'deverifier');
  select expires_at into v_t from reports where id = v_chantier;
  if v_t > now() + vigie_duree_vie('travaux') + interval '1 minute'
     or (select fin_annoncee from reports where id = v_chantier) is not null then
    raise exception 'E29 échec : chantier gardé après « Retirer vérifié » (fin %)', v_t;
  end if;
  perform moderation_action(code_chantier, v_chantier, 'retirer');
  perform moderation_chantier(code_chantier, v_chantier, 'Mairie', vigie_jour_local());
  if not exists (select 1 from signalements_proches_v3(lat0, lng0, 20000) s where s.id = v_chantier) then
    raise exception 'E29 échec : chantier remis absent de la carte';
  end if;
  if not has_function_privilege('anon', 'moderation_chantier(text, uuid, text, date)', 'execute') then
    raise exception 'E29 échec : la modération ne peut pas appeler moderation_chantier';
  end if;
  delete from moderateurs where nom = 'Essai chantiers';

  -- E30 : le texte d'un doublon n'est plus perdu (témoignages privés)
  perform set_config('request.jwt.claims', json_build_object('sub', v_h, 'role', 'authenticated')::text, true);
  v_r := creer_signalement_v3('inondation', lat0 - 0.06, lng0 + 0.06, null,
           'Radier de la Coulée sous l''eau', 'moyen', 'Essai IA');
  if v_r->>'resultat' is distinct from 'cree' then raise exception 'E30 échec : %', v_r; end if;
  v_ia := (v_r->>'id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', v_i, 'role', 'authenticated')::text, true);
  v_r := creer_signalement_v3('inondation', lat0 - 0.0605, lng0 + 0.0605, null,
           'Environ 30 cm d''eau, les petites voitures font demi-tour', 'eleve');
  if v_r->>'resultat' is distinct from 'fusionne' or (v_r->>'id')::uuid <> v_ia then
    raise exception 'E30 échec : %', v_r;
  end if;
  select count(*) into v_n from report_temoignages where report_id = v_ia;
  if v_n <> 2 then raise exception 'E30 échec : % témoignage(s) au lieu de 2', v_n; end if;
  if (select description from reports where id = v_ia) <> 'Radier de la Coulée sous l''eau' then
    raise exception 'E30 échec : la description publique a changé';
  end if;
  -- la même personne qui réécrit remplace son témoignage (pas de doublon)
  v_r := creer_signalement_v3('inondation', lat0 - 0.0605, lng0 + 0.0605, null, 'Ça monte encore, environ 40 cm');
  select count(*) into v_n from report_temoignages where report_id = v_ia;
  if v_n <> 2 or not exists (select 1 from report_temoignages where report_id = v_ia and texte like 'Ça monte encore%') then
    raise exception 'E30 échec : témoignage non remplacé (% ligne(s))', v_n;
  end if;
  if has_table_privilege('anon', 'public.report_temoignages', 'select')
     or has_table_privilege('authenticated', 'public.report_temoignages', 'select')
     or has_table_privilege('authenticated', 'public.vigie_ia_appels', 'select') then
    raise exception 'E30 échec : témoignages ou appels lisibles directement';
  end if;
  if has_function_privilege('anon', 'vigie_demander_resume(uuid)', 'execute')
     or has_function_privilege('authenticated', 'vigie_demander_resume(uuid)', 'execute') then
    raise exception 'E30 échec : demande de résumé appelable depuis l''appli';
  end if;

  -- E31 : le serveur lit les témoignages et écrit le résumé, avec le secret
  -- (dans ces essais tout se passe dans la même transaction, à la même
  -- heure : on vieillit les témoignages pour simuler des envois successifs)
  update report_temoignages set created_at = now() - interval '10 minutes' where report_id = v_ia;
  begin
    perform ia_temoignages('mauvais-secret', v_ia);
    raise exception 'E31 échec : témoignages lus sans secret';
  exception when others then
    if sqlerrm not like '%secret_invalide%' then raise exception 'E31 échec : %', sqlerrm; end if;
  end;
  v_r := ia_temoignages(v_secret, v_ia);
  if (v_r->>'nb')::int <> 2 or jsonb_array_length(v_r->'temoignages') <> 2
     or v_r->'report'->>'type' <> 'inondation' or v_r->'report'->>'lieu' <> 'Essai IA'
     or (v_r->'temoignages'->0->>'minutes')::int <> 10 then
    raise exception 'E31 échec : %', v_r;
  end if;
  if v_r::text like '%' || vigie_device_key('auth:' || v_i::text) || '%' then
    raise exception 'E31 échec : empreinte de session transmise au serveur';
  end if;
  v_version := (v_r->>'version')::timestamptz;
  begin
    perform ia_enregistrer_resume('mauvais-secret', v_ia, 'Résumé écrit sans le secret.', 2, v_version);
    raise exception 'E31 échec : résumé enregistré sans secret';
  exception when others then
    if sqlerrm not like '%secret_invalide%' then raise exception 'E31 échec : %', sqlerrm; end if;
  end;
  v_r := ia_enregistrer_resume(v_secret, v_ia, E'Radier de la Coulée inondé,\n  environ 40 cm d''eau.', 2, v_version);
  if not (v_r->>'enregistre')::boolean or (v_r->>'nouveaux')::boolean then raise exception 'E31 échec : %', v_r; end if;
  if not exists (select 1 from signalements_proches_v3(lat0, lng0, 20000) s
                 where s.id = v_ia and s.resume_ia = 'Radier de la Coulée inondé, environ 40 cm d''eau.'
                   and s.resume_ia_nb = 2) then
    raise exception 'E31 échec : résumé absent de la carte (« % »)', (select resume_ia from reports where id = v_ia);
  end if;
  if not exists (select 1 from signalement_detail_v3(v_ia) s where s.resume_ia_nb = 2) then
    raise exception 'E31 échec : résumé absent de la fiche';
  end if;
  -- un résumé en retard (version plus ancienne) n'écrase pas le plus récent
  v_r := ia_enregistrer_resume(v_secret, v_ia, 'Ancien résumé arrivé en retard.', 2, v_version - interval '1 minute');
  if (v_r->>'enregistre')::boolean or (select resume_ia from reports where id = v_ia) like 'Ancien%' then
    raise exception 'E31 échec : résumé plus ancien enregistré';
  end if;
  -- un 3e témoignage arrive pendant le passage du serveur : « nouveaux »
  perform set_config('request.jwt.claims', json_build_object('sub', v_j, 'role', 'authenticated')::text, true);
  v_r := creer_signalement_v3('inondation', lat0 - 0.06, lng0 + 0.06, null, 'Pompiers sur place, route fermée');
  if v_r->>'resultat' is distinct from 'fusionne' then raise exception 'E31 échec : %', v_r; end if;
  v_r := ia_enregistrer_resume(v_secret, v_ia, 'Résumé écrit avant le 3e témoignage.', 2, v_version);
  if not (v_r->>'nouveaux')::boolean then raise exception 'E31 échec : nouveau témoignage non signalé %', v_r; end if;
  v_r := ia_temoignages(v_secret, v_ia);
  if (v_r->>'nb')::int <> 3 then raise exception 'E31 échec : %', v_r; end if;
  v_version := (v_r->>'version')::timestamptz;
  v_r := ia_enregistrer_resume(v_secret, v_ia, 'Route fermée au radier de la Coulée, environ 40 cm d''eau, pompiers sur place.',
                               3, v_version);
  if not (v_r->>'enregistre')::boolean or (select resume_ia_nb from reports where id = v_ia) <> 3 then
    raise exception 'E31 échec : 3e témoignage non résumé %', v_r;
  end if;

  -- E32 : « rien d'utile » (résumé vide ou trop court) garde l'ancien résumé
  v_r := ia_enregistrer_resume(v_secret, v_ia, '  rien ', 3, v_version + interval '1 second');
  if (v_r->>'enregistre')::boolean or (select resume_ia from reports where id = v_ia) not like 'Route fermée%' then
    raise exception 'E32 échec : %', v_r;
  end if;
  if (select resume_ia_version from reports where id = v_ia) <> v_version + interval '1 second' then
    raise exception 'E32 échec : version non avancée (l''IA serait rappelée pour rien)';
  end if;
  if (select resume_ia_demande_at from reports where id = v_ia) is not null then
    raise exception 'E32 échec : demande toujours marquée en cours';
  end if;

  -- E33 : modération (résumé visible, masqué avec le texte), essai de l'IA
  -- avec un code, limite par heure, interrupteur, purge des témoignages
  perform vigie_ajouter_moderateur('Essai IA', code_ia);
  if not (moderation_liste(code_ia, 'recents') @> jsonb_build_array(jsonb_build_object('id', v_ia, 'resume_ia_nb', 3))) then
    raise exception 'E33 échec : résumé absent de la modération';
  end if;
  perform moderation_action(code_ia, v_ia, 'masquer');
  if (select resume_ia from reports where id = v_ia) is not null
     or exists (select 1 from signalements_proches_v3(lat0, lng0, 20000) s where s.id = v_ia and s.resume_ia is not null) then
    raise exception 'E33 échec : résumé encore visible après masquage';
  end if;
  perform moderation_action(code_ia, v_ia, 'retablir');  -- redemande un résumé (rien ne part : pas d'adresse)
  begin
    perform moderation_ia_essai('mauvais-code-de-test-0000');
    raise exception 'E33 échec : essai de l''IA sans code';
  exception when others then
    if sqlerrm not like '%code_invalide%' then raise exception 'E33 échec : %', sqlerrm; end if;
  end;
  delete from vigie_config where cle = 'ia_resume';
  insert into vigie_config (cle, valeur) values ('ia_max_heure', '1000')
  on conflict (cle) do update set valeur = excluded.valeur;
  select count(*) into v_n from vigie_ia_appels where origine = 'essai';
  perform moderation_ia_essai(code_ia);
  if (select count(*) from vigie_ia_appels where origine = 'essai') <> v_n + 1 then
    raise exception 'E33 échec : essai non compté';
  end if;
  update vigie_config set valeur = '1' where cle = 'ia_max_heure';
  begin
    perform moderation_ia_essai(code_ia);
    raise exception 'E33 échec : limite par heure non appliquée';
  exception when others then
    if sqlerrm not like '%ia_quota%' then raise exception 'E33 échec : %', sqlerrm; end if;
  end;
  insert into vigie_config (cle, valeur) values ('ia_resume', 'non');
  begin
    perform moderation_ia_essai(code_ia);
    raise exception 'E33 échec : IA coupée mais essai accepté';
  exception when others then
    if sqlerrm not like '%ia_coupee%' then raise exception 'E33 échec : %', sqlerrm; end if;
  end;
  delete from vigie_config where cle in ('ia_resume', 'ia_max_heure');
  if not has_function_privilege('anon', 'ia_temoignages(text, uuid)', 'execute')
     or not has_function_privilege('anon', 'moderation_ia_essai(text)', 'execute') then
    raise exception 'E33 échec : le serveur ou la modération ne peut pas appeler l''IA';
  end if;
  update report_temoignages set created_at = now() - interval '8 days'
   where report_id = v_ia and texte like 'Pompiers%';
  perform vigie_purger_donnees_appareil();
  if exists (select 1 from report_temoignages where report_id = v_ia and texte like 'Pompiers%') then
    raise exception 'E33 échec : témoignage de plus de 7 jours non effacé';
  end if;
  delete from moderateurs where nom = 'Essai IA';

  -- E34 : point route — session obligatoire, seulement de vrais
  -- signalements en cours (contenu public), 1 par minute, limite par heure
  perform set_config('request.jwt.claims', '', true);
  begin
    perform ia_point_route_preparer(array[v_ia]);
    raise exception 'E34 échec : point route sans session';
  exception when others then
    if sqlerrm not like '%connexion_requise%' then raise exception 'E34 échec : %', sqlerrm; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_k, 'role', 'authenticated')::text, true);
  begin
    perform ia_point_route_preparer(array_fill(v_ia, array[11]));
    raise exception 'E34 échec : 11 événements acceptés';
  exception when others then
    if sqlerrm not like '%point_route_invalide%' then raise exception 'E34 échec : %', sqlerrm; end if;
  end;
  -- v_ia : inondation en cours ; v_id : terminée (E10) ; un identifiant inconnu
  v_r := ia_point_route_preparer(array[v_ia, v_id, gen_random_uuid()]);
  if jsonb_array_length(v_r) <> 1 or v_r->0->>'id' <> v_ia::text or v_r->0->>'type' <> 'inondation' then
    raise exception 'E34 échec : %', v_r;
  end if;
  if v_r::text like '%' || vigie_device_key('auth:' || v_h::text) || '%' then
    raise exception 'E34 échec : empreinte d''un auteur transmise';
  end if;
  begin
    perform ia_point_route_preparer(array[v_ia]);
    raise exception 'E34 échec : 2e point route dans la minute';
  exception when others then
    if sqlerrm not like '%point_route_trop_tot%' then raise exception 'E34 échec : %', sqlerrm; end if;
  end;
  insert into vigie_config (cle, valeur) values ('ia_point_route_max_heure', '1')
  on conflict (cle) do update set valeur = excluded.valeur;
  perform set_config('request.jwt.claims', json_build_object('sub', v_l, 'role', 'authenticated')::text, true);
  begin
    perform ia_point_route_preparer(array[v_ia]);
    raise exception 'E34 échec : limite par heure non appliquée';
  exception when others then
    if sqlerrm not like '%ia_quota%' then raise exception 'E34 échec : %', sqlerrm; end if;
  end;
  delete from vigie_config where cle = 'ia_point_route_max_heure';
  insert into vigie_config (cle, valeur) values ('ia_resume', 'non');
  begin
    perform ia_point_route_preparer(array[v_ia]);
    raise exception 'E34 échec : IA coupée mais point route accepté';
  exception when others then
    if sqlerrm not like '%ia_coupee%' then raise exception 'E34 échec : %', sqlerrm; end if;
  end;
  delete from vigie_config where cle = 'ia_resume';
  if has_function_privilege('anon', sig_point_route, 'execute')
     or not has_function_privilege('authenticated', sig_point_route, 'execute') then
    raise exception 'E34 échec : droits du point route';
  end if;
  -- la trace avec l'empreinte de session part après 24 heures
  update vigie_ia_appels set created_at = now() - interval '25 hours'
   where origine = 'point_route' and device_key = vigie_device_key('auth:' || v_k::text);
  perform vigie_purger_donnees_appareil();
  if exists (select 1 from vigie_ia_appels where device_key = vigie_device_key('auth:' || v_k::text)) then
    raise exception 'E34 échec : trace du point route gardée plus de 24 heures';
  end if;

  -- E35 : erreurs des téléphones — envoi sans session, nettoyage (ni
  -- coordonnées, ni numéro, ni e-mail, ni fin de lien), regroupement,
  -- plafond par jour, lecture réservée aux modérateurs, purge.
  perform set_config('request.jwt.claims', '', true);
  delete from vigie_erreurs;
  perform vigie_erreur_signaler(
    'TypeError: x est vide à -22.27123, 166.58123 tel 82688100 moi@exemple.nc https://vigie-nc.com/?signalement=abc',
    '/signaler (ecran)', 'Chrome 140 · Android');
  perform vigie_erreur_signaler(
    'TypeError: x est vide à -22.27123, 166.58123 tel 82688100 moi@exemple.nc https://vigie-nc.com/?signalement=abc',
    '/signaler (ecran)', 'Chrome 140 · Android');
  select count(*), max(nombre) into v_n, v_id_n from vigie_erreurs;
  if v_n <> 1 or v_id_n <> 2 then
    raise exception 'E35 échec : regroupement (% lignes, nombre %)', v_n, v_id_n;
  end if;
  if exists (select 1 from vigie_erreurs
             where message ~ '22\.27|166\.58|82688100|moi@|signalement=') then
    raise exception 'E35 échec : texte non nettoyé : %', (select message from vigie_erreurs limit 1);
  end if;
  perform vigie_erreur_signaler('   ', '/', null);
  if (select count(*) from vigie_erreurs) <> 1 then
    raise exception 'E35 échec : message vide enregistré';
  end if;
  for v_n in 1..305 loop
    perform vigie_erreur_signaler('Erreur numéro ' || v_n::text || ' différente', '/', null);
  end loop;
  if (select count(*) from vigie_erreurs) <> 300 then
    raise exception 'E35 échec : plafond de 300 erreurs par jour (%)', (select count(*) from vigie_erreurs);
  end if;
  perform vigie_ajouter_moderateur('Essai erreurs', code_erreurs);
  v_r := moderation_erreurs(code_erreurs);
  if jsonb_typeof(v_r) <> 'array' or jsonb_array_length(v_r) <> 50 then
    raise exception 'E35 échec : lecture des erreurs (%)', jsonb_array_length(v_r);
  end if;
  begin
    perform moderation_erreurs('mauvais-code-erreurs-000000');
    raise exception 'E35 échec : lecture sans bon code';
  exception when others then
    if sqlerrm not like '%code_invalide%' then raise exception 'E35 échec : %', sqlerrm; end if;
  end;
  if has_table_privilege('anon', 'vigie_erreurs', 'select')
     or has_table_privilege('authenticated', 'vigie_erreurs', 'select')
     or not has_function_privilege('anon', 'vigie_erreur_signaler(text, text, text)', 'execute')
     or has_function_privilege('anon', 'vigie_texte_erreur(text, int)', 'execute') then
    raise exception 'E35 échec : droits des erreurs';
  end if;
  update vigie_erreurs set jour = vigie_jour_local() - 15;
  perform vigie_purger_donnees_appareil();
  if exists (select 1 from vigie_erreurs) then
    raise exception 'E35 échec : erreurs gardées plus de 14 jours';
  end if;

  -- E36 : grade calculé par la base — signalements, relais, votes, jours,
  -- confirmations reçues ; rang qui ne redescend jamais ; grade montré
  -- seulement s'il est partagé (anonymat) ; droits ; purge.
  delete from vigie_contributions;
  insert into vigie_config (cle, valeur) values ('grade_seuil', '3')
  on conflict (cle) do update set valeur = excluded.valeur;
  v_cle_m := vigie_device_key('auth:' || v_m::text);

  perform set_config('request.jwt.claims', json_build_object('sub', v_m, 'role', 'authenticated')::text, true);
  v_r := creer_signalement_v3('chaussee_degradee', lat1, lng1, null, null, null, 'Essai grade');
  if v_r->>'resultat' is distinct from 'cree' then raise exception 'E36 échec : création %', v_r; end if;
  v_grade := (v_r->>'id')::uuid;
  if (select nb_signalements from vigie_contributions where cle = v_cle_m) is distinct from 1
     or (select rang from vigie_contributions where cle = v_cle_m) is distinct from 1::smallint then
    raise exception 'E36 échec : signalement non compté (%)',
      (select row_to_json(c) from vigie_contributions c where cle = v_cle_m);
  end if;

  -- un témoin confirme : vote compté pour lui, « confirmé » pour l'auteur ;
  -- un 2e témoin : l'auteur n'a pas un 2e « signalement confirmé »
  perform set_config('request.jwt.claims', json_build_object('sub', v_n2, 'role', 'authenticated')::text, true);
  v_r := voter_signalement_v3(v_grade, 'present', lat1, lng1);
  v_r := voter_signalement_v3(v_grade, 'present', lat1, lng1); -- même vote : pas recompté
  if v_r->>'resultat' is distinct from 'deja_vote' then raise exception 'E36 échec : %', v_r; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_u, 'role', 'authenticated')::text, true);
  v_r := voter_signalement_v3(v_grade, 'present', lat1 + 0.001, lng1);
  if (select nb_votes from vigie_contributions where cle = vigie_device_key('auth:' || v_n2::text)) is distinct from 1 then
    raise exception 'E36 échec : votes du témoin (%)',
      (select nb_votes from vigie_contributions where cle = vigie_device_key('auth:' || v_n2::text));
  end if;
  if (select nb_confirmes from vigie_contributions where cle = v_cle_m) is distinct from 1 then
    raise exception 'E36 échec : confirmation reçue comptée % fois',
      (select nb_confirmes from vigie_contributions where cle = v_cle_m);
  end if;

  -- l'auteur clôt son signalement : vote + route rouverte
  perform set_config('request.jwt.claims', json_build_object('sub', v_m, 'role', 'authenticated')::text, true);
  v_r := voter_signalement_v3(v_grade, 'termine');
  if v_r->>'resultat' is distinct from 'resolu'
     or (select nb_routes_rouvertes from vigie_contributions where cle = v_cle_m) is distinct from 1 then
    raise exception 'E36 échec : route rouverte (%)', v_r;
  end if;

  -- relais et jours d'utilisation
  perform set_config('request.jwt.claims', json_build_object('sub', v_o, 'role', 'authenticated')::text, true);
  v_r := relayer_signalement_v3('inondation', lat1 + 0.02, lng1, 'facebook', 'Essai relais');
  if v_r->>'resultat' is distinct from 'relaye'
     or (select nb_signalements::text || '/' || nb_alertes_meteo::text from vigie_contributions
         where cle = vigie_device_key('auth:' || v_o::text)) is distinct from '1/1' then
    raise exception 'E36 échec : relais non compté (%)', v_r;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_p, 'role', 'authenticated')::text, true);
  perform vigie_presence(null);
  update vigie_activite set derniere_vue = now() - interval '2 minutes'
   where cle = vigie_device_key('auth:' || v_p::text);
  perform vigie_presence(null); -- même jour : pas un 2e jour
  if (select nb_jours from vigie_contributions where cle = vigie_device_key('auth:' || v_p::text)) is distinct from 1 then
    raise exception 'E36 échec : jours d''utilisation';
  end if;

  -- tous les badges : Légende ; le rang ne redescend jamais
  update vigie_contributions
     set nb_signalements = 10, nb_confirmes = 10, nb_votes = 50, nb_routes_rouvertes = 1,
         nb_alertes_meteo = 1, nb_jours = 30
   where cle = v_cle_m;
  perform vigie_contribuer(v_cle_m);
  if (select rang from vigie_contributions where cle = v_cle_m) is distinct from 4::smallint then
    raise exception 'E36 échec : tous les badges ne donnent pas Légende';
  end if;
  update vigie_contributions
     set nb_signalements = 0, nb_confirmes = 0, nb_votes = 0, nb_routes_rouvertes = 0,
         nb_alertes_meteo = 0, nb_jours = 0
   where cle = v_cle_m;
  perform vigie_contribuer(v_cle_m);
  if (select rang from vigie_contributions where cle = v_cle_m) is distinct from 4::smallint then
    raise exception 'E36 échec : le rang a redescendu';
  end if;

  -- anonymat : une Légende seule ne se voit pas ; à 3 Légendes, si
  if (select auteur_grade from signalement_detail_v3(v_grade)) is distinct from 0::smallint then
    raise exception 'E36 échec : grade rare montré (%)', (select auteur_grade from signalement_detail_v3(v_grade));
  end if;
  insert into vigie_contributions (cle, rang) values ('essai-legende-1', 4), ('essai-legende-2', 4);
  if (select auteur_grade from signalement_detail_v3(v_grade)) is distinct from 4::smallint then
    raise exception 'E36 échec : grade partagé non montré (%)', (select auteur_grade from signalement_detail_v3(v_grade));
  end if;
  delete from vigie_contributions where cle = 'essai-legende-2';
  -- 2 Légendes, mais 3 vigies au moins Sentinelle : affichée « Sentinelle »
  insert into vigie_contributions (cle, rang) values ('essai-sentinelle', 2);
  if (select auteur_grade from signalement_detail_v3(v_grade)) is distinct from 2::smallint then
    raise exception 'E36 échec : plafond du grade (%)', (select auteur_grade from signalement_detail_v3(v_grade));
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_m, 'role', 'authenticated')::text, true);
  v_r := mon_grade();
  if (v_r->>'rang')::int <> 4 or (v_r->>'grade_public')::int <> 2 or (v_r->>'seuil')::int <> 3 then
    raise exception 'E36 échec : mon_grade %', v_r;
  end if;
  insert into vigie_config (cle, valeur) values ('grade_seuil', '1')
  on conflict (cle) do update set valeur = excluded.valeur;
  if vigie_seuil_grade() <> 3 then
    raise exception 'E36 échec : seuil sous 3 accepté';
  end if;
  delete from vigie_config where cle = 'grade_seuil';

  if has_table_privilege('anon', 'public.vigie_contributions', 'select')
     or has_table_privilege('authenticated', 'public.vigie_contributions', 'select')
     or has_function_privilege('authenticated', 'vigie_contribuer(text, integer, integer, integer, integer, integer, integer)', 'execute')
     or has_function_privilege('anon', 'mon_grade()', 'execute')
     or not has_function_privilege('authenticated', 'mon_grade()', 'execute') then
    raise exception 'E36 échec : droits du grade';
  end if;
  update vigie_contributions set dernier_jour = vigie_jour_local() - 91 where cle = v_cle_m;
  perform vigie_purger_donnees_appareil();
  if exists (select 1 from vigie_contributions where cle = v_cle_m) then
    raise exception 'E36 échec : compteurs gardés plus de 90 jours sans visite';
  end if;

  -- E37 : vigies actives autour — session obligatoire, zone arrondie
  -- (~5 km), total seulement à partir de 3, « quelques » en dessous,
  -- 10 minutes d'activité, effacé après 15 minutes, droits.
  delete from vigie_presence_zone;
  perform set_config('request.jwt.claims', '', true);
  begin
    perform vigies_autour(lat1, lng1);
    raise exception 'E37 échec : sans session';
  exception when others then
    if sqlerrm not like '%connexion_requise%' then raise exception 'E37 échec : %', sqlerrm; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_q, 'role', 'authenticated')::text, true);
  v_r := vigies_autour(lat1 + 0.003, lng1 + 0.004);
  if v_r->>'nombre' is not null or (v_r->>'quelques')::boolean then
    raise exception 'E37 échec : personne autour (%)', v_r;
  end if;
  if exists (
    select 1 from vigie_presence_zone
    where cle = vigie_device_key('auth:' || v_q::text)
      and (abs(st_y(geom::geometry) - (-22.05)) > 0.000001 or abs(st_x(geom::geometry) - 166.40) > 0.000001)
  ) then
    raise exception 'E37 échec : position non arrondie (%)',
      (select st_astext(geom) from vigie_presence_zone where cle = vigie_device_key('auth:' || v_q::text));
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_r2, 'role', 'authenticated')::text, true);
  v_r := vigies_autour(lat1, lng1);
  if v_r->>'nombre' is not null or not (v_r->>'quelques')::boolean then
    raise exception 'E37 échec : 1 autre vigie (%)', v_r;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_s, 'role', 'authenticated')::text, true);
  v_r := vigies_autour(lat1 - 0.02, lng1);
  perform set_config('request.jwt.claims', json_build_object('sub', v_u, 'role', 'authenticated')::text, true);
  v_r := vigies_autour(lat1 + 0.45, lng1); -- à 50 km : pas compté autour
  if v_r->>'nombre' is not null or (v_r->>'quelques')::boolean then
    raise exception 'E37 échec : vigie lointaine (%)', v_r;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_t, 'role', 'authenticated')::text, true);
  v_r := vigies_autour(lat1, lng1 + 0.03);
  if (v_r->>'nombre')::int is distinct from 3 or (v_r->>'quelques')::boolean then
    raise exception 'E37 échec : 3 vigies autour (%)', v_r;
  end if;
  -- appelé tout de suite après : pas de nouvelle écriture
  select vu_at into v_vu from vigie_presence_zone where cle = vigie_device_key('auth:' || v_t::text);
  update vigie_presence_zone set vu_at = now() - interval '30 seconds' where cle = vigie_device_key('auth:' || v_t::text);
  v_r := vigies_autour(lat1, lng1 + 0.03);
  if (select vu_at from vigie_presence_zone where cle = vigie_device_key('auth:' || v_t::text)) > now() - interval '20 seconds' then
    raise exception 'E37 échec : écriture plus d''une fois par minute';
  end if;
  -- plus actives depuis 11 minutes : plus comptées ; après 15 minutes, effacées
  update vigie_presence_zone set vu_at = now() - interval '11 minutes'
   where cle in (vigie_device_key('auth:' || v_q::text), vigie_device_key('auth:' || v_r2::text));
  v_r := vigies_autour(lat1, lng1 + 0.03);
  if v_r->>'nombre' is not null or not (v_r->>'quelques')::boolean then
    raise exception 'E37 échec : vigies inactives comptées (%)', v_r;
  end if;
  update vigie_presence_zone set vu_at = now() - interval '16 minutes'
   where cle = vigie_device_key('auth:' || v_q::text);
  perform vigie_purger_donnees_appareil();
  if exists (select 1 from vigie_presence_zone where cle = vigie_device_key('auth:' || v_q::text)) then
    raise exception 'E37 échec : zone gardée plus de 15 minutes';
  end if;
  if has_table_privilege('anon', 'public.vigie_presence_zone', 'select')
     or has_table_privilege('authenticated', 'public.vigie_presence_zone', 'select')
     or has_function_privilege('anon', 'vigies_autour(double precision, double precision)', 'execute')
     or not has_function_privilege('authenticated', 'vigies_autour(double precision, double precision)', 'execute') then
    raise exception 'E37 échec : droits des vigies actives';
  end if;
  begin
    perform vigies_autour(-17.5, 150.0);
    raise exception 'E37 échec : position hors NC acceptée';
  exception when others then
    if sqlerrm not like '%position_hors_nc%' then raise exception 'E37 échec : %', sqlerrm; end if;
  end;

  raise notice 'ESSAIS OK (37)';
end
$essais$;
