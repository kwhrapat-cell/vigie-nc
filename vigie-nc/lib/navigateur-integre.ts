// Lien ouvert depuis Facebook, Messenger, Instagram ou TikTok : la page
// s'affiche dans le petit navigateur de cette appli, pas dans Chrome ou
// Safari. Là, on ne peut ni installer Vigie NC ni recevoir les alertes :
// il faut d'abord ouvrir le lien dans le vrai navigateur.

export type AppliIntegree = "Messenger" | "Instagram" | "Facebook" | "TikTok";

/** Nom de l'appli dont le navigateur intégré affiche la page, sinon null. */
export function appliIntegree(ua: string = typeof navigator === "undefined" ? "" : navigator.userAgent): AppliIntegree | null {
  // Messenger d'abord : son repère contient aussi celui de Facebook.
  if (/MessengerForiOS|Orca-Android|MessengerLite/i.test(ua)) return "Messenger";
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/FBAN|FBAV|FB_IAB|FBIOS|FB4A/.test(ua)) return "Facebook";
  if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) return "TikTok";
  return null;
}
