// Dessin d'une tuile de la carte sur un canvas, sans dépendance (données
// Protomaps, couches earth / landcover / landuse / water / roads /
// buildings / places). Trois palettes :
//  - « vigie » (sombre) et « vigie-clair » : le fond de carte de Vigie NC
//    (revue de design du 11/11/2026). Sobre : la mer, le lagon et ses
//    récifs, les rivières, les routes en couleurs neutres (sable, gris,
//    blanc) — jamais en rouge ni en orange, couleurs réservées aux dangers
//    et aux perturbations —, les numéros des grandes routes (RT1, RPN10…)
//    et les noms des communes. Pas de commerces, d'écoles ni de détails
//    inutiles.
//  - « osm » : proche du plan OpenStreetMap, pour la carte sans réseau
//    dessinée sous ce plan (lib/couche-hors-ligne.ts).

import type { Couche, Objet } from "./mvt";

/** Couches lues (les autres — pois, transit, limites — sont sautées). */
export const COUCHES_UTILES = new Set(["earth", "landcover", "landuse", "water", "roads", "buildings", "places"]);

export type NomPalette = "osm" | "vigie" | "vigie-clair";

type CleRoute = "highway" | "principale" | "secondaire" | "minor_road" | "other" | "piste" | "path" | "aeroway";

interface Trace {
  fond: string;
  bord: string | null;
}

export interface Palette {
  mer: string;
  terre: string;
  eauLigne: string;
  recif: string;
  sols: Record<string, string>;
  batiments: string;
  routes: Record<CleRoute, Trace | null>;
  /** Zoom à partir duquel les routes ont un bord, et son épaisseur (px, les deux côtés). */
  bordsDes: number;
  bordEpaisseur: number;
  texteCommune: string;
  texteQuartier: string;
  halo: string;
  /** Cartouche des numéros de route (RT1…), null = pas de numéros. */
  cartouche: { fond: string; bord: string; texte: string } | null;
}

/** Largeurs et ordre de dessin, communs aux palettes. */
interface Forme {
  /** Largeur (px CSS) par zoom : [zoom, largeur] croissants. */
  largeurs: [number, number][];
  pointilles?: number[];
  rang: number;
}

const FORMES: Record<CleRoute, Forme> = {
  highway: {
    largeurs: [
      [6, 0.8],
      [9, 1.6],
      [11, 2.6],
      [13, 4],
      [14, 6],
      [15, 9],
      [18, 22],
    ],
    rang: 5,
  },
  principale: {
    largeurs: [
      [6, 0.6],
      [9, 1.3],
      [11, 2.2],
      [13, 3.6],
      [14, 5.5],
      [15, 8],
      [18, 20],
    ],
    rang: 4,
  },
  secondaire: {
    largeurs: [
      [8, 0.6],
      [10, 1.2],
      [12, 2],
      [13, 3],
      [14, 5],
      [15, 7.5],
      [18, 18],
    ],
    rang: 3,
  },
  minor_road: {
    largeurs: [
      [12, 0.8],
      [13, 1.6],
      [14, 3],
      [15, 5.5],
      [18, 16],
    ],
    rang: 2,
  },
  other: {
    largeurs: [
      [14, 1.2],
      [15, 2.5],
      [18, 8],
    ],
    rang: 1,
  },
  // Pistes (track) : en brousse, ce sont souvent les routes des tribus.
  piste: {
    largeurs: [
      [13, 0.8],
      [14, 1.2],
      [15, 1.6],
      [18, 3],
    ],
    pointilles: [4, 2],
    rang: 0,
  },
  path: {
    largeurs: [
      [15, 0.8],
      [18, 2],
    ],
    pointilles: [3, 2],
    rang: 0,
  },
  aeroway: {
    largeurs: [
      [11, 1.5],
      [13, 4],
      [15, 14],
      [18, 60],
    ],
    rang: 0,
  },
};

