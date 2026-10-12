/**
 * Installation de Vigie NC sur l'écran d'accueil du téléphone (« PWA »).
 *
 * - Android (Chrome, Opera, Samsung…) : le navigateur envoie l'événement
 *   `beforeinstallprompt`, qu'on garde pour proposer un bouton « Installer ».
 *   Il arrive dès le chargement, souvent avant l'ouverture du Profil : un
 *   petit script dans `app/layout.tsx` (INSTALL_CAPTURE_SCRIPT) le capte tout
 *   de suite et le range dans `window`. On laisse le navigateur afficher sa
 *   propre suggestion d'installation s'il le souhaite.
 * - iPhone : pas d'événement, il faut passer par Partager → « Sur l'écran
 *   d'accueil » ; on l'explique.
 * - Navigateur intégré de Facebook / Messenger / Instagram : impossible
 *   d'installer, il faut d'abord ouvrir le lien dans le vrai navigateur.
 */

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type Platform = "ios" | "android" | "inapp" | "autre";

const CHANGE = "vigie-nc:installation";

type VigieWindow = Window & { __vigieInstall?: InstallPromptEvent | null; __vigieInstalled?: boolean };
const w = () => window as VigieWindow;

/** Script exécuté avant React, pour ne pas rater l'événement d'installation. */
export const INSTALL_CAPTURE_SCRIPT = `(function(){
  window.addEventListener("beforeinstallprompt", function (e) { window.__vigieInstall = e; window.dispatchEvent(new Event("${CHANGE}")); });
  window.addEventListener("appinstalled", function () { window.__vigieInstalled = true; window.__vigieInstall = null; window.dispatchEvent(new Event("${CHANGE}")); });
})();`;

export function onInstallChange(cb: () => void) {
  window.addEventListener(CHANGE, cb);
  return () => window.removeEventListener(CHANGE, cb);
}

export function canPromptInstall() {
  return Boolean(w().__vigieInstall);
}

/** Ouvre la fenêtre d'installation du navigateur (Android). */
export async function promptInstall(): Promise<boolean> {
  const e = w().__vigieInstall;
  if (!e) return false;
  w().__vigieInstall = null; // l'événement ne sert qu'une fois
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === "accepted") w().__vigieInstalled = true;
  window.dispatchEvent(new Event(CHANGE));
  return outcome === "accepted";
}

/** Vrai quand l'appli est installée ou ouverte depuis son icône. */
export function isInstalled() {
  if (w().__vigieInstalled) return true;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(standalone || iosStandalone);
}

export function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|FB_IAB|Messenger|Instagram/i.test(ua)) return "inapp";
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || iPadOS) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "autre";
}

/** Enregistre le service worker (page « Pas de réseau », notifications plus tard). */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost") return;
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
    // Sans service worker l'appli marche quand même ; rien à signaler.
  });
}
