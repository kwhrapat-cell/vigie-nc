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
- **Jamais de « route libre »** (décision de Patrice du 05/11/2026) : aucun
  texte, notification, voix ou consigne de l'IA ne dit que la route est
  libre, sûre, dégagée ou que « tout est calme ». On dit seulement ce qui
  est signalé (« Rien de signalé »), et « Rien de signalé » reste en couleur
  neutre, pas en vert.
- **Jamais « Confirmé » au nombre** (décision de Patrice du 06/11/2026) :
  des téléphones anonymes peuvent venir d'une même personne. Niveaux
  « Signalé » (1), « Plusieurs signalements » (2 et plus), « Vérifié »
  (source officielle seulement). Les textes disent « signalé N fois »,
  « depuis N téléphones », « revu il y a… », jamais « N personnes l'ont
  vu » ni un statut « confirmé » (le geste « confirmer en passant » reste).
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
                    la « fin d'alerte », zone ou trajet) et /api/notif-test (essai
                    vers ce téléphone seulement ; kind « exemple » = alerte de danger
                    au format réel marquée « Essai », lib/alerte-exemple.ts, bouton
                    « Recevoir un exemple d'alerte » de l'écran Alertes : montre connectée)
                  + /api/sante (moniteur : site + base ; RPC vigie_sante)
                  + /api/carte (carte sans réseau : ?fiche=1 = version en cours,
                    ?f=nc-AAAAMMJJ.pmtiles&debut&fin = octets du fichier, 4 Mo au plus,
                    lus dans la pré-version GitHub « carte-nc » ; morceaux gardés en
                    cache par le CDN de Vercel : un fichier daté ne change jamais)
                  + /carte-hors-ligne (Profil › Carte sans réseau : choisir Autour de moi
                    10 km / Mon trajet / Toute la Calédonie avec la taille exacte,
                    téléchargement avec progression, reprise toute seule si le réseau
                    coupe, « Carte prête », Mettre à jour, Supprimer ; ?auto=zone depuis
                    le rappel des annonces ; maquette validée par Patrice le 11/11/2026)
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
                  + /demo (démonstration Mont-Dore pour les mairies, lib/demo.ts ; rien
                    n'y mène depuis l'appli, noindex)
                  + /moderation (écran des modérateurs, code personnel ; lien discret en bas du Profil ;
                    onglet « Travaux » : date de fin des chantiers (moderation_chantier) ;
                    onglet « Historique » : tout ce qui a été publié (300 au plus), bouton
                    « Effacer (essai) » = suppression DÉFINITIVE (moderation_action
                    'effacer', décision de Patrice du 06/11/2026, pour les essais) ;
                    onglet « Annonces » : message pour toute la Calédonie, ou pour la commune
                    de l'agent ; agent d'une commune : bandeau « Tu modères pour… », ni
                    Chiffres, ni IA, ni alarme de sécurité, ni « Effacer » ;
                    onglet « Chiffres » : utilisateurs actifs, connectés en direct, provenances ;
                    onglet « IA » : essai du résumé automatique avec des témoignages inventés)
                  + /s/[id] (lien partagé d'un signalement : aperçu WhatsApp/Facebook via
                    opengraph-image.tsx, puis renvoi vers /?signalement=<id>&src=partage)
                  + error.tsx / global-error.tsx / not-found.tsx : écran EcranErreur
                    (cagou, Réessayer, Recharger, retour carte, 15/17/18 toujours
                    visibles) au lieu d'une page blanche ; l'erreur est signalée
  components/     AppShell (cadre de l'appli : largeur selon l'écran et la page),
                  BandeauPanneauReplie (accueil sur ordinateur, panneau replié),
                  CarteLive (accueil), LiveMap, HomeSheet (liste « À proximité » ;
                  se replie aux compteurs — barre du haut ou glissement vers le
                  bas — pour agrandir la carte, choix gardé sur le téléphone :
                  readListeRepliee de lib/preferences.ts), ReportDetail,
                  PositionPicker, BottomNav, ui.tsx (Logo, TypeTile, boutons…),
                  AidePosition (position bloquée ou introuvable, ouverte par
                  « Activer ma position » ou un rayon touché sans position :
                  consignes navigateur / Windows / Mac ou téléphone, bouton
                  « Choisir ma zone sur la carte »). LegendeCarte (bouton « ? »
                  sous les boutons de droite de la carte → feuille « Lire la
                  carte » : NC / 1-3-5 km et le cercle, couleurs, repères
                  (récent, pâle, pastille, toi, Ma zone), fiabilité, SOS, ta
                  position, heure de mise à jour ; AstuceCarte = astuce
                  « cercle + SOS » (à côté du bouton SOS dès 960 px, dans
                  HomeSheet en dessous : la carte du téléphone est trop
                  petite pour être recouverte), montrée une fois
                  après l'accueil et la bulle du « + », jamais en démo,
                  conduite, choix de zone ni fiche ouverte ; textes et
                  logique dans lib/legende.ts). LiveMap affiche « Chargement
                  de la carte… » tant que Leaflet n'est pas prêt (aussi dans
                  la page du serveur), puis, après 12 s ou si Leaflet ne
                  charge pas, un message + « Recharger la page » ; HomeSheet
                  dit « Chargement long… » + « Réessayer » de même ; noscript
                  dans app/layout.tsx. « Ma zone » (CarteLive,
                  décision de Patrice du 06/11/2026, ordinateurs des mairies) :
                  repère fixe au centre de la carte, on déplace la carte puis
                  « Choisir cet endroit » ; gardée sur l'appareil
                  (« vigie-nc:point-zone », lib/preferences.ts, refusée hors
                  Calédonie), repère lagon PIN_ZONE_SVG (LiveMap pointZone),
                  sert de centre à la carte et à la liste SEULEMENT sans vraie
                  position ; jamais pour voter, « Tu passes par là ? », les
                  travaux proches ni le mode conduite,
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
                  ligne orange « Pluie près de ta route : N endroits déjà inondés » s'il
                  pleut à 10 km (textePluieTrajet), déplié = liste dans l'ordre de la
                  route + « Déjà inondé ces 12 derniers mois » + « Voir sur la carte » (ligne
                  dans LiveMap, prop ligne/cadrerLigne ; ses signalements ajoutés à la
                  carte) ; lien ?trajet=1 = déplié + ligne cadrée ; sans trajet,
                  invitation fermable « vigie-nc:trajet-invite »),
                  ServiceWorkerRegister (enregistre public/sw.js, puis 15 s après
                  l'ouverture lui demande de préparer l'ouverture sans réseau :
                  message « prechauffer », une fois par version du site et par
                  jour au plus, « vigie-nc:prechauffe », jamais en démo ni en
                  économie de données),
                  MajCarteHorsLigne (dans le layout, rien à l'écran : 1 min après
                  l'ouverture, au plus une fois par jour, en Wi-Fi seulement
                  (navigator.connection, Android), remplace une carte sans réseau
                  de plus de 25 jours si une version plus récente existe ; réglage
                  « vigie-nc:carte-maj-auto »),
                  EnvoiEnAttente (dans le layout, rien à l'écran : envoie les
                  signalements faits sans réseau, lib/en-attente.ts, un par
                  minute au plus — limite de la base —, au retour du réseau, en
                  revenant sur l'appli ou toutes les 30 s ; jamais en démo),
                  EnAttenteCarte (accueil, dans HomeSheet sous le trajet :
                  « Gardé sur ton téléphone · vu à 14:05 », « Pas parti dans les
                  15 minutes… » + « C'est encore là, publier », refusé par la
                  base + message, « Effacer » ; « Parti : … est sur la carte »),
                  SessionInit (ouvre la session anonyme au démarrage),
                  ServiceIndisponible (affiché en prod si la base n'est pas
                  branchée : JAMAIS de mode démo en production, sauf la
                  démonstration Mont-Dore lancée à la main depuis /demo),
                  BandeauDemo (bandeau « Démonstration · données fictives » +
                  « Quitter » en haut de tous les écrans pendant la démo ;
                  classe mode-demo sur <html>, --demo-h retiré de la carte),
                  DemoLanceur (boutons de /demo),
                  ModStatsPanel (onglet Chiffres de /moderation ; résumé à copier dans
                  lib/chiffres-resume.ts : période réelle si le comptage a moins de 30 jours,
                  jamais « confirmé » ni « personnes », appareils),
                  ModIaPanel (onglet IA de /moderation : essai du résumé, rien n'est publié),
                  AnnonceBanner (bandeau des annonces générales sur l'accueil ;
                  AnnonceCard sert aussi d'aperçu ; sous une annonce Vigilance
                  ou Urgence, RappelCarte propose « Télécharger la carte » s'il
                  n'y a pas encore de carte sans réseau — décision de Patrice du
                  11/11/2026, dans l'annonce elle-même pour garder un seul
                  bandeau ; « Plus tard » = plus pour cette annonce,
                  « vigie-nc:rappel-carte-plus-tard »), ModAnnoncesPanel (onglet
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
                     (sauf la démonstration Mont-Dore : scénario fixe, demoAnnonces)
    demo.ts          démonstration Mont-Dore (décision de Patrice du 05/11/2026,
                     pour la mairie) : scénario FICTIF d'une matinée de fortes
                     pluies (SCENARIO_MONT_DORE, repères vérifiés, source
                     « Ville du Mont-Dore (exemple) », annonce vigilance),
                     position simulée à Boulari (DEMO_POSITION), vue d'ensemble
                     cadrée sur la commune (DEMO_EMPRISE). Active dans l'onglet
                     seulement (sessionStorage « vigie-nc:demo »), entrée par
                     /demo, sortie par « Quitter » ou en fermant l'onglet. Dans
                     l'onglet : supabase = null (lib/supabase.ts), aucune
                     écriture locale gardée (carte hors ligne, annonces, impact,
                     réglages : garde demoActive()), pas de vigilance Météo-France
                     ni de trajet personnel. useDemo() pour l'affichage (faux au
                     premier rendu, comme le serveur). Testé par tests/demo.test.ts
    useLiveReports.ts carte en direct (temps réel vigie_signal) + dernière
                     carte gardée pour l'affichage sans réseau (réseau perdu en
                     cours de route : « Pas de réseau : la carte date de… »)
    en-attente.ts    signalements faits SANS RÉSEAU, gardés sur le téléphone
                     (« vigie-nc:en-attente-v1 », 5 au plus, sans la photo) :
                     envoi tout seul dans les ENVOI_AUTO_MAX_MIN (15) minutes,
                     ensuite on demande si c'est encore là (la base date le
                     signalement à sa réception : jamais un vieux signalement
                     publié comme tout frais), effacé après 2 h ou la durée du
                     type si elle est plus courte. estErreurReseau (panne de
                     réseau ≠ refus de la base ; connexion_requise = réseau),
                     avecDelai (20 s : réseau saturé). Testé par
                     tests/en-attente.test.ts. /signaler : hors ligne ou panne
                     → gardé + écran « Gardé sur ton téléphone » ; s'il passe
                     après le délai, il est retiré de la file
    en-attente-envoi.ts envoi d'un signalement de la file (lieu cherché s'il
                     manque ; rate_limit = attendre ; refus = message gardé)
    pmtiles.ts       lecture d'un fichier PMTiles v3 sans dépendance (en-tête,
                     répertoires, numéros de tuiles Hilbert, gzip par
                     DecompressionStream)
    mvt.ts           lecture d'une tuile vectorielle (protobuf) sans dépendance
    carte-dessin.ts  dessin d'une tuile Protomaps sur un canvas (terre, sols, eau,
                     récifs, routes, bâtiments dès z14, noms des communes et
                     quartiers) ; couleurs du plan OSM, « Nuit » par le filtre CSS
    carte-plan.ts    logique pure de la carte sans réseau : tuiles d'un cercle
                     (zone 10 km) ou le long d'un trajet (1,5 km de chaque côté),
                     zooms 6 à 15, morceaux de 4 Mo au plus, index gardé sur le
                     téléphone (Float64Array), tailles affichées
    carte-hors-ligne.ts carte sans réseau côté téléphone : fiche (/api/carte),
                     plan (taille exacte avant téléchargement), téléchargement
                     (morceaux déjà gardés sautés = reprise), Cache Storage
                     « carte-hors-ligne-v1 » (PAS « vigie-… » : le service worker
                     efface ces caches-là), liste « vigie-nc:carte-hors-ligne-v1 »,
                     lecture d'une tuile (zone, puis trajet, puis NC).
                     Mesuré le 11/11/2026 : zone 10 km ≈ 1,5 Mo, trajet ≈ 2 Mo,
                     toute la Calédonie ≈ 23 Mo (zoom 15)
    couche-hors-ligne.ts couche Leaflet (GridLayer + canvas, sur-zoom net au-delà
                     de z15) ; brancherCarteHorsLigne l'ajoute SOUS le plan dès que
                     le téléphone est hors ligne ou que 2 tuiles du plan échouent
                     en 20 s (LiveMap, PositionPicker ; jamais en démo)
    trajet-hors-ligne.ts dernier point du trajet favori gardé
                     (« vigie-nc:trajet-dernier-point », 12 h, même trajet) :
                     sans réseau, TrajetResume montre la liste d'alors avec son
                     heure et la mémoire des inondations, pastille « Hors
                     ligne », JAMAIS « Rien de signalé » ni « en ce moment »
                     d'après la copie (tests/trajet-hors-ligne.test.ts)
    useAnnonces.ts   annonces générales en direct (temps réel
                     vigie_annonce_signal) + copie pour l'affichage sans réseau
    rafraichissement.ts rythme du filet de sécurité de ces deux-là (sobriété,
                     décision de Patrice du 05/11/2026) : rien quand l'appli
                     n'est pas à l'écran (rechargement en revenant) ; carte
                     1 min sans direct / 3 min avec, annonces 2 / 6 min ;
                     expirés retirés sur le téléphone toutes les 30 s ;
                     rattrapage quand le direct se rebranche. PAS de délai
                     ajouté aux rechargements déclenchés par le direct
                     (refusé par Patrice : les signalements doivent arriver
                     tout de suite)
    reliability.ts   niveaux : Signalé (1 signalement) / Plusieurs signalements
                     (2 et plus ; « N signalements » dans les petites pastilles,
                     libelleCourt) / Vérifié (source officielle), + « Relayé ».
                     Clés « signalement » / « plusieurs » / « verifie ». Plus de
                     « À confirmer » ni de « Confirmé » au nombre (décision du
                     06/11/2026). Alertes et mode conduite : « dangers signalés
                     plusieurs fois ou vérifiés » (règle inchangée : 2e
                     signalement ou source officielle)
    fraicheur.ts     fraîcheur : dernière nouvelle = création ou last_confirmed_at
                     (« Toujours là » ou doublon fusionné) ; « ancien » = plus de
                     la moitié de sa durée (REPORT_TYPE_LIFETIME_MIN) sans
                     nouvelle, 30 min au moins, jamais SOS ni source officielle :
                     repère grisé (LiveMap .is-ancien, redessiné chaque minute),
                     « · ancien » dans la liste, ligne « Ancien » dans la fiche ;
                     fiche : heure exacte (heureSignalement), dernière
                     confirmation, et statutFin (expiré / terminé / retiré)
    sos.ts           SOS : lien de position (Google Maps), message avec ou sans
                     position, lien sms: vers les contacts (null sans numéro).
                     Écran /sos : phrase sous le bouton + « Comment marche le
                     SOS » (SOS_EXPLICATION de legende.ts, aussi dans la
                     légende) ; position introuvable → « Prévenir mes contacts
                     sans position » ; sans contact → le dit. ⚠️ À tester sur
                     iPhone avec 2 contacts (lien sms: à plusieurs numéros)
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
                     notifications (avant départ, « rien de signalé », fin d'alerte zone
                     ou trajet, pluie et zones inondables), trajet gardé sur le téléphone
                     (« vigie-nc:trajet-v1 », option calme,
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
    legende.ts       légende de la carte et astuce « cercle + SOS » : textes
                     (testés : jamais « route libre », SOS et position conformes
                     au code), REPERE_RECENT_MIN (halo de LiveMap),
                     CHARGEMENT_LENT_MS, libellé « Mis à jour à », astuce
                     « vigie-nc:astuce-carte » (après ACCUEIL_KEY de tuto.ts et
                     l'astuce du « + »), LEGENDE.confiance (qui publie, comment
                     c'est vérifié et corrigé), LEGENDE.position (ce qui part
                     vraiment : base au moment de la recherche, tuiles = zone
                     affichée, Nominatim à l'ouverture de Signaler ; vérifié par
                     un audit réseau de vigie-nc.com le 06/11/2026, à garder
                     conforme avec /confidentialite). useLenteur.ts : vrai après
                     ce délai
    annonces-zone.ts annonces d'une commune : annoncesPourMoi (le téléphone garde
                     celles dont le périmètre contient sa position, sinon « Ma
                     zone » ; sans centre, seulement toute la Calédonie ; l'annonce
                     ouverte depuis une notification reste), libelleZone, textePerimetre
                     (tests/annonces-zone.test.ts). Rien de plus n'est envoyé à la base
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
                   (pages réseau d'abord, fichiers /_next/static, tuiles OSM
                   vues — jamais de téléchargement en masse, interdit par
                   OpenStreetMap) ; « prechauffer » copie /, /signaler et /sos
                   avec leurs fichiers (A_PREPARER) pour qu'ils s'ouvrent sans
                   réseau même jamais ouverts. VERSION inchangée = tuiles gardées
  assets/fonts/    Inter réduite aux caractères latins (image d'aperçu de /s/[id]), licence OFL.txt
  tests/           tests de la logique (node:test, Node 22, AUCUNE dépendance :
                   « npm test », chargeur tests/chargeur.mjs pour « @/ » et les
                   imports sans extension). Fichiers de lib/ testés : imports de
                   types avec « type » (sinon Node plante). cas-conduite.json =
                   cas communs joués aussi par android/…/ConduiteCasTest.kt
  supabase/schema.sql  schéma complet, ré-exécutable
  supabase/functions/purge-photos  fonction Supabase (Deno) : photos > 7 jours
  supabase/tests/  shim-supabase.sql (faux Supabase pour Postgres + PostGIS)
                   et essais.sql (45 essais : identité, votes, SOS, photos, droits,
                   type « feu », chiffres d'utilisation, annonces générales, chantiers,
                   témoignages et résumé IA, point route, erreurs des téléphones,
                   trajet favori, historique et effacement, appareils de l'équipe,
                   périmètre d'une commune)
.github/workflows/verification.yml  à chaque PR : tests de la logique (Node 22),
                   build + types, schema.sql deux fois puis essais.sql sur
                   Postgres + PostGIS
.github/workflows/carte.yml  carte sans réseau : chaque mois (le 3, et à la demande),
                   découpe la Calédonie (163.5,-22.9,168.2,-19.4, zoom 15) dans la
                   carte du monde Protomaps du jour avec l'outil pmtiles (version
                   figée), contrôle, puis publie nc-AAAAMMJJ.pmtiles et nc.json
                   (la fiche, après le fichier) dans la pré-version « carte-nc » ;
                   garde les 2 dernières cartes. Données © OpenStreetMap (ODbL)
.github/workflows/sauvegarde.yml  sauvegarde chiffrée de la base chaque nuit
                   (voir « Sauvegardes » dans Base de données)
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
- **Polices rangées dans le site** (`next/font/local` dans app/layout.tsx,
  fichiers woff2 « latin » d'Inter, Space Grotesk et IBM Plex Mono dans
  assets/fonts/, licences OFL ; variables `--police-texte` / `--police-titre`
  / `--police-mono`) : jamais de lien vers Google Fonts (le téléphone
  enverrait son adresse IP à Google), et plus de `next/font/google` (la
  construction téléchargeait chez Google : mise en ligne ratée le
  10/11/2026 quand Google n'a pas répondu).
- **Serveur de l'appli à Sydney** (`vigie-nc/vercel.json`, `regions` =
  `syd1`, décision de Patrice du 10/11/2026) : près de la base Supabase
  (Sydney) et de la Calédonie, au lieu de Washington (`iad1` par défaut).
  Une seule région possible sur l'offre gratuite de Vercel. Écrit dans
  `LEGAL.hebergeur.lieuServeur` (/confidentialite).
  Canvas : `famillePolice()` de lib/point-route-dessin.ts.
- Mobile d'abord (largeur 380 px), cibles tactiles ≥ 44 px.
- **Tablette et ordinateur** (le téléphone ne doit pas changer) :
  `components/AppShell.tsx` + `.app-shell` de `globals.css`. Dès 768 px
  (`md:`) : colonne de 672 px pour les écrans de lecture et de saisie, la
  carte de l'accueil sur toute la largeur, feuilles du bas en fenêtres
  centrées. Dès 960 px (`lg:`, réglé dans tailwind.config.ts : la « version
  pour ordinateur » de Chrome sur téléphone fait 980 px) : BottomNav devient
  un rail à gauche (`--rail` = 88 px) sauf à l'accueil (`rail={false}`), qui
  suit la maquette « E · Vue d'ensemble » validée par Patrice le 31/10/2026
  pour les mairies et la DITTT : grille à deux colonnes (CarteLive : en-tête
  avec bouton « Replier », menu NavOrdi en onglets, bandeaux puis HomeSheet à
  gauche, carte à droite ; l'ordre dans la page reste celui du téléphone).
  Panneau replié (« vigie-nc:panneau-replie », readPanneauReplie) : la
  carte prend tout l'écran, il reste BandeauPanneauReplie (logo, chiffres,
  « Liste et menu »). Sur la carte : vigilance Météo-France (VigilanceMeteo)
  sous le choix de la vue, bouton plein écran (PleinEcranButton), pas de
  mode conduite. Vue « toute la Calédonie » par défaut sur un ordinateur à
  souris tant qu'aucune zone n'est choisie (`readZoneChoice(parDefaut)`,
  `estOrdiSouris`). Fiche en panneau à droite de la carte. Les @media de
  globals.css suivent ces valeurs.
  Boutons + / − sur les cartes seulement à la souris
  (`(hover: hover) and (pointer: fine)`).
- **Captures d'écran** (npm souvent bloqué dans l'espace de travail de
  Claude) : pousser la branche de travail aussi sous `captures/<nom>` ;
  `.github/workflows/captures.yml` construit l'appli en mode démo et
  photographie les écrans à 380, 768, 980 (Chrome « version pour
  ordinateur » sur téléphone), 1024, 1280 et 1920 px
  (`.github/captures/captures.mjs`), puis pousse images et journaux sur
  `resultats-captures/<numéro du run>` (à lire avec `git fetch` + `git
  archive`, à supprimer ensuite avec la branche `captures/`).
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
- **Périmètres des communes** (décision de Patrice du 10/11/2026) : table
  privée `perimetres` (cercle : `lat`, `lng`, `rayon_m` de 1 à 60 km),
  `moderateurs.perimetre_id` (nul = équipe Vigie NC, toute la Calédonie).
  Éditeur SQL : `vigie_ajouter_perimetre(id, nom, lat, lng, rayon_km)`,
  `vigie_ajouter_agent(nom, code, perimetre)` (créé directement limité),
  `vigie_limiter_moderateur(nom, perimetre ou null)`. Un agent : ne voit
  (`moderation_liste`) et ne modère (`moderation_action`,
  `moderation_chantier` → `hors_perimetre`) que dans son cercle ; jamais
  `effacer` ; chiffres, erreurs, essai IA et alarme refusés
  (`vigie_moderateur_equipe` → `reserve_equipe`). `moderation_verifier`
  renvoie `perimetre` (affiché par /moderation). Un périmètre utilisé ne
  peut pas être supprimé (sinon l'agent passerait à toute la Calédonie).
- Alarme de sécurité : tout changement de la table `moderateurs` (ajout,
  code, accès retiré/rétabli, renommage, périmètre changé, suppression,
  vidage ; pas les connexions), et le centre ou le rayon d'un périmètre
  utilisé (`trg_vigie_alarme_perimetres`) : `vigie_envoyer_alarme` le note
  dans `moderation_journal` et l'envoie par `pg_net` à
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
  **Appareils de l'équipe jamais comptés** (décision de Patrice du
  06/11/2026) : `moderation_verifier` appelle `vigie_noter_appareil_equipe`
  (table privée `vigie_appareils_equipe`, empreinte de session, effacée
  après 1 an sans passage) ; `vigie_presence` les ignore, et ce qui avait
  été compté est retiré une fois (jours d'activité, un « nouveau » ; pas
  la provenance ni les records). `modVerify` ouvre la session avant.
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
  abonnement ; `p_calme` = point avant départ même sans danger, envoyé
  seulement s'il est coché). Mémoire : `trajet_memoire_inondations(p_points)`
  (ouvert à tous, rien d'enregistré : inondations des 12 derniers mois dans
  le couloir, regroupées au plus ancien signalement à 400 m, « fois » = jours
  différents ; `pluie_en_cours` = inondation ou météo en cours à 10 km).
  Couloir 300 m. `notif_destinataires` ajoute les trajets dont
  l'heure est en cours (30 min avant → 1 h après un départ,
  `vigie_trajet_departs`, heure de Nouméa) ; `push_envois.trajet_at` note
  l'annonce au titre du trajet. Avant départ : pg_cron
  `vigie-trajets-avant-depart` (5 min) → `vigie_trajets_appeler` (rien si
  aucun départ dans les 30 min) → `/api/trajet` → `trajet_avant_depart`
  (une fois par départ et par jour, `verifie_aller` / `verifie_retour` ;
  s'il y a un danger confirmé, ou toujours avec `calme`, avec `surveiller` =
  le reste). Fin d'alerte (zone ET trajet) : déclencheur
  `trg_vigie_fin_alerte` (resolved_at rempli, danger envoyé à quelqu'un dans
  les 12 h, `push_envois.sent_at` ou `trajet_at`) → `/api/notifier`
  `{fin: true}` → `notif_fin_destinataires` (`fin_envoyee_at`, `sur_trajet`,
  `nom` : texte « sur ton trajet » / « près de « Maison » ») ; un danger
  qui expire seul ne déclenche rien.
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
  table privée `annonces`, lecture par `annonces_actives()` (sans session ;
  5 pour toute la Calédonie + 30 des communes, chacune avec `zone` = le
  périmètre ou null). Annonce publiée par un agent = `perimetre_id` de son
  périmètre (choisi par la base) : le téléphone trie lui-même
  (lib/annonces-zone.ts), la notification ne part qu'aux abonnements dont
  la zone d'alerte touche le cercle (`vigie_zone_touche_perimetre`), l'agent
  ne voit et ne retire que les siennes, garde-fous comptés par périmètre.
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
  Erreurs du navigateur ignorées (`__firefox__`, `window.ethereum`,
  `user-script:`) des deux côtés : `IGNOREES` de lib/erreurs-texte.ts
  (message ET pile) et `vigie_erreur_signaler` — listes alignées.