export const PALETTES: Record<NomPalette, Palette> = {
  osm: {
    mer: "#aad3df",
    terre: "#f2efe9",
    eauLigne: "#8cc0d3",
    recif: "#c3e0e8",
    sols: {
      forest: "#c8d7ab",
      grassland: "#dfe9c6",
      scrub: "#d5e3b5",
      barren: "#ece6dc",
      farmland: "#eef0d5",
      urban_area: "#e8e3dc",
      wood: "#add19e",
      park: "#cdebb0",
      garden: "#cdebb0",
      grass: "#cdebb0",
      recreation_ground: "#cdebb0",
      golf_course: "#cdebb0",
      pitch: "#aae0cb",
      playground: "#cdebb0",
      cemetery: "#aacbaf",
      residential: "#e3dfd8",
      industrial: "#ebdbe8",
      commercial: "#f2dad9",
      retail: "#f2dad9",
      military: "#f3e3dd",
      wetland: "#d6e8e0",
      beach: "#f5e9c6",
      sand: "#f5e9c6",
      school: "#f0f0d8",
      university: "#f0f0d8",
      college: "#f0f0d8",
      hospital: "#f0f0d8",
      aerodrome: "#e9e7e2",
      zoo: "#cdebb0",
      quarry: "#e4dcd2",
    },
    batiments: "#d9d0c9",
    routes: {
      highway: { fond: "#e892a2", bord: "#c46a7d" },
      principale: { fond: "#fcd6a4", bord: "#c39a66" },
      secondaire: { fond: "#f7fabf", bord: "#a8ab73" },
      minor_road: { fond: "#ffffff", bord: "#bfb7ad" },
      other: { fond: "#ffffff", bord: "#c9c2b9" },
      piste: { fond: "#9a8c7c", bord: null },
      path: { fond: "#9a8c7c", bord: null },
      aeroway: { fond: "#d0cbc4", bord: null },
    },
    bordsDes: 12,
    bordEpaisseur: 1.4,
    texteCommune: "#2b2b2b",
    texteQuartier: "#555555",
    halo: "rgba(255,255,255,0.9)",
    cartouche: null,
  },

  // Sombre, aux couleurs de l'appli (lagon, terre rouge) : la mer bleu
  // nuit, le lagon et ses récifs en sarcelle, la terre ardoise, le maquis
  // minier en brun rouge très sombre. Routes en sable et gris.
  vigie: {
    mer: "#0c2532",
    terre: "#1b2522",
    eauLigne: "#2f6e86",
    recif: "#124049",
    sols: {
      forest: "#1a2a21",
      wood: "#1a2a21",
      scrub: "#1d2923",
      grassland: "#1d2923",
      meadow: "#1d2923",
      wetland: "#163029",
      nature_reserve: "#1b2722",
      park: "#1c2b23",
      grass: "#1c2b23",
      garden: "#1c2b23",
      farmland: "#1f2822",
      barren: "#2c221e",
      bare_rock: "#2c221e",
      quarry: "#2c221e",
      beach: "#2b2a23",
      sand: "#2b2a23",
      urban_area: "#222b29",
      residential: "#222b29",
      industrial: "#252a2a",
      commercial: "#252a2a",
      retail: "#252a2a",
      aerodrome: "#232b2a",
    },
    batiments: "#2b3634",
    routes: {
      highway: { fond: "#f1e4c4", bord: "#081210" },
      principale: { fond: "#d8ccad", bord: "#081210" },
      secondaire: { fond: "#a6a596", bord: "#0b1513" },
      minor_road: { fond: "#6e7773", bord: null },
      other: { fond: "#56605c", bord: null },
      piste: { fond: "#7d6f5c", bord: null },
      path: { fond: "#4f5a56", bord: null },
      aeroway: { fond: "#3a4441", bord: null },
    },
    bordsDes: 11,
    bordEpaisseur: 1.4,
    texteCommune: "#eaf6f4",
    texteQuartier: "#a7c1be",
    halo: "rgba(8,19,23,0.88)",
    cartouche: { fond: "#26322f", bord: "#93b0ad", texte: "#eaf6f4" },
  },

  // Clair, pour le plein soleil : mêmes choix, routes blanches bordées de gris.
  "vigie-clair": {
    mer: "#a9cfd9",
    terre: "#efece5",
    eauLigne: "#6fa9c0",
    recif: "#c5e2e6",
    sols: {
      forest: "#d9e4cc",
      wood: "#d9e4cc",
      scrub: "#e1e8d3",
      grassland: "#e1e8d3",
      meadow: "#e1e8d3",
      wetland: "#d3e6e0",
      nature_reserve: "#e2e9d6",
      park: "#d8e8cb",
      grass: "#d8e8cb",
      garden: "#d8e8cb",
      farmland: "#e9ecdb",
      barren: "#ead8cc",
      bare_rock: "#ead8cc",
      quarry: "#ead8cc",
      beach: "#f2e8cc",
      sand: "#f2e8cc",
      urban_area: "#e7e3dc",
      residential: "#e7e3dc",
      industrial: "#e3e0dc",
      commercial: "#e3e0dc",
      retail: "#e3e0dc",
      aerodrome: "#e5e3df",
    },
    batiments: "#d9d2c9",
    routes: {
      highway: { fond: "#ffffff", bord: "#8f8677" },
      principale: { fond: "#ffffff", bord: "#a59c8e" },
      secondaire: { fond: "#ffffff", bord: "#ada498" },
      minor_road: { fond: "#ffffff", bord: "#b8b0a4" },
      other: { fond: "#ffffff", bord: "#c2bbb0" },
      piste: { fond: "#a39581", bord: null },
      path: { fond: "#b0a697", bord: null },
      aeroway: { fond: "#d4d0c9", bord: null },
    },
    bordsDes: 9,
    bordEpaisseur: 2,
    texteCommune: "#24302e",
    texteQuartier: "#566663",
    halo: "rgba(255,255,255,0.92)",
    cartouche: { fond: "#ffffff", bord: "#7b8582", texte: "#24302e" },
  },
};

