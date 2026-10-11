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
- Le SOS ne prévient pas les secours à la place de la personne : il met la
  position sur la carte, prépare un SMS et propose d'appeler 15/17/18.
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
  components/     CarteLive (accueil), LiveMap, HomeSheet, ReportDetail,
                  PositionPicker, BottomNav, ui.tsx (Logo, TypeTile, boutons…)
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
- L'identifiant d'appareil n'est stocké qu'en empreinte (`vigie_device_key`).
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
