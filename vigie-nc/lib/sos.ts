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

/**
 * Lien « sms: » vers les contacts d'urgence, message déjà écrit ; `null`
 * sans numéro (aucun SMS ne peut être préparé).
 */
export function lienSms(numeros: readonly string[], message: string): string | null {
  const nums = numeros.map((n) => n.replace(/[^\d+]/g, "")).filter((n) => n.length >= 6);
  if (nums.length === 0) return null;
  return `sms:${nums.join(",")}?body=${encodeURIComponent(message)}`;
}