/** Classe d'une route Protomaps (kind + kind_detail), ou null (ferry, rail…). */
export function classeRoute(kind: unknown, detail: unknown): CleRoute | null {
  if (kind === "highway") return "highway";
  if (kind === "major_road") {
    if (detail === "secondary" || detail === "secondary_link" || detail === "tertiary" || detail === "tertiary_link") {
      return "secondaire";
    }
    return "principale";
  }
  if (kind === "minor_road") return "minor_road";
  if (kind === "other") return "other";
  if (kind === "path") return detail === "track" ? "piste" : "path";
  if (kind === "aeroway") return "aeroway";
  return null;
}

export interface StyleRoute extends Forme, Trace {}

/** Style complet d'une route dans une palette, ou null si elle n'est pas dessinée. */
export function styleRoute(kind: unknown, detail: unknown, palette: NomPalette = "osm"): StyleRoute | null {
  const cle = classeRoute(kind, detail);
  if (!cle) return null;
  const trace = PALETTES[palette].routes[cle];
  return trace ? { ...FORMES[cle], ...trace } : null;
}

/** Largeur au zoom (interpolée), 0 = pas dessinée à ce zoom. */
export function largeurAuZoom(largeurs: [number, number][], z: number): number {
  if (z < largeurs[0][0]) return 0;
  for (let i = 1; i < largeurs.length; i++) {
    const [z1, l1] = largeurs[i];
    if (z <= z1) {
      const [z0, l0] = largeurs[i - 1];
      return l0 + ((l1 - l0) * (z - z0)) / (z1 - z0);
    }
  }
  return largeurs[largeurs.length - 1][1];
}

export function couleurSol(kind: unknown, palette: NomPalette = "osm"): string | null {
  return typeof kind === "string" ? (PALETTES[palette].sols[kind] ?? null) : null;
}

