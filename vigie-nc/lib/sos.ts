// SOS (app/sos/page.tsx) : message et lien SMS préparés SUR LE TÉLÉPHONE.
// Rien n'est envoyé à Vigie NC ni publié : le SMS s'ouvre déjà écrit et
// c'est la personne qui l'envoie (décision de Patrice du 18/10/2026).
// Textes expliqués avant usage : SOS_EXPLICATION de lib/legende.ts.

/** Lien de la position (ouvert par la personne qui reçoit le SMS). */
export function lienPosition(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/** Texte du SMS : avec la position, ou sans si le téléphone ne la trouve pas. */
export function messageSos(lien: string | null): string {
  return lien
    ? `SOS — j'ai besoin d'aide, voici ma position : ${lien}`
    : "SOS — j'ai besoin d'aide. Mon téléphone n'a pas pu donner ma position : appelle-moi.";
}

/** iPhone et iPad (un iPad récent se présente comme un Mac tactile). */
export function estAppareilApple(ua: string, pointsTactiles = 0): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && pointsTactiles > 1);
}

function surAppareilApple(): boolean {
  if (typeof navigator === "undefined") return false;
  return estAppareilApple(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

/**
 * Lien « sms: » vers les contacts d'urgence, message déjà écrit ; `null`
 * sans numéro (aucun SMS ne peut être préparé).
 *
 * L'iPhone ne lit pas le lien d'Android : avec « sms:A,B?body=… », il ne
 * garde que le PREMIER numéro (audit mobile du 11/11/2026). Pour lui :
 * « sms://open?addresses=A,B&body=… » à plusieurs, « sms:A&body=… » seul.
 */
export function lienSms(
  numeros: readonly string[],
  message: string,
  apple: boolean = surAppareilApple(),
): string | null {
  const nums = numeros.map((n) => n.replace(/[^\d+]/g, "")).filter((n) => n.length >= 6);
  if (nums.length === 0) return null;
  const texte = encodeURIComponent(message);
  if (!apple) return `sms:${nums.join(",")}?body=${texte}`;
  if (nums.length === 1) return `sms:${nums[0]}&body=${texte}`;
  return `sms://open?addresses=${nums.join(",")}&body=${texte}`;
}
