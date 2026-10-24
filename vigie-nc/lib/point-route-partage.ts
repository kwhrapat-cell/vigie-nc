// Partager le point route de sa zone en image (WhatsApp, Facebook…). Tout
// est préparé et dessiné sur le téléphone, à partir des signalements déjà
// affichés : rien de plus n'est demandé au serveur. Seul le fait est
// montré (type, lieu, depuis quand, fiabilité), comme pour un relais :
// jamais de texte ni de photo d'un usager, jamais de SOS, jamais la
// position de la personne qui partage.

import { cagouSvg } from "./cagou";
import { formatAgeShort } from "./geo";
import { estChantier, libelleFinChantier } from "./chantier";
import {
  dessinerPointRoute,
  DonneesDessin,
  IMAGE_H,
  IMAGE_L,
  IMAGE_LIGNES_MAX,
  LigneDessin,
} from "./point-route-dessin";
import { getReliability, RELIABILITY_HEX } from "./reliability";
import { SITE_URL } from "./site";
import {
  Category,
  CATEGORY_HEX,
  CATEGORY_LABELS,
  Report,
  REPORT_TYPE_CATEGORY,
  REPORT_TYPE_HEX,
  REPORT_TYPE_ICON,
  REPORT_TYPE_LABELS,
} from "./types";

const CATEGORIES: Category[] = ["danger", "perturbation", "meteo"];
// Provenance du lien (chiffres de /moderation).
export const LIEN_POINT_ROUTE = `${SITE_URL}/?src=point-route`;

/** Les événements en cours, les dangers d'abord puis du plus proche au plus loin. */
export function evenementsAPartager(reports: Report[], now = Date.now()): Report[] {
  return reports
    .filter((r) => r.type !== "sos" && r.active !== false && new Date(r.expiresAt).getTime() > now)
    .sort(
      (a, b) =>
        CATEGORIES.indexOf(REPORT_TYPE_CATEGORY[a.type]) - CATEGORIES.indexOf(REPORT_TYPE_CATEGORY[b.type]) ||
        (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity),
    );
}

/** La commune la plus citée dans les lieux (« RT1, Dumbéa » → « Dumbéa »). */
export function communePrincipale(reports: Report[]): string | null {
  const n = new Map<string, number>();
  for (const r of reports) {
    const c = r.place?.split(",").pop()?.trim();
    if (c && c.length <= 40) n.set(c, (n.get(c) ?? 0) + 1);
  }
  let meilleure: string | null = null;
  let max = 0;
  for (const [c, k] of n) {
    if (k > max) {
      meilleure = c;
      max = k;
    }
  }
  return meilleure;
}

/** « Dumbéa et alentours · 5 km », « 5 km autour de moi », « Toute la Calédonie ». */
export function zonePointRoute(reports: Report[], toutLeTerritoire: boolean, rayonKm: number): string {
  if (toutLeTerritoire) return "Toute la Calédonie";
  const c = communePrincipale(reports);
  return c ? `${c} et alentours · ${rayonKm} km` : `${rayonKm} km autour de moi`;
}

/** « samedi 24 octobre · 12 h 10 » (heure de Nouméa). */
export function quandPointRoute(d = new Date()): string {
  const jour = d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Pacific/Noumea",
  });
  const heure = d
    .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Pacific/Noumea" })
    .replace(":", " h ");
  return `${jour} · ${heure}`;
}

function depuis(r: Report): string {
  if (estChantier(r) && r.endDate) return `chantier ${libelleFinChantier(r.endDate)}`;
  return `il y a ${formatAgeShort(r.createdAt)}`;
}

/** Texte à partager avec l'image (ou seul, si le téléphone ne partage pas d'image). */
export function textePartage(reports: Report[], zone: string): string {
  const liste = evenementsAPartager(reports);
  const lignes = [`Point route Vigie NC · ${zone} · ${quandPointRoute()}`];
  if (liste.length === 0) {
    lignes.push("Rien de signalé pour l'instant. Bonne route !");
  } else {
    for (const r of liste.slice(0, IMAGE_LIGNES_MAX)) {
      const lieu = r.place ? ` · ${r.place}` : "";
      lignes.push(`• ${REPORT_TYPE_LABELS[r.type]}${lieu} · ${getReliability(r).label.toLowerCase()} (${depuis(r)})`);
    }
    const autres = liste.length - IMAGE_LIGNES_MAX;
    if (autres > 0) lignes.push(`+ ${autres} autre${autres > 1 ? "s" : ""} sur la carte`);
  }
  lignes.push("Infos des usagers, à vérifier sur place.");
  lignes.push(LIEN_POINT_ROUTE);
  return lignes.join("\n");
}

function chargerSvg(svg: string): Promise<HTMLImageElement | null> {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function iconeSvg(type: Report["type"]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96" fill="none" stroke="#fff" color="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${REPORT_TYPE_ICON[type]}</svg>`;
}

/** Dessine l'image du point route (PNG 1080 × 1350). */
export async function imagePointRoute(reports: Report[], zone: string): Promise<Blob> {
  // Les polices de l'appli, si elles sont là (sinon celles du téléphone).
  try {
    await Promise.all([
      document.fonts.load('700 96px "Space Grotesk"'),
      document.fonts.load('600 42px "Inter"'),
      document.fonts.load('400 30px "Inter"'),
    ]);
  } catch {
    // pas grave : polices du téléphone
  }
  const liste = evenementsAPartager(reports);
  const montres = liste.slice(0, IMAGE_LIGNES_MAX);
  const [cagou, ...icones] = await Promise.all([
    chargerSvg(cagouSvg(340)),
    ...montres.map((r) => chargerSvg(iconeSvg(r.type))),
  ]);

  const lignes: LigneDessin[] = montres.map((r, i) => {
    const fiab = getReliability(r);
    return {
      couleur: REPORT_TYPE_HEX[r.type],
      icone: icones[i] ?? null,
      titre: REPORT_TYPE_LABELS[r.type],
      detail: [r.place, depuis(r)].filter(Boolean).join(" · "),
      fiabilite: fiab.label,
      couleurFiabilite: RELIABILITY_HEX[fiab.level],
    };
  });
  const donnees: DonneesDessin = {
    quand: quandPointRoute(),
    zone,
    compteurs: CATEGORIES.map((c) => {
      const n = liste.filter((r) => REPORT_TYPE_CATEGORY[r.type] === c).length;
      return { n, texte: n > 1 ? CATEGORY_LABELS[c].many : CATEGORY_LABELS[c].one, couleur: CATEGORY_HEX[c] };
    }),
    lignes,
    autres: Math.max(0, liste.length - montres.length),
    cagou,
    site: SITE_URL.replace(/^https?:\/\//, ""),
  };

  const canvas = document.createElement("canvas");
  canvas.width = IMAGE_L;
  canvas.height = IMAGE_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  dessinerPointRoute(ctx, donnees);
  return new Promise((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error("image"))), "image/png"));
}
