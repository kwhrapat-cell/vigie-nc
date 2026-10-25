// Contraste des couleurs (règle WCAG) : lisibilité au soleil.
// Sert à choisir la couleur du texte et des icônes posés sur une couleur de
// type ou de catégorie (tuiles, repères de la carte).

const BLANC = "#FFFFFF";
const FONCE = "#081317"; // = jeton « void »

/** Luminance relative d'une couleur « #RRGGBB » (0 = noir, 1 = blanc). */
export function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const canal = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
}

/** Rapport de contraste entre deux couleurs (1 à 21). */
export function contraste(a: string, b: string): number {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (clair + 0.05) / (sombre + 0.05);
}

// En dessous de 3 pour 1, même une icône ou un gros texte se lit mal.
export const CONTRASTE_MIN = 3;

/**
 * Couleur du texte et des icônes sur un fond coloré : blanc, sauf sur les
 * couleurs claires (orange, jaune) où le blanc passe sous 3 pour 1 → foncé.
 * Les couleurs déjà correctes en blanc ne changent pas (le look reste le même).
 */
export function couleurSur(fond: string): string {
  return contraste(BLANC, fond) >= CONTRASTE_MIN ? BLANC : FONCE;
}
