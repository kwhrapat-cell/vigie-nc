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
| `/alertes` | Vigilance météo officielle (Météo-France NC), **notifications sur le téléphone** (lieu choisi, 3/5/10 km), puis alertes en cours, ma zone ou toute la Calédonie |
| `/historique` | Mémoire du territoire : 12 derniers mois, évolution mensuelle, événements |
| `/profil` | Rayon par défaut, contacts d'urgence, niveaux de fiabilité, **partager l'appli** (WhatsApp ou autre), confidentialité |
| `/contacts` | Contacts d'urgence (gardés sur le téléphone uniquement) |
| `/affiche` | L'affiche de Vigie NC à envoyer par lien : ouvrir l'appli, enregistrer l'image, partager le lien (`public/affiche/`) |
| `/conditions` · `/confidentialite` · `/mentions-legales` | Pages légales (textes et coordonnées dans `lib/legal.ts`) |

À la première ouverture, un écran rappelle que l'info est citoyenne et
indicative, qu'on ne touche pas son téléphone au volant et qu'en urgence on
appelle le 15 / 17 / 18 (`components/WelcomeNotice.tsx`).

Un lien `/?signalement=<id>` ouvre directement la fiche (bouton « Partager »).

## Partage et aperçu du lien

Quand on envoie le lien de l'appli (WhatsApp, Messenger, SMS…), l'aperçu
affiche `app/opengraph-image.png` (1200×630) avec le titre et la description
définis dans `app/layout.tsx`. L'adresse publique et le texte d'invitation
sont dans `lib/site.ts` : **https://vigie-nc.com**. L'ancienne adresse
`vigie-nc.vercel.app` renvoie vers le nom de domaine (`next.config.mjs`),
sauf `/sw.js` et `/api` pour que les alertes déjà activées continuent.
WhatsApp garde l'aperçu en mémoire un moment : un changement d'image peut
mettre du temps à apparaître sur un lien déjà envoyé.

## Installer l'appli sur le téléphone

`app/manifest.ts` rend Vigie NC installable. Sur Android, Profil →
« Installer l'appli » ouvre directement la fenêtre d'installation de
Chrome (et Chrome propose « Installer l'application » dans son menu) ;
sur iPhone, le bouton affiche les étapes (Safari → Partager → « Sur
l'écran d'accueil », puis ouvrir l'icône). Le mode `standalone` est
indispensable aux notifications sur iPhone ; sur iPhone, l'appli de
l'écran d'accueil garde ses propres données (contacts SOS, réglages), à
part de Safari. Sur Android, elles restent partagées avec Chrome.

## Notifications (alertes sur le téléphone)

Écran Alertes → « Activer » : on choisit un lieu (arrondi à ~1 km), une
distance (3, 5 ou 10 km) et un nom facultatif (« Maison »). Le téléphone
reçoit une notification quand un **danger est confirmé** dans cette zone :
accident, route coupée, inondation, danger ou météo, dès qu'une 2e personne
confirme (« Toujours là ») ou qu'une source officielle vérifie. Au plus 5
alertes par heure par téléphone, jamais deux fois la même.

Comment ça marche :

1. `public/sw.js` (service worker, enregistré par
   `components/ServiceWorkerRegister.tsx`) affiche les notifications ;
   `lib/push.ts` gère l'abonnement côté téléphone,
   `components/AlertSettings.tsx` l'écran.
2. L'abonnement est enregistré par la RPC `notif_abonner` (table privée
   `push_abonnements`).
3. Quand un signalement devient « confirmé », le déclencheur
   `trg_vigie_notification` appelle `https://…/api/notifier` via `pg_net`
   (adresse et secret dans la table privée `vigie_config`).
4. `app/api/notifier/route.ts` demande les destinataires à la base
   (`notif_destinataires`, qui note les envois dans `push_envois`, effacés
   après 7 jours) et envoie avec `web-push` (`lib/push-server.ts`).
   Les abonnements refusés (téléphone désinscrit) sont effacés
   (`notif_echecs`).

Réglages à faire une fois :

- **Vercel** (Production et Preview) : `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY` (paire de clés VAPID, `npx web-push
  generate-vapid-keys`) et `NOTIF_SECRET` (un long mot de passe au hasard).
- **Supabase** (SQL Editor), avec le même secret :
  `insert into vigie_config (cle, valeur) values ('notif_url',
  'https://vigie-nc.com/api/notifier'), ('notif_secret', '<secret>')
  on conflict (cle) do update set valeur = excluded.valeur;`
  L'extension `pg_net` doit être active (le schéma l'active si possible).

