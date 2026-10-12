# Vigie NC

Voir, signaler, agir ensemble. Carte gratuite et anonyme de l'état des
routes en Nouvelle-Calédonie (accidents, inondations, routes coupées,
travaux, météo…), avec une mémoire de ce qui revient trop souvent.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Leaflet — fonds de carte OpenStreetMap (Plan, Nuit) et Esri (Satellite),
  sans clé ; tout est dans `lib/map-styles.ts`. Les fonds CARTO exigent
  désormais une clé payante (« KEY REQUIRED ») : ne pas les réutiliser.
- Supabase — Postgres + PostGIS, Storage (photos), Realtime (carte en direct)
- MediaPipe (dans le navigateur) — floutage des visages sur les photos
- Nominatim (OpenStreetMap) — nom du lieu (« RT1, Dumbéa ») à l'étape Localisation

## Démarrage

```bash
npm install
cp .env.example .env.local   # puis remplir avec les clés Supabase
npm run dev
```

**Sans `.env.local`, l'appli tourne en mode démo** : badge « MODE DÉMO »,
signalements fictifs placés autour de ta position, mêmes règles que la vraie
base (doublons, votes, expiration), rien n'est enregistré.

## Écrans

| Route | Écran |
|---|---|
| `/` | Accueil : carte centrée sur toi (zone 1, 3 ou 5 km), compteurs Dangers / Perturbations / Infos météo, liste « À proximité », fiche d'un signalement |
| `/signaler` | Signalement en 3 étapes : type → localisation (repère déplaçable) → détails (photo, description, niveau de risque) → « Merci ! » |
| `/relayer` | Relayer une info vue sur Facebook, à la radio, par SMS : on colle le message, l'appli repère le type et le lieu sur le téléphone, seul le fait est publié (« Relayé » jusqu'à confirmation sur place) |
| `/sos` | SOS « Je suis en danger » : appui long 3 s, position sur la carte, SMS préparé pour les contacts, appel 15 / 17 / 18 |
| `/alertes` | Vigilance météo officielle (Météo-France NC), puis alertes en cours, ma zone ou toute la Calédonie |
| `/historique` | Mémoire du territoire : 12 derniers mois, évolution mensuelle, événements |
| `/profil` | Rayon par défaut, contacts d'urgence, niveaux de fiabilité, confidentialité |
| `/contacts` | Contacts d'urgence (gardés sur le téléphone uniquement) |

Un lien `/?signalement=<id>` ouvre directement la fiche (bouton « Partager »).

## Base de données (Supabase)

1. Créer un projet Supabase.
2. **SQL Editor → New query** : coller tout `supabase/schema.sql` → **Run**.
   Le script est ré-exécutable et migre une base existante (Sprint 1 compris).
3. **Project Settings → API** : copier l'URL et la clé `anon` dans `.env.local`
   (et dans les variables d'environnement Vercel).

Ce que fait le schéma :

- **Tout passe par des fonctions** (`creer_signalement`, `voter_signalement`,
  `signalements_proches`, `signalement_detail`, `statistiques_zone`) : le
  téléphone ne peut pas écrire directement dans les tables, ni choisir
  l'expiration ou le nombre de confirmations.
- **Doublons regroupés** : un même type signalé à proximité (300 m pour un
  accident, 1 km pour une inondation…) devient une confirmation de
  l'événement existant au lieu d'un nouveau point.
- **Votes** « Toujours là » / « C'est terminé » : une confirmation relance la
  durée de vie ; si les « terminé » l'emportent, le signalement est retiré.
  L'auteur peut clore le sien, pas le confirmer.
- **Niveaux de fiabilité** : Signalement (1 personne), À confirmer (2-3),
  Confirmé (4+), Vérifié (source officielle).
- **Anonymat** : l'identifiant du téléphone n'est stocké que sous forme
  d'empreinte, dans des tables illisibles depuis l'appli.
- **Anti-spam** : 1 signalement par minute et par téléphone (le SOS n'est
  jamais bloqué), positions hors Nouvelle-Calédonie refusées.

### Marquer un signalement « Vérifié »

Quand une source officielle confirme (mairie, pompiers…), dans **Table
Editor → reports**, remplir la colonne `source_officielle` (ex. `Mairie du
Mont-Dore`). La fiche affiche alors « Vérifié · Source officielle ».

## Mise en ligne (Vercel)

Projet Vercel `vigie-nc`, relié au dépôt GitHub : chaque branche envoyée
donne un aperçu, `main` donne la version principale. Le code de l'appli est
dans le dossier `vigie-nc/` du dépôt (**Root Directory = `vigie-nc`**).
Variables d'environnement (Settings → Environment Variables) :
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — sans elles,
l'aperçu tourne en mode démo.

## Facebook et autres sources

Pas de récupération automatique depuis Facebook : l'accès aux groupes a été
fermé aux applications en avril 2024 et Meta interdit la collecte
automatisée. Les infos sont **relayées par des personnes** (`/relayer`) :
le texte collé ne quitte pas le téléphone, seuls le type, le lieu, l'heure
et la provenance sont publiés. Un relais ne compte jamais comme une
confirmation ; un doublon proche n'est pas recréé (`relayer_signalement`).

**Vigilance météo** : l'écran Alertes affiche la vignette officielle de
Météo-France Nouvelle-Calédonie (`components/VigilanceMeteo.tsx`), fournie
par meteo.nc pour être intégrée ailleurs : sans clé, mise à jour par
Météo-France toutes les 5 minutes. La météo de l'appli du téléphone n'est
pas accessible à un site web, et ce n'est pas la vigilance officielle.
Plus tard, l'API Vigilance (compte créé sur portail-api.meteofrance.fr)
permettra d'aller plus loin : zones colorées sur la carte, notifications.

## Vie privée

- Pas de compte, pas de nom : signalements anonymes.
- Photos : visages pixellisés, réduction à 1600 px et suppression des
  métadonnées (GPS, modèle du téléphone) **sur le téléphone, avant l'envoi**
  (`lib/face-blur.ts`).
- Pas de module « incivilité » ni « véhicule volé » : uniquement des
  informations d'infrastructure vérifiables.
- Le RGPD s'applique en Nouvelle-Calédonie (CNIL compétente). Ceci n'est pas
  un avis juridique.

## Feuille de route

- **Sprint 2 (cette version)** — fiabilité, doublons, zone 1-5 km, temps
  réel, écrans des maquettes, historique.
- **Ensuite** — notifications (Web Push) sur la zone et les trajets
  habituels ; purge automatique (`pg_cron`, bloc commenté en bas du
  schéma) ; modération des descriptions ; tableau de bord pro pour
  collectivités et secours (V3).