/**
 * Numéro affiché dans un cartouche, ou null : routes territoriales et
 * provinciales (RT1, RPN10, VE2…) dès le zoom 10, secondaires dès 12, les
 * routes municipales (RM…) seulement de près. Jamais sur les bretelles.
 */
export function numeroRoute(props: Record<string, unknown>, z: number): string | null {
  const ref = props.ref;
  if (typeof ref !== "string" || props.is_link === true) return null;
  const r = ref.split(";")[0].trim().replace(/\s+/g, " ");
  if (!r || r.length > 7) return null;
  const detail = props.kind_detail;
  if (props.kind === "highway" || detail === "trunk" || detail === "primary") return z >= 10 ? r : null;
  if (detail === "secondary") return z >= 12 ? r : null;
  if (props.kind === "major_road" || props.kind === "minor_road") return z >= 14 ? r : null;
  return null;
}

export interface OptionsDessin {
  /** Côté de la tuile en pixels du canvas. */
  taille: number;
  /** Zoom affiché (peut dépasser celui des données). */
  zoom: number;
  /** Pixels du canvas par pixel CSS. */
  densite: number;
  /**
   * Sur-zoom : la tuile affichée est un morceau de la tuile de données.
   * echelle = 2^(zoom affiché - zoom des données) ; dx, dy = position du
   * morceau (0 … echelle - 1).
   */
  echelle?: number;
  dx?: number;
  dy?: number;
  palette?: NomPalette;
  /** Police des noms (celle de l'appli, voir famillePolice). */
  police?: string;
  /**
   * Coordonnées de la tuile affichée : les numéros de route ne sont mis
   * qu'une tuile sur deux (en damier), sinon ils se répètent tous les 256 px.
   */
  x?: number;
  y?: number;
}

type Transfo = (x: number, y: number) => [number, number];

function tracer(ctx: CanvasRenderingContext2D, o: Objet, t: Transfo, fermer: boolean): void {
  for (const p of o.parties) {
    if (p.length < 4) continue;
    const [x0, y0] = t(p[0], p[1]);
    ctx.moveTo(x0, y0);
    for (let i = 2; i < p.length; i += 2) {
      const [x, y] = t(p[i], p[i + 1]);
      ctx.lineTo(x, y);
    }
    if (fermer) ctx.closePath();
  }
}

function remplir(ctx: CanvasRenderingContext2D, objets: Objet[], t: Transfo, couleur: string): void {
  if (objets.length === 0) return;
  ctx.beginPath();
  for (const o of objets) tracer(ctx, o, t, true);
  ctx.fillStyle = couleur;
  ctx.fill("evenodd");
}

function nomLieu(o: Objet): string | null {
  const n = o.props["name:fr"] ?? o.props.name;
  return typeof n === "string" && n.trim() ? n.trim() : null;
}

/** Les lieux à afficher à ce zoom, les plus importants d'abord. */
export function lieuxAffiches(objets: Objet[], z: number): Objet[] {
  return objets
    .filter((o) => {
      if (o.type !== 1 || !nomLieu(o)) return false;
      const kind = o.props.kind;
      if (kind !== "locality" && kind !== "macrohood" && kind !== "neighbourhood") return false;
      const min = typeof o.props.min_zoom === "number" ? o.props.min_zoom : 99;
      return min <= z + 0.5;
    })
    .sort((a, b) => {
      const ra = typeof a.props.population_rank === "number" ? a.props.population_rank : 0;
      const rb = typeof b.props.population_rank === "number" ? b.props.population_rank : 0;
      return rb - ra;
    });
}

/**
 * Point au milieu (en longueur) de la plus longue partie d'une ligne, en
 * pixels de la tuile affichée.
 */
