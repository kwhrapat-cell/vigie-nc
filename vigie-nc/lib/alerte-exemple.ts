// Exemple d'alerte (bouton « Recevoir un exemple d'alerte » de l'écran
// Alertes) : une alerte de danger au format RÉEL, envoyée à ce téléphone
// seulement par /api/notif-test, pour voir comment elle s'affiche sur le
// téléphone et sur une montre connectée (texte coupé ? lisible ?).
//
// Le texte vient de alertPayload() (lib/push-server.ts) : si le format des
// vraies alertes change, l'exemple suit. Il est marqué « Essai » au début du
// titre (le premier mot lu, même sur une petite montre qui coupe la suite)
// et à la fin du message, pour que personne ne le prenne pour un vrai danger.
// Fichier sans dépendance : testé par tests/alerte-exemple.test.ts.

/** Signalement inventé pour l'exemple : rien n'est lu ni écrit dans la base. */
export const EXEMPLE_SIGNALEMENT = {
  id: "exemple",
  type: "inondation" as const,
  lieu: "RT1, Païta",
  // 1 confirmation = « Signalé par 2 personnes », comme une alerte qui vient de partir
  confirmations: 1,
  source_officielle: null,
  relais_source: null,
};

/** Distance d'exemple au lieu d'alerte (« à 3,2 km »). */
export const EXEMPLE_DISTANCE_M = 3200;

export const EXEMPLE_TITRE_DEBUT = "Essai · ";
export const EXEMPLE_FIN = " C'est un essai : rien de réel.";

/** Nom du lieu d'alerte reçu du téléphone : nettoyé, 30 caractères au plus (comme le champ de l'écran). */
export function nomLieuExemple(nom: unknown): string | null {
  if (typeof nom !== "string") return null;
  const n = nom.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 30);
  return n || null;
}

/** Marque une alerte au format réel comme un essai, ouvre l'écran Alertes au toucher. */
export function marquerEssai(alerte: { title: string; body: string }): {
  title: string;
  body: string;
  url: string;
  tag: string;
} {
  return {
    title: `${EXEMPLE_TITRE_DEBUT}${alerte.title}`,
    body: `${alerte.body}${EXEMPLE_FIN}`,
    url: "/alertes",
    // même étiquette à chaque essai : un nouvel essai remplace le précédent
    tag: "test-exemple",
  };
}