- **Sauvegardes** (décision de Patrice du 10/11/2026 : l'offre gratuite de
  Supabase n'en garde aucune) : `.github/workflows/sauvegarde.yml`, chaque
  nuit à 2 h 41 (Nouméa) et à la demande. `pg_dump` 17 du schéma public
  (tables, fonctions, droits, données ; sans propriétaire), par l'adresse
  « Session pooler » (secret `SUPABASE_DB_URL`), vérifiée (`pg_restore
  --list` : 20 tables et 50 fonctions au moins), chiffrée AES-256 par gpg
  (secret `SAUVEGARDE_MOT_DE_PASSE`, 20 caractères au moins, jamais dans le
  dépôt), contrôlée par déchiffrement, puis gardée 30 jours en artifact. Le
  dépôt est public : **jamais de copie en clair** (ni artifact, ni commit,
  ni journal). Pas les photos (7 jours), ni les sessions anonymes, ni les
  tâches pg_cron (schéma cron). Restaurer, à faire avec Claude, d'abord dans
  un projet Supabase neuf : télécharger l'artifact, `gpg -d
  vigie-nc-….dump.gpg > sauvegarde.dump`, activer postgis (schéma
  extensions), pg_net et pg_cron, `pg_restore --no-owner -d "<adresse>"
  sauvegarde.dump` (les déclencheurs sont créés après les données : rien
  n'est envoyé pendant la restauration), puis relancer la partie pg_cron de
  schema.sql.
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
- **Depuis son téléphone, un copier-coller s'arrête vers 20 Ko** (constaté
  le 30/10/2026 : seule la 1re moitié d'un script de 35 Ko est passée, sans
  message clair). Pour un changement de base, lui donner des scripts de
  moins de 20 Ko chacun (découpés en 1/2, 2/2…, chacun ré-exécutable), lien
  raw.githubusercontent.com, et vérifier ensuite dans la base que tout est
  là (tables, fonctions, droits, tâches pg_cron).

## Façon de travailler

- Une fonctionnalité = une branche + une pull request ; Patrice regarde
  l'aperçu Vercel sur son téléphone avant de fusionner.
- Ne pas fusionner dans `main` sans son accord.
- Après un changement visible, lui dire en une ou deux phrases quoi tester
  sur l'aperçu.
