// Dessin de ton cagou sur la carte (repère de ta position), selon ton niveau
// (lib/niveaux.ts). Texte SVG fixe : utilisé par la carte (Leaflet) et par
// le Profil. Le point bleu, en bas, marque ta position exacte ; la bulle du
// cagou est au-dessus, comme une épingle. Dessin original (cagou de lib/cagou.ts).

import { CAGOU_SVG_INTERIEUR } from "./cagou";

export const AVATAR_LARGEUR = 72;
export const AVATAR_HAUTEUR = 92;
// Centre du point bleu (= la position) dans le dessin.
export const AVATAR_POINT = { x: 36, y: 82 };

const LAGON = "#22B8B0";
const OR = "#E8A33D";
const GRIS = "#93B0AD";

/** Petite étoile à 4 branches (éclat du niveau Légende). */
function eclat(x: number, y: number, r: number, delaiS: number): string {
  const p = r * 0.3;
  return `<path class="eclat" style="animation-delay:${delaiS}s" d="M${x} ${y - r} L${x + p} ${y - p} L${x + r} ${y} L${x + p} ${y + p} L${x} ${y + r} L${x - p} ${y + p} L${x - r} ${y} L${x - p} ${y - p} Z" fill="${OR}"/>`;
}

/** Le cagou à ta position pour ce rang (0 = Poussin … 4 = Légende). */
export function avatarSvg(rang: number, largeur = AVATAR_LARGEUR): string {
  const r = Math.max(0, Math.min(4, Math.round(rang)));
  const couleur = r === 0 ? GRIS : r <= 2 ? LAGON : OR;
  const hauteur = (largeur * AVATAR_HAUTEUR) / AVATAR_LARGEUR;
  const cagou = r === 0 ? { x: 21, y: 21, t: 30 } : { x: 17, y: 17, t: 38 };
  const parts: string[] = [];

  // Légende : un second anneau en pointillés
  if (r === 4) parts.push(`<circle cx="36" cy="36" r="31" fill="none" stroke="${OR}" stroke-width="1.6" stroke-dasharray="3 4"/>`);
  // Sentinelle et plus : les ondes du logo de chaque côté
  if (r >= 2) {
    parts.push(
      `<path d="M10 22 A28 28 0 0 0 10 50" fill="none" stroke="${couleur}" stroke-width="2.4" stroke-linecap="round"/>`,
      `<path d="M62 22 A28 28 0 0 1 62 50" fill="none" stroke="${couleur}" stroke-width="2.4" stroke-linecap="round"/>`,
    );
  }
  // Tige et point bleu (la position exacte)
  parts.push(
    `<line x1="36" y1="58" x2="36" y2="76" stroke="${couleur}" stroke-width="2.4"/>`,
    `<circle cx="36" cy="82" r="6" fill="#3B82F6" stroke="#EAF6F4" stroke-width="2.5"/>`,
  );
  // Bulle et cagou
  parts.push(
    `<circle cx="36" cy="36" r="22" fill="#0E1C21" stroke="${couleur}" stroke-width="${r === 0 ? 1.8 : 2.8}"/>`,
    `<svg x="${cagou.x}" y="${cagou.y}" width="${cagou.t}" height="${cagou.t}" viewBox="0 0 64 64">${CAGOU_SVG_INTERIEUR}</svg>`,
  );
  // Gardien et Légende : la couronne
  if (r >= 3) {
    parts.push(
      `<path d="M25 15 L27 4 L32 9.5 L36 1.5 L40 9.5 L45 4 L47 15 Z" fill="${OR}" stroke="#081317" stroke-width="1.4" stroke-linejoin="round"/>`,
    );
  }
  // Légende : des éclats qui scintillent
  if (r === 4) parts.push(eclat(8, 10, 5, 0), eclat(65, 14, 4, 0.8), eclat(66, 62, 3.5, 1.6));

  const classe = r === 4 ? "vigie-avatar avatar-legende" : "vigie-avatar";
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${classe}" viewBox="0 0 ${AVATAR_LARGEUR} ${AVATAR_HAUTEUR}" width="${largeur}" height="${hauteur}" aria-hidden="true">${parts.join("")}</svg>`;
}
