# CLAUDE.md — Vigie NC

Guide pour Claude Code. Porteur du projet : Patrice (seul, technicien
étanchéité, pas développeur, travaille depuis son téléphone). Il teste sur
les aperçus Vercel. Écris-lui en français, simplement, sans jargon.

## Le projet

Carte gratuite et anonyme de l'état des routes en Nouvelle-Calédonie :
signalements citoyens (accident, inondation, route coupée, danger, travaux,
météo, trafic dense, chaussée dégradée, autre), fiabilisés par les votes
(« Toujours là » / « C'est terminé »), zone 1-5 km autour de l'utilisateur,
mémoire du territoire. Pilote prévu avec la famille au Mont-Dore, puis les
mairies de Païta, du Mont-Dore et de Yaté.

## Règles produit (décidées par Patrice — ne pas changer sans lui demander)

- **Pas de signalement d'incivilités ni de véhicules volés.** Uniquement des
  infos d'infrastructure vérifiables (routes, météo).
- **Anonyme** : pas de compte, jamais de nom d'auteur affiché.
- **Thème sombre** des maquettes (lagon / terre rouge).
- Zone par défaut en kilomètres (1, 3 ou 5 km), pas en centaines de mètres :
  le besoin vient de la route (« les prochains km sont-ils dégagés ? »).
- Le SOS ne prévient pas les secours à la place de la personne et **ne
  publie rien** (décision de Patrice du 18/10/2026) : il prépare un SMS avec
  la position pour les contacts d'urgence, permet de l'envoyer à qui on
  veut et propose d'appeler 15/17/18. Jamais de position de personne en
  danger sur la carte publique.
- **Facebook : uniquement ce qui est légal.** Pas de récupération
  automatique (pas d'API pour les groupes depuis 2024, collecte automatisée
  interdite par Meta). Les infos vues sur Facebook passent par un humain
  qui les **relaie** (`/relayer`) : le texte collé reste sur le téléphone,
  seul le fait est publié (type, lieu, heure, provenance), jamais de nom ni
  de photo, étiquette « Relayé » jusqu'à confirmation sur place.

## Stack et structure

Le code est dans `vigie-nc/` (Root Directory Vercel).

```
vigie-nc/
  app/            écrans (/, /signaler, /relayer, /sos, /alertes, /historique, /profil, /contacts)
                  + /api/notifier (appelé par la base : envoie les alertes) et /api/notif-test
                  + /api/alerte-securite (appelé par la base : liste des modérateurs modifiée)
                  + pages légales (/conditions, /confidentialite, /mentions-legales)
                  + /affiche (l'affiche à envoyer par lien ; images dans public/affiche/)
                  + /moderation (écran des modérateurs, code personnel ; lien discret en bas du Profil)
  components/     CarteLive (accueil), LiveMap, HomeSheet, ReportDetail,
                  PositionPicker, BottomNav, ui.tsx (Logo, TypeTile, boutons…),
                  VigilanceMeteo (vignette officielle meteo.nc, sans clé),
                  WelcomeNotice (avertissement à la 1re ouverture), LegalPage,
                  ShareApp (partager l'appli : WhatsApp ou menu du téléphone),
                  InstallApp (installer l'appli : bouton Android, étapes iPhone),
                  ShareAffiche (partager le lien de l'affiche),
                  AlertSettings (écran Alertes : activer les notifications),
                  ServiceWorkerRegister (enregistre public/sw.js)
  lib/
    types.ts         types de signalement, couleurs, icônes, durées, rayons
    reports-api.ts   SEUL point d'accès aux données (RPC Supabase ou démo)
    demo-store.ts    mode démo en mémoire (mêmes règles que le SQL)
    reliability.ts   4 niveaux : Signalement / À confirmer / Confirmé / Vérifié
    face-blur.ts     photo : réduction, floutage visages, suppression EXIF
    place.ts         nom du lieu via Nominatim
    map-styles.ts    fonds de carte (OpenStreetMap / Esri, sans clé — pas CARTO,
                     qui exige une clé depuis 2026) + emprise NC
    cluster.ts       regroupement des signalements en pastilles chiffrées
    relay-parser.ts  lecture d'un message collé → type + lieu (sur le téléphone)
    legal.ts         éditeur (Tramea Solutions), contact, hébergeurs, date des textes légaux
    site.ts          adresse publique (SITE_URL), texte de partage de l'appli
    push.ts          notifications côté téléphone (service worker, abonnement)
    push-server.ts   envoi des notifications (web-push, clés VAPID), texte des alertes
  app/opengraph-image.png  aperçu du lien (WhatsApp, Facebook…), app/icon.png +
                       app/apple-icon.png : icônes (écran d'accueil, onglet)
  app/manifest.ts  rend l'appli installable (display standalone, nécessaire aux
                   notifications sur iPhone ; là, l'appli de l'écran d'accueil a
                   ses propres données, à part de Safari) ; icônes dans public/icons/
  public/sw.js     service worker : uniquement les notifications, pas de cache
  supabase/schema.sql  schéma complet, ré-exécutable
```

## Conventions

- Textes de l'interface et commentaires **en français**, tutoiement.
- Mobile d'abord (largeur 380 px), cibles tactiles ≥ 44 px.
- Couleurs : jetons Tailwind (`void`, `panel`, `panel-2`, `line`, `primary`,
  `lagoon`, `danger`, `warn`, `info`, `ok`, `mist`, `mist-dim`). Couleurs
  par type/catégorie dans `lib/types.ts`.
- Toute lecture/écriture de données passe par `lib/reports-api.ts`, qui gère
  aussi le mode démo. Ne jamais appeler `supabase.from(...).insert` depuis
  un écran.
- `lib/types.ts` (`REPORT_TYPE_LIFETIME_MIN`, `REPORT_TYPE_MERGE_RADIUS_M`)
  doit rester aligné sur `vigie_duree_vie()` / `vigie_rayon_fusion_m()` du
  SQL.

## Base de données

- Écritures **uniquement via les RPC** `security definer` ; les tables
  `report_authors` et `report_votes` ne sont jamais lisibles depuis l'appli.
- **Identité = session anonyme Supabase** (`lib/session.ts`,
  `signInAnonymously`, Turnstile si `NEXT_PUBLIC_TURNSTILE_SITE_KEY`). Les
  RPC d'écriture `_v3` (`creer_signalement_v3`, `voter_signalement_v3`,
  `relayer_signalement_v3`, `signaler_contenu_v3`) utilisent `auth.uid()`
  via `vigie_cle_session()` et ne sont accordées qu'au rôle `authenticated`.
  **Ne jamais réintroduire un identifiant choisi par le téléphone** (l'ancien
  `p_device_id` permettait à un script de voter sans limite). `device-id.ts`
  ne sert plus qu'au mode démo.