export function milieuLigne(parties: number[][], t: Transfo): [number, number] | null {
  let meilleure: [number, number][] | null = null;
  let longueurMax = 0;
  for (const p of parties) {
    const pts: [number, number][] = [];
    for (let i = 0; i + 1 < p.length; i += 2) pts.push(t(p[i], p[i + 1]));
    let l = 0;
    for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (l > longueurMax) {
      longueurMax = l;
      meilleure = pts;
    }
  }
  if (!meilleure || longueurMax <= 0) return null;
  let reste = longueurMax / 2;
  for (let i = 1; i < meilleure.length; i++) {
    const [x0, y0] = meilleure[i - 1];
    const [x1, y1] = meilleure[i];
    const l = Math.hypot(x1 - x0, y1 - y0);
    if (l >= reste && l > 0) return [x0 + ((x1 - x0) * reste) / l, y0 + ((y1 - y0) * reste) / l];
    reste -= l;
  }
  return meilleure[meilleure.length - 1];
}

type Boite = [number, number, number, number];

function libre(pris: Boite[], b: Boite, taille: number): boolean {
  if (b[0] < 0 || b[1] < 0 || b[2] > taille || b[3] > taille) return false;
  return !pris.some((p) => p[0] < b[2] && b[0] < p[2] && p[1] < b[3] && b[1] < p[3]);
}

function rectArrondi(ctx: CanvasRenderingContext2D, x: number, y: number, l: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + l, y, x + l, y + h, r);
  ctx.arcTo(x + l, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + l, y, r);
  ctx.closePath();
}

