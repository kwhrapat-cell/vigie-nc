// Dessin du cagou (mascotte de Vigie NC), en texte SVG : utilisé par le
// composant <Cagou> et par l'image du point route à partager (dessinée sur
// le téléphone, lib/point-route-partage.ts). Dessin original, d'après
// l'oiseau : plumage gris-bleu pâle, huppe en plumes souples vers
// l'arrière, gros œil rouge-brun, long bec orange à pointe claire,
// pattes orange.

export const CAGOU_VIEWBOX = "0 0 64 64";

export const CAGOU_SVG_INTERIEUR = `<g fill="#BFCCD2"> <path d="M33 13 C28 8.6 21 7.6 14.6 9.6 C12.9 10.2 13.2 12 14.9 12.2 C20.5 12.8 26 14.6 30.6 17.6 Z"/> <path d="M31 17.2 C25.8 14.3 19.2 14 13.4 16.4 C11.8 17.1 12.3 18.8 14 18.8 C19.3 18.9 24.5 20 29.4 22.4 Z"/> <path d="M30.4 21.6 C25.6 20.2 20.2 20.8 15.8 23.4 C14.4 24.2 15.1 25.7 16.7 25.5 C21 25 25.4 25.5 29.6 26.8 Z"/> </g> <g stroke="#E2572B" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"> <path d="M28.5 50 L27.5 59.5 M27.5 59.5 L24 60.8 M27.5 59.5 L30.5 61"/> <path d="M36 50.5 L37.5 59.5 M37.5 59.5 L34.5 61 M37.5 59.5 L41 60.6"/> </g> <path d="M18.5 43.5 C15 44.4 12.4 46 11.2 48.2 C14.4 48.6 17.6 48 20.2 46.6 Z" fill="#A3B4BB"/> <path d="M29 25 C28.2 17 32.4 11 39 11 C45 11 48.2 15.4 47.6 21.4 C47.3 25.2 45.6 28.2 44.8 31.4 C47.6 34 48.8 38.2 47.8 42.5 C46.3 49 39.7 52.5 31.5 52 C23 51.5 16.5 46.5 16.5 40 C16.5 33.2 22.2 29 29 25 Z" fill="#CDD9DE"/> <path d="M44.8 31.4 C47.6 34 48.8 38.2 47.8 42.5 C46.8 46.5 43.8 49.5 39.8 51 C41.2 46 41.6 40.5 40.2 35.5 Z" fill="#DFE8EB"/> <path d="M21.5 37 C24 32 31.5 31 37 34 C41.5 36.5 42.5 42 40 46.5 C34.5 48.5 27 47.5 22.5 44 C20.5 42 20.5 39.5 21.5 37 Z" fill="#A3B4BB"/> <g stroke="#7F9198" stroke-width="1.5" stroke-linecap="round" fill="none"> <path d="M26.5 37.5 C30 36.5 34 37 37.5 39.5"/> <path d="M25 41.5 C29 41 33.5 41.8 37.5 44"/> </g> <path d="M46.4 16.6 C51.4 17.8 56 20.8 59.2 25.6 C55 25.4 50.4 24.6 46.4 23.8 Z" fill="#E2572B"/> <path d="M54.6 21.6 C56.5 22.8 58 24.1 59.2 25.6 C57.5 25.6 55.9 25.4 54.3 25.1 Z" fill="#F4A53C"/> <path d="M46.8 20.6 C50.2 21.6 52.8 22.7 55 24" stroke="#B5402A" stroke-width="0.7" stroke-linecap="round" fill="none"/> <circle cx="40.4" cy="18.6" r="4" fill="#9A2E1F"/> <circle cx="40.7" cy="18.6" r="1.9" fill="#1A1A1A"/> <circle cx="41.7" cy="17.5" r="0.85" fill="#FFFFFF"/>`;

/** Le cagou en SVG complet (pour une image). */
export function cagouSvg(taille = 64): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CAGOU_VIEWBOX}" width="${taille}" height="${taille}">${CAGOU_SVG_INTERIEUR}</svg>`;
}
