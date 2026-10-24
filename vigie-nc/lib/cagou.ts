// Dessin du cagou (mascotte de Vigie NC), en texte SVG : utilisé par le
// composant <Cagou> et par l'image du point route à partager (dessinée sur
// le téléphone, lib/point-route-partage.ts). Dessin original.

export const CAGOU_VIEWBOX = "0 0 64 64";

export const CAGOU_SVG_INTERIEUR = `<g fill="none" stroke="#B9C6CA" stroke-width="2.6" stroke-linecap="round"> <path d="M27 15 C21 11 15 11 9 14" /> <path d="M28 17 C22 15 16 16 11 19.5" /> <path d="M29 19.5 C24 19 19 21 15 24.5" /> </g> <g stroke="#E8622F" stroke-width="2.4" stroke-linecap="round" fill="none"> <path d="M30 50 L28.5 59 M28.5 59 L25 60.5 M28.5 59 L31 60.8" /> <path d="M37 50 L38 59 M38 59 L35 60.8 M38 59 L41.5 60.3" /> </g> <path d="M20 37 C20 27 27 23 34 23 C43 23 49 30 49 39 C49 47 43 52 34 52 C26 52 20 46 20 37 Z" fill="#D5DEE1" /> <path d="M27 36 C29 31 36 30 41 33 C46 36 48 42 46 47 C41 49 34 48 30 44 C27.5 41.5 26.5 38.5 27 36 Z" fill="#9DAEB4" /> <g stroke="#7F9198" stroke-width="1.6" stroke-linecap="round" fill="none"> <path d="M32 36.5 C35 36 38 37 40.5 39" /> <path d="M31.5 40.5 C35 40 38.5 41.5 41.5 43.5" /> </g> <circle cx="34" cy="21" r="9.5" fill="#D5DEE1" /> <path d="M42 19.5 C47 19.8 51 21 53.5 22.6 C50.5 23.6 46.5 24 42.3 23.4 Z" fill="#E8622F" /> <circle cx="37.6" cy="19.6" r="3" fill="#B5402A" /> <circle cx="37.6" cy="19.6" r="1.5" fill="#1A1A1A" /> <circle cx="38.4" cy="18.8" r="0.7" fill="#fff" />`;

/** Le cagou en SVG complet (pour une image). */
export function cagouSvg(taille = 64): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CAGOU_VIEWBOX}" width="${taille}" height="${taille}">${CAGOU_SVG_INTERIEUR}</svg>`;
}