Chrome (Android) analyse le texte des notifications sur le téléphone et
peut les marquer « spam possible » : textes factuels et précis, sans emoji
ni « touche ici » (`alertPayload()` dans `lib/push-server.ts`). L'écran
Alertes explique quoi faire (afficher, puis « Toujours autoriser »). Un nom
de domaine à soi (plutôt que `*.vercel.app`) devrait aussi aider.

iPhone : notifications seulement depuis l'appli ajoutée à l'écran
d'accueil (iOS 16.4 ou plus récent). Le bouton « Tester » envoie une
notification à ce téléphone seulement (`app/api/notif-test`).

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

### Modération

**Écran de modération** : Profil → « Espace modérateur » (ou `/moderation`),
avec un code personnel. Onglets « Signalés » (contenus signalés ou masqués,
30 jours) et « Récents 48 h ». Actions : masquer / rétablir photo et texte,
« C'est OK », retirer de la carte, marquer « Vérifié » avec la source. Chaque
action est notée dans `moderation_journal` (gardé un an).

Gérer les modérateurs, dans **SQL Editor** (le code n'est jamais stocké en
clair, seulement son empreinte) :

- ajouter ou changer un code : `select vigie_ajouter_moderateur('Nom', '<code de 16 caractères ou plus>');`
- retirer l'accès : `select vigie_retirer_moderateur('Nom');`

**Alarme de sécurité** : dans l'écran de modération, « Recevoir l'alarme sur
ce téléphone ». Une notification arrive dès que la liste des modérateurs
change (ajout, code changé, accès retiré ou rétabli, suppression), et le
changement est noté dans `moderation_journal`. Arrêter l'alarme d'un ancien
modérateur : `delete from moderation_alertes where moderateur = 'Nom';`


Sur la fiche d'un signalement qui a une photo ou un texte, le bouton
**« Signaler un contenu »** propose 3 motifs (visage / plaque / nom, insulte
ou image choquante, hors sujet). À partir de **2 téléphones différents**, la
photo et le texte sont masqués automatiquement ; le fait (type, lieu, heure)
reste sur la carte. Une info fausse ou finie se traite avec « C'est terminé ».

Sans l'écran, les mêmes actions restent possibles dans **SQL Editor** :

- voir ce qui a été signalé : `select * from report_flags order by created_at desc;`
- masquer à la main : `select vigie_masquer_contenu('<id du signalement>');`
- annuler un masquage : `select vigie_retablir_contenu('<id du signalement>');`
- retirer tout le signalement de la carte :
  `update reports set resolved_at = now(), expires_at = now() where id = '<id>';`

Le contenu masqué est gardé 90 jours dans `report_contenu_masque` (au cas
où). Pour effacer définitivement une photo : **Storage → report-photos**,
supprimer le fichier dont le nom figure dans l'adresse de la photo.

L'id d'un signalement est à la fin du lien « Partager » (`?signalement=<id>`).

### Purge automatique

Le schéma active `pg_cron` et programme `vigie_purger_donnees_appareil()`
chaque nuit (3 h 15 à Nouméa) : 30 jours après la fin d'un signalement, le
lien entre l'empreinte du téléphone et ce signalement est effacé (auteur,
votes, signalements de contenu) ; le contenu masqué est effacé après 90
jours. Les tâches sont visibles dans **Integrations → Cron**.

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
l'aperçu tourne en mode démo. Pour les notifications :
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NOTIF_SECRET` (voir
plus haut).

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
- Pages légales : `/conditions`, `/confidentialite`, `/mentions-legales`.
  Éditeur, contact, hébergeurs et date de mise à jour sont dans
  `lib/legal.ts` (ajouter le numéro RIDET quand il existe).
- La loi Informatique et Libertés s'applique en Nouvelle-Calédonie (CNIL
  compétente). Ceci n'est pas un avis juridique.

## Feuille de route

- **Sprint 2 (cette version)** — fiabilité, doublons, zone 1-5 km, temps
  réel, écrans des maquettes, historique.
- **Fait ensuite** — pages légales, modération, partage, affiche,
  installation, notifications « danger confirmé » autour d'un lieu choisi.
- **Ensuite** — alertes sur les trajets habituels ; tableau de bord pro
  pour collectivités et secours (V3).