export function dessinerTuile(ctx: CanvasRenderingContext2D, couches: Couche[], opt: OptionsDessin): void {
  const { taille, zoom: z, densite } = opt;
  const echelle = opt.echelle ?? 1;
  const dx = opt.dx ?? 0;
  const dy = opt.dy ?? 0;
  const nomPalette = opt.palette ?? "osm";
  const pal = PALETTES[nomPalette];
  const police = opt.police ?? "Inter, system-ui, sans-serif";
  const par = new Map(couches.map((c) => [c.nom, c] as [string, Couche]));
  const etendue = couches[0]?.etendue ?? 4096;
  const f = (taille * echelle) / etendue;
  const t: Transfo = (x, y) => [x * f - dx * taille, y * f - dy * taille];

  // Mer partout, puis la terre par-dessus.
  ctx.fillStyle = pal.mer;
  ctx.fillRect(0, 0, taille, taille);
  const terre = par.get("earth")?.objets.filter((o) => o.type === 3) ?? [];
  remplir(ctx, terre, t, pal.terre);

  // Sols (couverture puis usage), groupés par couleur.
  for (const nom of ["landcover", "landuse"]) {
    const groupes = new Map<string, Objet[]>();
    for (const o of par.get(nom)?.objets ?? []) {
      if (o.type !== 3) continue;
      const c = couleurSol(o.props.kind, nomPalette);
      if (!c) continue;
      const g = groupes.get(c);
      if (g) g.push(o);
      else groupes.set(c, [o]);
    }
    for (const [c, objets] of groupes) remplir(ctx, objets, t, c);
  }

  // Eau : surfaces, récifs, puis rivières.
  const eau = par.get("water")?.objets ?? [];
  remplir(
    ctx,
    eau.filter((o) => o.type === 3 && o.props.kind === "reef"),
    t,
    pal.recif,
  );
  remplir(
    ctx,
    eau.filter((o) => o.type === 3 && o.props.kind !== "reef"),
    t,
    pal.mer,
  );
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const o of eau) {
    if (o.type !== 2 || o.props.kind === "reef") continue;
    const riviere = o.props.kind === "river";
    const l = riviere ? largeurAuZoom([[9, 0.8], [12, 1.6], [15, 4], [18, 10]], z) : largeurAuZoom([[12, 0.5], [14, 1], [15, 1.5], [18, 3]], z);
    if (l <= 0) continue;
    ctx.beginPath();
    tracer(ctx, o, t, false);
    ctx.strokeStyle = pal.eauLigne;
    ctx.lineWidth = l * densite;
    ctx.stroke();
  }

  // Bâtiments (à partir du zoom 14).
  if (z >= 14) {
    const bat = (par.get("buildings")?.objets ?? []).filter((o) => o.type === 3);
    remplir(ctx, bat, t, pal.batiments);
  }

  // Routes : bords puis intérieurs, des petites aux grandes.
  const routes = (par.get("roads")?.objets ?? [])
    .filter((o) => o.type === 2)
    .map((o) => ({ o, s: styleRoute(o.props.kind, o.props.kind_detail, nomPalette) }))
    .filter((r): r is { o: Objet; s: StyleRoute } => r.s !== null && largeurAuZoom(r.s.largeurs, z) > 0)
    .sort((a, b) => a.s.rang - b.s.rang);
  if (z >= pal.bordsDes) {
    for (const { o, s } of routes) {
      if (!s.bord) continue;
      ctx.beginPath();
      tracer(ctx, o, t, false);
      ctx.setLineDash([]);
      ctx.strokeStyle = s.bord;
      ctx.lineWidth = (largeurAuZoom(s.largeurs, z) + pal.bordEpaisseur) * densite;
      ctx.stroke();
    }
  }
  for (const { o, s } of routes) {
    ctx.beginPath();
    tracer(ctx, o, t, false);
    ctx.setLineDash(s.pointilles ? s.pointilles.map((v) => v * densite) : []);
    ctx.strokeStyle = s.fond;
    ctx.lineWidth = largeurAuZoom(s.largeurs, z) * densite;
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Noms des lieux (communes, quartiers), sans chevauchement ni coupure au bord.
  const pris: Boite[] = [];
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const o of lieuxAffiches(par.get("places")?.objets ?? [], z)) {
    const p = o.parties[0];
    if (!p || p.length < 2) continue;
    const [x, y] = t(p[0], p[1]);
    const nom = nomLieu(o) as string;
    const commune = o.props.kind === "locality";
    const grand = commune && typeof o.props.population_rank === "number" && o.props.population_rank >= 6;
    const px = (grand ? 15 : commune ? 13 : 12) * densite;
    ctx.font = `${commune ? 600 : 500} ${px}px ${police}`;
    const w = ctx.measureText(nom).width;
    const h = px * 1.2;
    const boite: Boite = [x - w / 2 - 2, y - h / 2, x + w / 2 + 2, y + h / 2];
    if (!libre(pris, boite, taille)) continue;
    pris.push(boite);
    ctx.lineWidth = 3 * densite;
    ctx.strokeStyle = pal.halo;
    ctx.strokeText(nom, x, y);
    ctx.fillStyle = commune ? pal.texteCommune : pal.texteQuartier;
    ctx.fillText(nom, x, y);
  }

  // Numéros des routes (RT1, RPN10…), une tuile sur deux, un par numéro.
  const cartouche = pal.cartouche;
  const damier = opt.x === undefined || opt.y === undefined || (opt.x + opt.y) % 2 === 0;
  if (cartouche && damier && z >= 10) {
    const faits = new Set<string>();
    const px = 11 * densite;
    ctx.font = `700 ${px}px ${police}`;
    const plus = [...routes].reverse(); // les grandes routes d'abord
    for (const { o } of plus) {
      const num = numeroRoute(o.props, z);
      if (!num || faits.has(num)) continue;
      const m = milieuLigne(o.parties, t);
      if (!m) continue;
      const l = ctx.measureText(num).width + 8 * densite;
      const h = 16 * densite;
      const boite: Boite = [m[0] - l / 2, m[1] - h / 2, m[0] + l / 2, m[1] + h / 2];
      if (!libre(pris, boite, taille)) continue;
      pris.push(boite);
      faits.add(num);
      rectArrondi(ctx, boite[0], boite[1], l, h, 3 * densite);
      ctx.fillStyle = cartouche.fond;
      ctx.fill();
      ctx.lineWidth = 1 * densite;
      ctx.strokeStyle = cartouche.bord;
      ctx.stroke();
      ctx.fillStyle = cartouche.texte;
      ctx.fillText(num, m[0], m[1] + 0.5 * densite);
    }
  }
}
