"use client";

// Voix du mode conduite (synthèse vocale du navigateur, sur le téléphone :
// rien ne part sur Internet). On prend la voix française la plus naturelle
// que le téléphone propose ; on peut en choisir une autre dans les réglages
// du mode conduite. Le choix reste sur le téléphone.

export const CLE_VOIX_NOM = "vigie-nc:conduite-voix-nom";
// Un peu moins vite que la normale : plus clair en voiture.
export const VITESSE_VOIX = 0.95;

// Voix de meilleure qualité, selon les noms donnés par Android, iPhone,
// Chrome ou Edge (« Google français », « Amélie (Améliorée) », « Microsoft
// Denise Online (Natural) »…), et voix connues pour sonner très robot.
const MIEUX = /natural|neural|premium|enhanced|am[ée]lior[ée]e?|wavenet|online|en ligne/i;
const MOINS = /compact|espeak|eloquence|novelty|robot/i;

const PAYS: Record<string, string> = {
  FR: "France",
  CA: "Canada",
  BE: "Belgique",
  CH: "Suisse",
  LU: "Luxembourg",
};

type InfoVoix = Pick<SpeechSynthesisVoice, "name" | "lang" | "localService">;

/** Note d'une voix : plus elle est haute, plus la voix est naturelle (en principe). */
export function noteVoix(v: InfoVoix): number {
  let note = 0;
  if (MIEUX.test(v.name)) note += 5;
  if (/google/i.test(v.name)) note += 3;
  if (v.localService === false) note += 2;
  const lang = (v.lang ?? "").replace("_", "-").toLowerCase();
  if (lang === "fr-fr") note += 2;
  if (MOINS.test(v.name)) note -= 6;
  return note;
}

function disponible(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Les voix françaises du téléphone, la plus naturelle d'abord. */
export function voixFrancaises(): SpeechSynthesisVoice[] {
  if (!disponible()) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => (v.lang ?? "").toLowerCase().startsWith("fr"))
    .sort((a, b) => noteVoix(b) - noteVoix(a) || a.name.localeCompare(b.name));
}

/** Nom lisible : « Google français · France », « Amélie (Améliorée) · France ». */
export function libelleVoix(v: InfoVoix): string {
  const pays = PAYS[(v.lang ?? "").replace("_", "-").split("-")[1]?.toUpperCase() ?? ""];
  return pays ? `${v.name} · ${pays}` : v.name;
}

export function lireNomVoix(): string | null {
  try {
    return window.localStorage.getItem(CLE_VOIX_NOM);
  } catch {
    return null;
  }
}

export function ecrireNomVoix(nom: string | null): void {
  try {
    if (nom) window.localStorage.setItem(CLE_VOIX_NOM, nom);
    else window.localStorage.removeItem(CLE_VOIX_NOM);
  } catch {
    // stockage indisponible : le choix vaut pour cette fois
  }
}

/** La voix choisie dans les réglages si elle existe encore, sinon la plus naturelle. */
export function voixPreferee(): SpeechSynthesisVoice | null {
  const liste = voixFrancaises();
  const nom = lireNomVoix();
  return (nom && liste.find((v) => v.name === nom)) || liste[0] || null;
}

/** Dit le texte avec la voix préférée (à la suite des annonces déjà en cours). */
export function parler(texte: string): void {
  if (!disponible()) return;
  const u = new SpeechSynthesisUtterance(texte);
  const voix = voixPreferee();
  u.lang = voix?.lang || "fr-FR";
  if (voix) u.voice = voix;
  u.rate = VITESSE_VOIX;
  window.speechSynthesis.speak(u);
}
