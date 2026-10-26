# Lancer Vigie dans un autre territoire

Une copie de Vigie = **un site Vercel + une base Supabase**, avec ses
propres modérateurs, partenaires et pages légales. Le code est le même
pour tous les territoires. Sans réglage, c'est la Nouvelle-Calédonie, à
l'identique (vérifié par `vigie-nc/tests/territoire.test.ts` et l'essai
E36 de `supabase/tests/essais.sql`).

## 1. La fiche du territoire (code)

Dans `vigie-nc/lib/territoire.ts`, ajouter une fiche à `TERRITOIRES` :
nom de l'appli et sigle du logo, adresse du site, phrases (« en
Polynésie », « toute la Polynésie »…), fuseau horaire, centre et emprise
de la carte, code pays pour la recherche des lieux, vigilance météo
officielle (ou `null`), numéros d'urgence, exemple de numéro de téléphone.

## 2. Le site (Vercel)

Nouveau projet Vercel sur ce même dépôt (Root Directory `vigie-nc`), avec
les variables habituelles (`.env.example`) **et**
`NEXT_PUBLIC_TERRITOIRE=<code>`. Un code inconnu arrête la construction.

## 3. La base (Supabase)

Nouveau projet Supabase : lancer `supabase/schema.sql`, puis régler le
territoire en une commande (valeurs vérifiées) :

```sql
select vigie_regler_territoire('Pacific/Tahiti', -28.0, -7.5, -155.0, -134.0);
-- fuseau, lat_min, lat_max, lng_min, lng_max (positions acceptées)
```

Puis les réglages habituels de `vigie_config` (alertes, photos, IA) et les
modérateurs (`vigie_ajouter_moderateur`). Les purges de nuit (pg_cron) sont
à heure fixe UTC : décaler `cron.schedule` si besoin.

## 4. Ce qui reste propre à la Calédonie (à reprendre)

- Pages légales (`/conditions`, `/confidentialite`, `/mentions-legales`,
  `lib/legal.ts`) : droit local, institutions, éditeur.
- Affiche (`/affiche`, `public/affiche/`), image d'aperçu
  (`app/opengraph-image.png`) et icônes (`public/icons/`, `app/icon.png`).
- Le cagou (mascotte et niveaux) : oiseau de la Calédonie.
- Lecture des messages relayés (`lib/relay-parser.ts`) : noms de routes
  et de communes de Calédonie.
- Appli Android de test (`android/`).