- L'identité n'est stockée qu'en empreinte (`vigie_device_key`).
- **La table `reports` n'est pas lisible directement** (ni `select` pour
  `anon`/`authenticated`, ni diffusion temps réel) : lectures par
  `signalements_proches_v3`, `signalement_detail_v3`, `statistiques_zone`.
  Le temps réel passe par `vigie_signal` (heure + case de ~11 km, aucun
  contenu, déclencheur `trg_vigie_signal`) ; `useLiveReports` ne recharge
  que si la case touche la zone affichée.
- Votes (`vigie_appliquer_vote`) : témoins à moins de 5 km
  (`vigie_distance_temoin_m()` = `MAX_WITNESS_DISTANCE_M`) ; un danger
  (`vigie_est_danger()` = `ALERT_TYPES`) ne se clôt qu'avec 2 « terminé » et
  la majorité ; un signalement vérifié ne se clôt que par la modération.
- Photos effacées après `vigie_photos_jours()` jours (7 ; clé
  `photos_jours` de `vigie_config` pour allonger en épisode cyclonique,
  90 max) par la fonction Supabase `supabase/functions/purge-photos`
  (clé serveur fournie par Supabase, appelée chaque nuit par pg_cron avec
  le secret `notif_secret`). La base interdit d'effacer un fichier en SQL.
  `supabase/functions` est exclu de `tsconfig.json` (code Deno).
