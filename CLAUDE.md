# CLAUDE.md — Vigie NC

Guide pour Claude Code. Porteur du projet : Patrice (seul, technicien
étanchéité, pas développeur, travaille depuis son téléphone). Il teste sur
les aperçus Vercel. Écris-lui en français, simplement, sans jargon.

## Le projet

Carte gratuite et anonyme de l'état des routes en Nouvelle-Calédonie :
signalements citoyens (accident, inondation, feu ou fumée, route coupée,
danger, travaux, météo, trafic dense, chaussée dégradée, autre), fiabilisés par les votes
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
                  + /api/notifier (appelé par la base : envoie les alertes ; avec fin = true,
                    la « fin d'alerte » du trajet) et /api/notif-test
                  + /api/sante (moniteur : site + base ; RPC vigie_sante)
                  + /api/alerte-securite (appelé par la base : liste des modérateurs modifiée)
                  + /api/annonce (appelé par la base : annonce générale avec notification)
                  + /api/resumer (appelé par la base : résumé IA des témoignages) et
                    /api/resumer/essai (onglet « IA » de /moderation, code du modérateur)
                  + /api/itineraire (trajet favori : itinéraire OSRM depuis des positions
                    arrondies à ~100 m, session anonyme + trajet_itineraire_autoriser)
                  + /api/trajet (appelé par la base, pg_cron 5 min : point « avant départ »)
                  + /api/point-route (mode conduite : point route des 10 km écrit par l'IA ;
                    reçoit id + distance des signalements, jamais la position, et le jeton
                    de la session anonyme)
                  + pages légales (/conditions, /confidentialite, /mentions-legales)
                  + /affiche (l'affiche à envoyer par lien ; images dans public/affiche/)
                  + /moderation (écran des modérateurs, code personnel ; lien discret en bas du Profil ;
                    onglet « Travaux » : date de fin des chantiers (moderation_chantier) ;
                    onglet « Annonces » : message pour toute la Calédonie ;
                    onglet « Chiffres » : utilisateurs actifs, connectés en direct, provenances ;
                    onglet « IA » : essai du résumé automatique avec des témoignages inventés)
                  + /s/[id] (lien partagé d'un signalement : aperçu WhatsApp/Facebook via
                    opengraph-image.tsx, puis renvoi vers /?signalement=<id>&src=partage)
                  + error.tsx / global-error.tsx / not-found.tsx : écran EcranErreur
                    (cagou, Réessayer, Recharger, retour carte, 15/17/18 toujours
                    visibles) au lieu d'une page blanche ; l'erreur est signalée
  components/     CarteLive (accueil), LiveMap, HomeSheet (liste « À proximité » ;
                  se replie aux compteurs — barre du haut ou glissement vers le
                  bas — pour agrandir la carte, choix gardé sur le téléphone :
                  readListeRepliee de lib/preferences.ts), ReportDetail,
                  PositionPicker, BottomNav, ui.tsx (Logo, TypeTile, boutons…),
                  VigilanceMeteo (vignette officielle meteo.nc, sans clé),
                  WelcomeNotice (accueil à la 1re ouverture : démo des gestes
                  de base en 4 cartes — Voir, Signaler, Confirmer avec scènes
                  animées en CSS (classes « tuto-* » de globals.css, état final
                  si le téléphone coupe les animations, pas de vidéo), puis les
                  règles + conditions ; « Passer » mène aux règles. Tutoriel
                  mode « revoir » ouvert depuis le Profil. En le fermant, la
                  bulle « Touche ici pour signaler » (BottomNav) s'affiche une
                  seule fois, jamais pour qui avait déjà vu l'accueil ; logique
                  dans lib/tuto.ts), LegalPage,
                  ShareApp (partager l'appli : WhatsApp ou menu du téléphone),
                  InstallApp (installer l'appli : bouton Android, étapes iPhone),
                  OuvrirDansNavigateur (lien ouvert dans Facebook, Messenger,
                  Instagram ou TikTok : explique comment l'ouvrir dans Chrome /
                  Safari, bouton « Copier le lien » ; repère dans
                  lib/navigateur-integre.ts ; affiché par InstallApp et
                  AlertSettings, car ni installation ni alertes n'y marchent),
                  ShareAffiche (partager le lien de l'affiche),
                  AlertSettings (écran Alertes : activer les notifications ; prévient
                  ALERTES_EVENT de lib/push.ts quand elles changent),
                  TrajetSettings (écran Alertes, carte « Mon trajet », ancre #trajet :
                  départ → arrivée → horaires et jours ; TrajetApercu = petite carte du
                  tracé, pointillés = extrémités gardées sur le téléphone ; renvoie le
                  trajet à la base s'il manque ou diffère quand les alertes sont actives),
                  TrajetResume (accueil, dans HomeSheet sous les compteurs, visible liste
                  repliée : « Mon trajet · Rien de signalé / 1 à surveiller / 2 dangers »,
                  déplié = liste dans l'ordre de la route + « Voir sur la carte » (ligne
                  dans LiveMap, prop ligne/cadrerLigne ; ses signalements ajoutés à la
                  carte) ; lien ?trajet=1 = déplié + ligne cadrée ; sans trajet,
                  invitation fermable « vigie-nc:trajet-invite »),
                  ServiceWorkerRegister (enregistre public/sw.js),
                  SessionInit (ouvre la session anonyme au démarrage),
                  ServiceIndisponible (affiché en prod si la base n'est pas
                  branchée : JAMAIS de mode démo en production),
                  ModStatsPanel (onglet Chiffres de /moderation),
                  ModIaPanel (onglet IA de /moderation : essai du résumé, rien n'est publié),
                  AnnonceBanner (bandeau des annonces générales sur l'accueil ;
                  AnnonceCard sert aussi d'aperçu), ModAnnoncesPanel (onglet
                  Annonces de /moderation),
                  TravauxBanner (bandeau « Travaux à X km » à l'ouverture :
                  travaux en cours à 10 km, une recherche par ouverture,
                  nouvelle ouverture = retour après 30 min ; chaque travaux
                  montré une fois par jour au plus — compté « vu » après 2 s à
                  l'écran ou si on le touche —, liste « vigie-nc:travaux-vus »
                  sur le téléphone ; constantes TRAVAUX_BANDEAU_* de lib/types.ts),
                  Bandeaux de l'accueil : UN SEUL à la fois (lib/bandeaux.ts :
                  annonce urgence/vigilance > « Tu passes par là ? » > annonce
                  info > travaux > merci) ; chacun signale sa présence
                  (onPresence) et attend son tour (masque) sans rien perdre ;
                  une annonce en attente reste visible en pastille,
                  ShareRedirect (page /s/[id] → carte),
                  ErreurReporter (dans le layout : erreurs et promesses rejetées
                  de la page → lib/erreurs.ts),
                  Cagou (mascotte, dessin SVG original : bienvenue, liste vide,
                  merci après un signalement, service indisponible),
                  ImpactBanner (accueil : « N personnes ont confirmé ton
                  signalement », relit au plus 5 de MES signalements toutes
                  les 10 min par signalement_detail_v3 ; fête aussi la montée
                  de niveau du cagou : « Ton cagou devient Sentinelle ! »),
                  MonImpact (Profil : niveau du cagou, progression, interrupteur
                  « Mon cagou sur la carte », chiffres + badges), DemandeConfirmation (« Tu passes par
                  là ? » : à 300 m d'un signalement ni à moi ni voté, arrêté
                  (vitesse < 3 m/s), une demande par signalement et une toutes
                  les 10 min, jamais en conduite),
                  PartagePointRoute (bouton « Partager » au-dessus de la liste :
                  image « Point route » de la zone, dessinée sur le téléphone
                  (lib/point-route-dessin.ts, canvas 1080 × 1350, sans
                  dépendance) à partir des signalements affichés
                  (lib/point-route-partage.ts : type, lieu, heure, fiabilité ;
                  jamais texte, photo, SOS ni position), partage par le menu du
                  téléphone, sinon texte sur WhatsApp ou image à enregistrer ;
                  lien ?src=point-route),
                  ModeConduite (useModeConduite + BoutonConduite, BarreConduite
                  (barre du bas en conduite : gros boutons de 64 px avec texte —
                  Point route, Voix, Réglages ; les réglages s'ouvrent dans le
                  bandeau du haut), BandeauConduite : annonces vocales
                  des dangers confirmés devant, écran gardé allumé. Pendant la
                  conduite, CarteLive passe la carte en plein écran : liste,
                  barre du bas et bandeaux masqués (pas démontés), bandeau
                  compact en haut, réglages repliés, vue « autour de moi »
                  forcée, recentrage tout seul après 20 s si on a déplacé la
                  carte. Bouton caché dans l'appli Android, repère
                  « VigieNCApp » du navigateur. Point route : au démarrage puis
                  bouton « Point route » de la BarreConduite, la voix dit tout ce qui est
                  signalé sur les 10 km devant — texte de l'IA (fetchPointRouteIa,
                  6 s au plus côté serveur, 8 s côté téléphone) ou, à défaut,
                  textePointRoute() ; les dangers cités ne sont pas réannoncés tout
                  de suite à la portée. Ces événements sont mis en évidence sur la
                  carte (LiveMap highlightIds, classe .is-ahead, jamais regroupés) ;
                  en conduite la carte affiche aussi les signalements trouvés par
                  le mode conduite (recherche d'au moins 13 km, rayonRechercheSite).
                  Pas encore dans l'appli Android)
  lib/
    types.ts         types de signalement, couleurs, icônes, durées, rayons
    reports-api.ts   SEUL point d'accès aux données depuis le navigateur (RPC
                     Supabase ou démo)
    report-public.ts lecture côté serveur d'un signalement pour l'aperçu de
                     /s/[id] (type, lieu, heures, confirmations : rien d'autre)
    session.ts       session anonyme Supabase (identité signée, pas de compte)
    turnstile.ts     Cloudflare Turnstile (facultatif, NEXT_PUBLIC_TURNSTILE_SITE_KEY)
    demo-store.ts    mode démo en mémoire (mêmes règles que le SQL), jamais en prod
    useLiveReports.ts carte en direct (temps réel vigie_signal) + dernière
                     carte gardée pour l'affichage sans réseau
    useAnnonces.ts   annonces générales en direct (temps réel
                     vigie_annonce_signal) + copie pour l'affichage sans réseau
    reliability.ts   4 niveaux : Signalement / À confirmer / Confirmé / Vérifié
    cagou.ts         dessin SVG du cagou (composant Cagou + image du point route)
    impact.ts        « Mon impact », SUR LE TÉLÉPHONE seulement (localStorage
                     « vigie-nc:impact-v1 ») : mes 30 derniers signalements,
                     votes, jours d'utilisation, badges (BADGES). Noté par
                     reports-api après createReport / relayReport / voteOnReport.
                     Pas de classement entre utilisateurs (pousserait aux faux
                     signalements), décrit dans /confidentialite
    chantier.ts      chantiers de longue durée (date de fin annoncée), dates
                     de Nouméa, CHANTIER_JOURS_MAX aligné sur
                     vigie_chantier_jours_max() du SQL
    trajet.ts        trajet favori, logique pure (tests/trajet.test.ts) : ligne sans les
                     500 premiers/derniers mètres (TRAJET_COUPE_M, 20 % au plus si
                     court), simplifiée (400 points au plus), place le long de la ligne,
                     verdict (danger = ALERT_TYPES confirmé : 2e personne ou officiel ;
                     le reste « à surveiller »), jours (bit 0 = lundi), textes des
                     notifications, trajet gardé sur le téléphone (« vigie-nc:trajet-v1 »,
                     TRAJET_EVENT). TRAJET_COULOIR_M / _AVANCE_MIN / _APRES_MIN alignés
                     sur vigie_trajet_couloir_m() / _avance_min() / _apres_min() du SQL
    conduite.ts      mode conduite : dangers devant (angle 40°), portée de la
                     voix au choix 3 / 5 / 10 km, annonce à la portée puis à
                     500 m (+ 3 km pour 10 km), phrases parlées ; un danger
                     cité par le point route n'est pas redit à la portée, et
                     les annonces faites restent en mémoire 30 min après
                     l'arrêt (CONDUITE_MEMOIRE_MS). ⚠️ Même logique dans
                     android/…/Conduite.kt : garder les deux alignées
    voix.ts          voix du mode conduite (synthèse du téléphone) : la voix
                     française la plus naturelle d'abord, choix dans les réglages
                     (« vigie-nc:conduite-voix-nom »), vitesse 0,95 ; l'appli
                     Android choisit aussi la meilleure voix installée
                     (ConduiteService.choisirVoix, sans les voix réseau)
    erreurs.ts       erreurs des téléphones envoyées anonymement (5 par page,
                     sans doublon ; recharge une fois après une mise à jour du
                     site au lieu de planter) ; texte et filtre dans
                     erreurs-texte.ts (message + pile sans l'adresse du site,
                     navigateur « Chrome 140 · Android », jamais l'UA complet)
    face-blur.ts     photo : réduction, floutage visages, suppression EXIF.
                     MediaPipe servi par NOTRE site (public/mediapipe/<version>/,
                     fabriqué par scripts/preparer-floutage.mjs au « prebuild » :
                     WASM copié du paquet npm + modèles téléchargés ; ignoré par
                     git), jsDelivr/Google en secours. MEDIAPIPE_VERSION doit
                     égaler la version installée (sinon la construction s'arrête)
    place.ts         nom du lieu via Nominatim
    map-styles.ts    fonds de carte (OpenStreetMap / Esri, sans clé — pas CARTO,
                     qui exige une clé depuis 2026 ; MapTiler si
                     NEXT_PUBLIC_MAPTILER_KEY ; plan de secours automatique) + emprise NC
    cluster.ts       regroupement des signalements en pastilles chiffrées
    bandeaux.ts      ordre des bandeaux de l'accueil (un seul affiché à la fois)
    niveaux.ts       niveaux du cagou (repère de TA position, façon Waze, vu par toi
                     seul) : Poussin 0 badge, Vigie 1, Sentinelle 3, Gardien 6,
                     Légende = tous les badges (BADGES de impact.ts ; ajouter un
                     badge rend Légende plus dur, d'où le niveau max gardé
                     « vigie-nc:niveau-max » : il ne redescend jamais). Monte avec
                     les badges, jamais avec un simple nombre de signalements.
                     Réglage « vigie-nc:cagou-carte » (point bleu simple sinon).
                     Jamais montré aux autres (anonymat, pas de position partagée)
    avatar.ts        dessin SVG du cagou à ta position selon le niveau (bulle
                     au-dessus, point bleu = position exacte, ancre AVATAR_POINT) ;
                     sous les signalements sur la carte (zIndexOffset négatif)
    useNiveau.ts     niveau relu à chaque changement d'impact (IMPACT_EVENT)
    contraste.ts     contraste des couleurs (règle WCAG) ; couleurSur(fond) = couleur
                     du texte/icône sur une couleur de type ou de catégorie
                     (blanc, foncé sur l'orange et le jaune où le blanc passe sous 3:1)
    tuto.ts          démo d'accueil : ordre des cartes, glissement du doigt,
                     astuce du « + » (« vigie-nc:astuce-signaler » : a-montrer / vue)
    relay-parser.ts  lecture d'un message collé → type + lieu (sur le téléphone)
    legal.ts         éditeur (Tramea Solutions, entreprise individuelle, RIDET
                     0 726 331.003, adresse et téléphone de l'avis RIDET du
                     29/10/2026), contact, hébergeurs, date des textes légaux
    site.ts          adresse publique (SITE_URL), texte de partage de l'appli
    push.ts          notifications côté téléphone (service worker, abonnement)
    push-server.ts   envoi des notifications (web-push, clés VAPID), texte des alertes
    ia.ts            SERVEUR uniquement : résumé des témoignages et point route par
                     l'IA Claude (claude-haiku-5-5, clé ANTHROPIC_API_KEY de Vercel) :
                     consignes, appel de l'API avec sortie JSON (appelerClaude),
                     nettoyage (ni numéro ni lien). Ne jamais l'importer depuis un
                     écran (« use client »)
  app/opengraph-image.png  aperçu du lien (WhatsApp, Facebook…), app/icon.png +
                       app/apple-icon.png : icônes (écran d'accueil, onglet)
  app/manifest.ts  rend l'appli installable + raccourcis par appui long sur
                   l'icône (Signaler, Alertes, SOS) (display standalone, nécessaire aux
                   notifications sur iPhone ; là, l'appli de l'écran d'accueil a
                   ses propres données, à part de Safari) ; icônes dans public/icons/
  public/sw.js     service worker : notifications + ouverture sans réseau
                   (pages réseau d'abord, fichiers /_next/static, tuiles OSM)
  assets/fonts/    Inter réduite aux caractères latins (image d'aperçu de /s/[id]), licence OFL.txt
  tests/           tests de la logique (node:test, Node 22, AUCUNE dépendance :
                   « npm test », chargeur tests/chargeur.mjs pour « @/ » et les
                   imports sans extension). Fichiers de lib/ testés : imports de
                   types avec « type » (sinon Node plante). cas-conduite.json =
                   cas communs joués aussi par android/…/ConduiteCasTest.kt
  supabase/schema.sql  schéma complet, ré-exécutable
  supabase/functions/purge-photos  fonction Supabase (Deno) : photos > 7 jours
  supabase/tests/  shim-supabase.sql (faux Supabase pour Postgres + PostGIS)
                   et essais.sql (41 essais : identité, votes, SOS, photos, droits,
                   type « feu », chiffres d'utilisation, annonces générales, chantiers,
                   témoignages et résumé IA, point route, erreurs des téléphones,
                   trajet favori)
.github/workflows/verification.yml  à chaque PR : tests de la logique (Node 22),
                   build + types, schema.sql deux fois puis essais.sql sur
                   Postgres + PostGIS
.github/dependabot.yml  mises à jour groupées une fois par mois (npm du site,
                   actions GitHub, Gradle) ; pas de version majeure automatique
android/           appli Android DE TEST (Kotlin, sans dépendance lourde) : le site
                   dans l'appli + service « mode conduite » au premier plan
                   (position, voix qui baisse la musique, notification
                   permanente, bulle si le téléphone l'accepte — pas Android Go).
                   Réglages (portée, voix, trafic dense) et « Démarrer tout seul
                   en voiture » (reconnaissance d'activité Google, position
                   « Toujours », arrêt à la sortie du véhicule ou après 15 min
                   immobile ; décrit dans /confidentialite).
                   Lit signalements_proches_v3 avec la clé publique. Clé de
                   signature de test android/app/vigie-nc-test.p12 (AES-256),
                   son mot de passe est le secret GitHub
                   ANDROID_KEYSTORE_PASSWORD, JAMAIS dans le dépôt (l'ancienne
                   clé « vigie-test » était lisible : changée le 24/10/2026).
                   Jamais pour le Play Store.
.github/workflows/android.yml  tests JVM (ConduiteCasTest : mêmes cas que le
                   site) puis fabrique l'APK de test et le publie au lien fixe
                   …/releases/download/app-test/vigie-nc-test.apk, seulement
                   s'il porte l'empreinte de la clé (EMPREINTE_CLE ; sans le
                   secret : construit mais pas publié)
```

## Conventions

- Versions figées par `vigie-nc/package-lock.json` (Next.js 16, React 19) :
  toute nouvelle dépendance passe par `npm install` et le fichier mis à
  jour est commité avec elle.

- Textes de l'interface et commentaires **en français**, tutoiement.
- Mobile d'abord (largeur 380 px), cibles tactiles ≥ 44 px.
- Textes lisibles au soleil et par les anciens : au moins 14 px pour le texte
  courant, 12 px pour les petites mentions (sauf outils de modération et
  affiche). Signaler = 2 étapes : le type, puis « Publier » (position
  automatique, photo et détails repliés en option).
- Couleurs : jetons Tailwind (`void`, `panel`, `panel-2`, `line`, `primary`,
  `lagoon`, `danger`, `warn`, `info`, `ok`, `mist`, `mist-dim`). Couleurs
  par type/catégorie dans `lib/types.ts`. Texte ou icône posé sur une de ces
  couleurs : `couleurSur()` de `lib/contraste.ts`, jamais `text-white` en dur.
  Texte blanc sur `primary` ≥ 4,5:1 (vérifié par tests/contraste.test.ts).
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
- Témoignages et résumé IA : à la création et à chaque doublon fusionné,
  le texte de la personne va dans la table privée `report_temoignages`
  (un par session, effacée après 7 jours) ; la description publique reste
  la première. À partir de 2 témoignages, `vigie_demander_resume` prévient
  `/api/resumer` par `pg_net` (`ia_url` de `vigie_config`, sinon notif_url
  avec /api/resumer au bout ; secret = `notif_secret`) : une demande à la
  fois par signalement (`resume_ia_demande_at`, 1 min), rien si aucun
  témoignage nouveau (`resume_ia_version` = heure du dernier témoignage
  résumé, renvoyée telle quelle en texte), `vigie_ia_max_heure()` appels
  par heure (60, clé `ia_max_heure`), interrupteur `ia_resume` = `non`. Le
  serveur lit `ia_temoignages` et écrit `ia_enregistrer_resume` (secret) ;
  le résumé (`resume_ia`, 240 caractères = `RESUME_MAX` de lib/ia.ts,
  `resume_ia_nb`) est renvoyé en fin de liste par `signalements_proches_v3`
  / `signalement_detail_v3`, masqué avec la photo et le texte. Envoyé à
  l'IA : type, lieu, âge, textes ; jamais qui les a écrits (décrit dans
  /confidentialite). Essai depuis /moderation : `moderation_ia_essai`.
- Point route (mode conduite) : `ia_point_route_preparer(p_ids uuid[])`,
  session anonyme obligatoire (rôle `authenticated` ; la route l'appelle
  avec le jeton du téléphone, `supabaseAvecJeton` de lib/supabase.ts),
  10 identifiants au plus, 1 par minute et 40 par jour par session,
  `vigie_ia_point_route_max_heure()` pour toute la base (300, clé
  `ia_point_route_max_heure`), interrupteur `ia_resume` commun. Renvoie le
  contenu public des signalements en cours (résumé ou description masqués
  si le contenu l'est). Trace dans `vigie_ia_appels` (origine
  `point_route`, `device_key`), effacée après 24 h.
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
- Chiffres d'utilisation (comptage interne et anonyme, décrit dans
  /confidentialite) : `SessionInit` appelle `vigie_presence(p_source)` à
  l'ouverture puis toutes les 2 min (session anonyme obligatoire, une
  écriture par minute au plus). Tables privées `vigie_activite` (empreinte +
  jour, effacée après 35 jours), `vigie_visiteurs` (premier/dernier jour,
  90 jours), `vigie_sources_jour` et `vigie_stats_jour` (totaux, sans lien
  avec un appareil). Lecture : `moderation_statistiques(p_code)`, seulement
  des totaux. La purge de nuit range les jours terminés dans
  `vigie_stats_jour`. Provenance d'un lien : `?src=affiche`, `?src=partage`…
- Notifications : RPC `notif_abonner` / `notif_mon_abonnement` /
  `notif_desabonner` (table privée `push_abonnements`, lieu arrondi à
  ~1 km, rayon 3/5/10 km). Le déclencheur `trg_vigie_notification` appelle
  `/api/notifier` par `pg_net` quand un danger devient confirmé (2e
  personne ou source officielle) ; adresse et secret dans la table privée
  `vigie_config` (le secret = `NOTIF_SECRET` de Vercel, jamais dans le
  dépôt). `notif_destinataires` note les envois (`push_envois`, 7 jours,
  5 alertes/heure max). Clés VAPID : variables Vercel
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY`.
- Trajet favori (section « Trajet favori » du SQL) : départ et arrivée
  exacts JAMAIS envoyés ; la base ne reçoit que la ligne sans ses
  extrémités. Point à l'ouverture : `trajet_signalements(p_points)` (ouvert
  à tous, rien d'enregistré, mêmes colonnes que signalements_proches_v3 +
  `position_m`). Alertes : table privée `push_trajets` (un trajet par
  abonnement, effacé avec lui), RPC `trajet_enregistrer` / `trajet_mon` /
  `trajet_supprimer` (adresse d'abonnement, erreur `alertes_inactives` sans
  abonnement). Couloir 300 m. `notif_destinataires` ajoute les trajets dont
  l'heure est en cours (30 min avant → 1 h après un départ,
  `vigie_trajet_departs`, heure de Nouméa) ; `push_envois.trajet_at` note
  l'annonce au titre du trajet. Avant départ : pg_cron
  `vigie-trajets-avant-depart` (5 min) → `vigie_trajets_appeler` (rien si
  aucun départ dans les 30 min) → `/api/trajet` → `trajet_avant_depart`
  (une fois par départ et par jour, `verifie_aller` / `verifie_retour` ;
  seulement s'il y a un danger confirmé). Fin d'alerte : déclencheur
  `trg_vigie_fin_trajet` (resolved_at rempli, danger annoncé sur le trajet
  dans les 12 h) → `/api/notifier` `{fin: true}` → `notif_fin_destinataires`
  (`fin_envoyee_at`) ; un danger qui expire seul ne déclenche rien.
  Itinéraire : `trajet_itineraire_autoriser()` (session, 20 par jour, 300
  par heure en tout, table privée `vigie_itineraire_appels` purgée après
  24 h). Chiffres : `abonnes_trajet` dans moderation_statistiques.
- Chantiers de longue durée (travaux seulement) : `moderation_chantier(code,
  id, source, fin)` met la source officielle (« Vérifié »), `fin_annoncee`
  (6 mois au plus, `vigie_chantier_jours_max()`) et `expires_at` à minuit
  après ce jour, heure de Nouméa ; remet aussi sur la carte un travaux
  effacé. Les « C'est terminé » ne l'effacent pas (règle des vérifiés) : il
  remonte dans l'onglet « Signalés » de /moderation. « Retirer vérifié »
  enlève aussi la date (redevient un travaux ordinaire de 3 jours). La date
  est renvoyée par `signalements_proches_v3` / `signalement_detail_v3`
  (colonne `fin_annoncee`, ajoutée en fin de liste : l'appli Android l'ignore).
- Annonces générales (vues par tout le monde, quelle que soit la zone) :
  table privée `annonces`, lecture par `annonces_actives()` (sans session),
  temps réel sans contenu par `vigie_annonce_signal`. Publication et retrait
  depuis /moderation (`moderation_annonce_publier` / `_retirer` /
  `moderation_annonces`, code du modérateur, noté dans `moderation_journal`,
  jamais affiché). Niveaux info / vigilance / urgence, 10 à 280 caractères,
  1 à 72 h. Notification facultative (vigilance ou urgence) à TOUS les
  abonnés : pg_net → `/api/annonce` (`annonce_url` de `vigie_config`, sinon
  notif_url avec /api/annonce au bout) → `annonce_destinataires` (une seule
  fois par annonce). Garde-fous : 10 annonces et 3 notifications par 24 h.
  Limites alignées sur `ANNONCE_*` de `lib/types.ts`.
- Erreurs des téléphones : table privée `vigie_erreurs` (jour + empreinte
  du message, compteur), `vigie_erreur_signaler(message, écran,
  navigateur)` ouverte à tous (même sans session : l'appli peut planter
  avant), texte nettoyé par `vigie_texte_erreur` (nombres longs, e-mails,
  fin des liens), 300 erreurs différentes par jour au plus, purge après
  14 jours ; lecture `moderation_erreurs(code)` (onglet « Chiffres »).
- Les pages `/confidentialite` et `/conditions` décrivent ce que fait
  vraiment le code (données envoyées, durées, purge `pg_cron`) : les mettre
  à jour (et `miseAJour` dans `lib/legal.ts`) si ça change.
- `schema.sql` doit rester **ré-exécutable d'un bloc** dans l'éditeur SQL
  Supabase (une seule transaction) : `if not exists`, `create or replace`,
  `drop ... if exists` avant de changer un type de retour, et toute
  **nouvelle valeur d'enum** ajoutée par `alter type ... add value if not
  exists` puis comparée en texte (`p_type::text = '...'`) dans les fonctions.
- Tester le SQL : la vérification GitHub le fait à chaque PR
  (`supabase/tests/shim-supabase.sql` puis `schema.sql` deux fois puis
  `essais.sql`, avec `PGOPTIONS='-c search_path=public,extensions'`).
  Ajouter un essai dans `essais.sql` pour toute nouvelle règle, et un test
  dans `vigie-nc/tests/` pour toute logique de l'appli (« npm test »).
- **Patrice lance lui-même le SQL** dans l'éditeur Supabase (les
  modifications par l'outil MCP lui demandent une validation). Avant de
  lui donner un script, le tester À BLANC sur la vraie base : un bloc
  `do $verif$ begin execute $schema_verif$ … $schema_verif$; execute
  $essais_verif$ … $essais_verif$; raise exception 'FIN'; end $verif$;`
  via `execute_sql` — l'exception finale annule tout, rien n'est gardé.

## Façon de travailler

- Une fonctionnalité = une branche + une pull request ; Patrice regarde
  l'aperçu Vercel sur son téléphone avant de fusionner.
- Ne pas fusionner dans `main` sans son accord.
- Après un changement visible, lui dire en une ou deux phrases quoi tester
  sur l'aperçu.
