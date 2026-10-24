# Vigie NC — appli Android de test

Prototype pour tester le **mode conduite en arrière-plan** :

- le site vigie-nc.com dans l'appli, avec une barre « Mode conduite » en haut ;
- une fois démarré, le mode conduite tourne **même écran éteint** et pendant la
  musique : notification permanente avec le prochain danger, boutons
  « Signaler » et « Arrêter » ;
- annonces vocales des dangers confirmés devant toi (à la portée choisie, puis
  à 500 m), la musique baisse le temps de l'annonce ;
- bulle flottante par-dessus les autres applis si le téléphone l'accepte
  (Android Go la refuse : la notification suffit).
- **Réglages** : portée de la voix (3, 5 ou 10 km), voix, trafic dense ;
- **Démarrer tout seul en voiture** (désactivé par défaut) : la reconnaissance
  d'activité de Google lance le mode conduite quand on monte en voiture et
  l'arrête à la sortie (ou après 15 min sans bouger). Demande la position
  « Toujours » et l'« Activité physique ». Sur Xiaomi : autoriser le démarrage
  automatique et la batterie « Pas de restrictions ».

La logique « danger devant moi » est la même que celle du site
(`vigie-nc/lib/conduite.ts` ↔ `app/src/main/java/com/vigienc/app/Conduite.kt`).

## Fabrication

Automatique sur GitHub (`.github/workflows/android.yml`). Lien direct, toujours
le même, vers la dernière version :
https://github.com/kwhrapat-cell/vigie-nc/releases/download/app-test/vigie-nc-test.apk

## À savoir

- **Version de test** : signée avec une clé de test (`app/vigie-nc-test.p12`),
  chiffrée par un mot de passe qui n'est PAS dans le dépôt : il est dans le
  secret GitHub `ANDROID_KEYSTORE_PASSWORD` (Settings › Secrets and variables
  › Actions). Sans ce secret, l'APK est construit mais pas publié. La clé ne
  servira jamais pour le Play Store.
- **Clé changée le 24/10/2026** (l'ancienne, avec son mot de passe, était
  lisible dans le dépôt public) : pour passer à la nouvelle version, il faut
  **désinstaller une fois** l'ancienne appli de test, puis installer celle du
  lien. Ensuite, les mises à jour s'installent par-dessus comme avant.
  Secret ajouté dans GitHub le 24/10/2026.
- Les **alertes de l'écran Alertes** (notifications du site) ne marchent pas
  dans l'appli : garder Chrome pour elles pendant le test.
- Pour une **photo** dans un signalement, l'appli ouvre la galerie (pas encore
  l'appareil photo directement).
- Avant une publication sur le Play Store : mettre à jour `/confidentialite`
  (position utilisée par le service de conduite, sur le téléphone).
