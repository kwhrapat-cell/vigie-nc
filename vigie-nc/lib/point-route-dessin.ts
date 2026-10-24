// Dessin de l'image « Point route » à partager (1080 × 1350, le format
// carré-haut de WhatsApp et Facebook), sur un canvas, sur le téléphone.
// Aucune dépendance : reçoit des données prêtes et des images chargées
// (préparées par lib/point-route-partage.ts).

export const IMAGE_L = 1080;
export const IMAGE_H = 1350;
// Lignes d'événements au plus (les autres sont comptés).
export const IMAGE_LIGNES_MAX = 5;

export interface LigneDessin {
  couleur: string; // couleur du type
  icone: CanvasImageSource | null; // pictogramme blanc
  titre: string; // « Accident »
  detail: string; // « RT1, Dumbéa · il y a 25 min »
  fiabilite: string; // « Confirmé »
  couleurFiabilite: string;
}

export interface DonneesDessin {
  quand: string; // « samedi 24 octobre · 12 h 10 »
  zone: string; // « Dumbéa et alentours · 5 km »
  compteurs: { n: number; texte: string; couleur: string }[];
  lignes: LigneDessin[];
  autres: number; // événements non affichés
  cagou: CanvasImageSource | null;
  site: string; // « vigie-nc.com »
}

const C = {
  fond: "#081317",
  panel: "#0E1C21",
  ligne: "#1E363D",
  lagon: "#22B8B0",
  mist: "#EAF6F4",
  mistDim: "#93B0AD",
  terre: "#E8622F",
};
const TITRE = '"Space Grotesk", "Inter", sans-serif';
const TEXTE = '"Inter", sans-serif';
const M = 72; // marge

function rectArrondi(ctx: CanvasRenderingContext2D, x: number, y: number, l: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + l, y, x + l, y + h, r);
  ctx.arcTo(x + l, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + l, y, r);
  ctx.closePath();
}

/** Coupe le texte avec « … » pour qu'il tienne dans la largeur. */
function couper(ctx: CanvasRenderingContext2D, texte: string, largeur: number): string {
  if (ctx.measureText(texte).width <= largeur) return texte;
  let t = texte;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > largeur) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

