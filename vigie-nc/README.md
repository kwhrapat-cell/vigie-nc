# Vigie NC

La route, le ciel et le terrain calédonien, réunis en direct — et une mémoire
de ce qui revient trop souvent.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS — tokens de couleur repris tels quels de la maquette
  (`tailwind.config.ts`)
- Leaflet / react-leaflet — carte en direct, fond de carte sombre CARTO
- Supabase (Postgres + PostGIS, Storage) — signalements géolocalisés, RLS

## Démarrage

```bash
npm install
cp .env.example .env.local   # puis remplir avec les clés Supabase du projet
npm run dev
```

Sans `.env.local` rempli, l'app tourne quand même : tous les écrans
utilisent les données de démonstration de `lib/mock-data.ts`.

## État — Sprint 1 (MVP)

Périmètre de ce sprint : transformer la maquette en app fonctionnelle,
sans toucher au reste (l'historique de zone reste sur données de démo).

- ✅ **Carte** — signalements réels affichés depuis Supabase
- ✅ **Localisation réelle** — `lib/useGeolocation.ts`, utilisé par
  Signaler et par le SOS
- ✅ **Créer un signalement** — position réelle captée à l'envoi
- ✅ **Photo** — floutage automatique des visages détectés (MediaPipe,
  entièrement côté client) avant l'upload vers le bucket Supabase
  Storage `report-photos`. La photo brute avec un visage visible ne
  quitte jamais l'appareil — voir `lib/face-blur.ts`.
- ✅ **SOS** — signalement prioritaire immédiat + ouverture de l'appli
  SMS locale vers les contacts d'urgence enregistrés (`app/contacts`,
  `lib/emergency-contacts.ts`). Aucun appel automatique aux services
  d'urgence — ça reste à négocier avec les institutions partenaires.
- ✅ **Base de données durcie** — anti-spam par appareil (1
  signalement/minute, SOS jamais bloqué), contraintes sur lat/lng,
  policies RLS sur les signalements et sur le stockage des photos

## Base de données

Le schéma complet est dans `supabase/schema.sql`. À exécuter une fois
dans l'éditeur SQL du dashboard Supabase, ou via `supabase db push`.

Logique clé :
- le client envoie `lat`/`lng` directement ; un trigger maintient une
  colonne `geom` (PostGIS) en arrière-plan pour les futures requêtes
  spatiales (ex: signalements dans un rayon donné) ;
- anti-spam : un trigger refuse un 2ᵉ signalement du même appareil
  (`device_hash`, généré côté client dans `lib/device-id.ts`) en moins
  d'une minute — sauf pour les SOS ;
- chaque confirmation d'un autre appareil repousse l'expiration de 2h ;
- le bucket `report-photos` est créé et rendu public en lecture par le
  script — l'upload anonyme y est autorisé.

## Structure

```
app/
  page.tsx                    écran 1 — carte en direct (+ FAB, SOS)
  signaler/page.tsx           écran 2 — formulaire de signalement
  contacts/page.tsx           gestion des contacts d'urgence (SOS)
  historique/[zoneId]/page.tsx écran 3 — historique de zone (démo)
components/                   composants d'écran
lib/                          types, géoloc, Supabase, contacts, mapper DB
supabase/schema.sql           schéma complet + RLS + anti-spam
```

## Droit à l'image

Le floutage des visages (`lib/face-blur.ts`) répond à une exigence du
porteur du projet : éviter de capter et publier, même par inadvertance,
le visage d'un tiers photographié en marge d'un signalement — le RGPD
s'applique en Nouvelle-Calédonie depuis 2019 et la CNIL en est
l'autorité compétente. Ceci n'est pas un avis juridique : pour toute
question de conformité précise, un avocat local ou la CNIL restent la
référence.

Le modèle de détection (MediaPipe) tourne dans le navigateur, chargé
depuis un CDN au premier usage — une connexion internet est donc
nécessaire la première fois que l'écran Signaler est ouvert.

## À faire ensuite (hors Sprint 1)

- Peupler la table `zones` et brancher l'historique sur les vraies
  données (actuellement sur `lib/mock-data.ts`).
- Discuter avec les partenaires institutionnels (Sécurité civile,
  Gendarmerie, pompiers) avant d'envisager un lien SOS → numéro
  d'urgence réel.
- Purge automatique des signalements expirés (`pg_cron`, commande
  commentée en bas de `schema.sql`).
- Reprise avec Claude Code : ouvrir ce dossier comme projet et pointer
  vers ce README + `supabase/schema.sql` pour le contexte.