- Anti-abus : 1 signalement/minute et 20/jour par session
  (`vigie_limite_signalements`), 5 photos/heure (`vigie_photos_recentes`,
  règle de dépôt du dossier `report-photos`).
- Modération : `signaler_contenu` (2 téléphones → photo + texte masqués,
  seuil `vigie_seuil_masquage()` = `FLAG_HIDE_THRESHOLD` de `lib/types.ts`),
  `vigie_masquer_contenu` / `vigie_retablir_contenu` à la main.
- Écran /moderation : RPC `moderation_verifier` / `moderation_liste` /
  `moderation_action`, chacune vérifie le code du modérateur
  (`vigie_moderateur`, empreinte dans la table privée `moderateurs`) et
  note l'action dans `moderation_journal`. Les codes ne vont jamais dans le
  dépôt : `select vigie_ajouter_moderateur('Nom', '<code>')` dans l'éditeur SQL.
- Alarme de sécurité : tout changement de la table `moderateurs` (ajout,
  code, accès retiré/rétabli, renommage, suppression, vidage ; pas les
  connexions) est noté dans `moderation_journal` et envoyé par `pg_net` à
  `/api/alerte-securite` (déclencheurs `trg_vigie_alarme_moderateurs*`). Les
  téléphones s'inscrivent depuis /moderation (`moderation_alertes_activer`,
  table privée `moderation_alertes`, indépendante de l'état du modérateur).
  Le repère `vigie-nc:alarme-securite` (localStorage) empêche l'écran
  Alertes de couper l'abonnement partagé.
- Notifications : RPC `notif_abonner` / `notif_mon_abonnement` /
  `notif_desabonner` (table privée `push_abonnements`, lieu arrondi à
  ~1 km, rayon 3/5/10 km). Le déclencheur `trg_vigie_notification` appelle
  `/api/notifier` par `pg_net` quand un danger devient confirmé (2e
  personne ou source officielle) ; adresse et secret dans la table privée
  `vigie_config` (le secret = `NOTIF_SECRET` de Vercel, jamais dans le
  dépôt). `notif_destinataires` note les envois (`push_envois`, 7 jours,
  5 alertes/heure max). Clés VAPID : variables Vercel
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY`.
- Les pages `/confidentialite` et `/conditions` décrivent ce que fait
  vraiment le code (données envoyées, durées, purge `pg_cron`) : les mettre
  à jour (et `miseAJour` dans `lib/legal.ts`) si ça change.
- `schema.sql` doit rester **ré-exécutable d'un bloc** dans l'éditeur SQL
  Supabase (une seule transaction) : `if not exists`, `create or replace`,
  `drop ... if exists` avant de changer un type de retour, et toute
  **nouvelle valeur d'enum** ajoutée par `alter type ... add value if not
  exists` puis comparée en texte (`p_type::text = '...'`) dans les fonctions.
- Pour tester le SQL sans Supabase : Postgres local + petit shim PostGIS
  (st_makepoint, st_setsrid, st_distance haversine, st_dwithin) et rôles
  `anon`/`authenticated` ; lancer le schéma avec `psql -1` (comme l'éditeur).

## Façon de travailler

- Une fonctionnalité = une branche + une pull request ; Patrice regarde
  l'aperçu Vercel sur son téléphone avant de fusionner.
- Ne pas fusionner dans `main` sans son accord.
- Après un changement visible, lui dire en une ou deux phrases quoi tester
  sur l'aperçu.