export function dessinerPointRoute(ctx: CanvasRenderingContext2D, d: DonneesDessin): void {
  const L = IMAGE_L;
  const H = IMAGE_H;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // Fond + bande lagon → terre rouge en haut
  ctx.fillStyle = C.fond;
  ctx.fillRect(0, 0, L, H);
  const bande = ctx.createLinearGradient(0, 0, L, 0);
  bande.addColorStop(0, C.lagon);
  bande.addColorStop(1, C.terre);
  ctx.fillStyle = bande;
  ctx.fillRect(0, 0, L, 12);

  // En-tête : VIGIE NC + date
  let y = 112;
  ctx.font = `700 54px ${TITRE}`;
  ctx.fillStyle = C.mist;
  ctx.fillText("VIGIE", M, y);
  const lVigie = ctx.measureText("VIGIE ").width;
  ctx.fillStyle = C.lagon;
  ctx.fillText("NC", M + lVigie, y);
  ctx.font = `500 30px ${TEXTE}`;
  ctx.fillStyle = C.mistDim;
  ctx.textAlign = "right";
  ctx.fillText(d.quand, L - M, y - 6);
  ctx.textAlign = "left";

  // Titre + zone, cagou à droite (en grand au milieu s'il n'y a rien)
  const vide = d.lignes.length === 0;
  const tailleCagou = 170;
  if (d.cagou && !vide) ctx.drawImage(d.cagou, L - M - tailleCagou + 12, 140, tailleCagou, tailleCagou);
  y = 236;
  ctx.font = `700 96px ${TITRE}`;
  ctx.fillStyle = C.mist;
  ctx.fillText("Point route", M, y);
  y = 300;
  ctx.font = `500 38px ${TEXTE}`;
  ctx.fillStyle = C.mistDim;
  ctx.fillText(couper(ctx, d.zone, vide ? L - 2 * M : L - 2 * M - tailleCagou), M, y);

  // Compteurs (dangers / perturbations / météo)
  y = 350;
  const ecart = 24;
  const lBoite = (L - 2 * M - 2 * ecart) / 3;
  const hBoite = 132;
  d.compteurs.forEach((c, i) => {
    const x = M + i * (lBoite + ecart);
    rectArrondi(ctx, x, y, lBoite, hBoite, 24);
    ctx.fillStyle = C.panel;
    ctx.fill();
    ctx.strokeStyle = c.n > 0 ? c.couleur : C.ligne;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.font = `700 72px ${TITRE}`;
    ctx.fillStyle = c.n > 0 ? c.couleur : C.mistDim;
    ctx.fillText(String(c.n), x + lBoite / 2, y + 74);
    ctx.font = `500 28px ${TEXTE}`;
    ctx.fillStyle = C.mistDim;
    ctx.fillText(c.texte, x + lBoite / 2, y + 114);
    ctx.textAlign = "left";
  });
  y += hBoite + 36;

  // Liste des événements
  const hLigne = 110;
  const tuile = 84;
  if (vide) {
    y += 70;
    ctx.font = `600 46px ${TEXTE}`;
    ctx.fillStyle = C.mist;
    ctx.fillText("Rien de signalé pour l'instant.", M, y);
    y += 56;
    ctx.font = `500 34px ${TEXTE}`;
    ctx.fillStyle = C.mistDim;
    ctx.fillText("Bonne route ! Reste prudent :", M, y);
    y += 44;
    ctx.fillText("tout n'est pas forcément signalé.", M, y);
    if (d.cagou) {
      const grand = 340;
      ctx.drawImage(d.cagou, (L - grand) / 2, y + 60, grand, grand);
    }
  }
  for (const l of d.lignes.slice(0, IMAGE_LIGNES_MAX)) {
    rectArrondi(ctx, M, y + (hLigne - tuile) / 2, tuile, tuile, 20);
    ctx.fillStyle = l.couleur;
    ctx.fill();
    if (l.icone) ctx.drawImage(l.icone, M + 16, y + (hLigne - tuile) / 2 + 16, tuile - 32, tuile - 32);

    const xTexte = M + tuile + 28;
    const lTexte = L - M - xTexte;
    ctx.font = `600 30px ${TEXTE}`;
    const lFiab = ctx.measureText(l.fiabilite).width;
    ctx.fillStyle = l.couleurFiabilite;
    ctx.textAlign = "right";
    ctx.fillText(l.fiabilite, L - M, y + 46);
    ctx.textAlign = "left";

    ctx.font = `600 42px ${TEXTE}`;
    ctx.fillStyle = C.mist;
    ctx.fillText(couper(ctx, l.titre, lTexte - lFiab - 24), xTexte, y + 48);
    ctx.font = `400 30px ${TEXTE}`;
    ctx.fillStyle = C.mistDim;
    ctx.fillText(couper(ctx, l.detail, lTexte), xTexte, y + 88);

    y += hLigne;
    ctx.fillStyle = C.ligne;
    ctx.fillRect(xTexte, y - 1, L - M - xTexte, 2);
  }
  if (d.autres > 0) {
    y += 48;
    ctx.font = `600 32px ${TEXTE}`;
    ctx.fillStyle = C.lagon;
    ctx.fillText(`+ ${d.autres} autre${d.autres > 1 ? "s" : ""} signalement${d.autres > 1 ? "s" : ""} sur la carte`, M, y);
  }

  // Pied : avertissement + adresse
  const yPied = H - 176;
  ctx.fillStyle = C.ligne;
  ctx.fillRect(M, yPied, L - 2 * M, 2);
  ctx.font = `400 28px ${TEXTE}`;
  ctx.fillStyle = C.mistDim;
  ctx.fillText("Infos signalées par les usagers : vérifie sur place.", M, yPied + 52);
  ctx.font = `700 56px ${TITRE}`;
  ctx.fillStyle = C.lagon;
  ctx.fillText(d.site, M, yPied + 128);
  ctx.font = `500 30px ${TEXTE}`;
  ctx.fillStyle = C.mist;
  ctx.textAlign = "right";
  ctx.fillText("Gratuit · sans compte", L - M, yPied + 124);
  ctx.textAlign = "left";
}
