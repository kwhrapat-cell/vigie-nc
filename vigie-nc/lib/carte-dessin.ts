// Dessin d'une tuile de la carte sans réseau sur un canvas, sans
// dépendance (données Protomaps, couches earth / landcover / landuse /
// water / roads / buildings / places). Couleurs proches du plan
// OpenStreetMap affiché en ligne, pour ne pas dépayser ; le fond « Nuit »
// l'assombrit avec le même filtre (globals.css).

import type { Couche, Objet } from "./mvt";

/** Couches lues (les autres — pois, transit, limites — sont sautées). */
export const COUCHES_UTILES = new Set(["earth", "landcover", "landuse", "water", "roads", "buildings", "places"]);

export const MER = "#aad3df";
const TERRE = "#f2efe9";
const EAU_LIGNE = "#8cc0d3";
const RECIF = "#c3e0e8";

const SOL: Record<string, string> = {
  // landcover
  forest: "#c8d7ab",
  grassland: "#dfe9c6",
  scrub: "#d5e3b5",
  barren: "#ece6dc",
  farmland: "#eef0d5",
  urban_area: "#e8e3dc",
  // landuse
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
};

interface StyleRoute {
  fond: string;
  bord: string | null;
  /** Largeur (px CSS) par zoom : [zoom, largeur] croissants. */
  largeurs: [number, number][];
  pointilles?: number[];
  rang: number;
}

const ROUTES: Record<string, StyleRoute> = {
  highway: {
    fond: "#e892a2",
    bord: "#c46a7d",
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
    fond: "#fcd6a4",
    bord: "#c39a66",
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
    fond: "#f7fabf",
    bord: "#a8ab73",
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
    fond: "#ffffff",
    bord: "#bfb7ad",
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
    fond: "#ffffff",
    bord: "#c9c2b9",
    largeurs: [
      [14, 1.2],
      [15, 2.5],
      [18, 8],
    ],
    rang: 1,
  },
  path: {
    fond: "#9a8c7c",
    bord: null,
    largeurs: [
      [14, 0.8],
      [15, 1.1],
      [18, 2],
    ],
    pointilles: [3, 2],
    rang: 0,
  },
  aeroway: {
    fond: "#d0cbc4",
    bord: null,
    largeurs: [
      [11, 1.5],
      [13, 4],
      [15, 14],
      [18, 60],
    ],
    rang: 0,
  },
};

/** Style d'une route Protomaps (kind + kind_detail). */
export function styleRoute(kind: unknown, detail: unknown): StyleRoute | null {
  if (kind === "major_road") {
    if (detail === "secondary" || detail === "tertiary") return ROUTES.secondaire;
    return ROUTES.principale;
  }
  if (typeof kind !== "string") return null;
  return ROUTES[kind] ?? null;
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

export function couleurSol(kind: unknown): string | null {
  return typeof kind === "string" ? (SOL[kind] ?? null) : null;
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

export function dessinerTuile(ctx: CanvasRenderingContext2D, couches: Couche[], opt: OptionsDessin): void {
  const { taille, zoom: z, densite } = opt;
  const echelle = opt.echelle ?? 1;
  const dx = opt.dx ?? 0;
  const dy = opt.dy ?? 0;
  const par = new Map(couches.map((c) => [c.nom, c] as [string, Couche]));
  const etendue = couches[0]?.etendue ?? 4096;
  const f = (taille * echelle) / etendue;
  const t: Transfo = (x, y) => [x * f - dx * taille, y * f - dy * taille];

  // Mer partout, puis la terre par-dessus.
  ctx.fillStyle = MER;
  ctx.fillRect(0, 0, taille, taille);
  const terre = par.get("earth")?.objets.filter((o) => o.type === 3) ?? [];
  remplir(ctx, terre, t, TERRE);

  // Sols (couverture puis usage), groupés par couleur.
  for (const nom of ["landcover", "landuse"]) {
    const groupes = new Map<string, Objet[]>();
    for (const o of par.get(nom)?.objets ?? []) {
      if (o.type !== 3) continue;
      const c = couleurSol(o.props.kind);
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
    RECIF,
  );
  remplir(
    ctx,
    eau.filter((o) => o.type === 3 && o.props.kind !== "reef"),
    t,
    MER,
  );
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const o of eau) {
    if (o.type !== 2) continue;
    const riviere = o.props.kind === "river";
    const l = riviere ? largeurAuZoom([[9, 0.8], [12, 1.6], [15, 4], [18, 10]], z) : largeurAuZoom([[12, 0.5], [14, 1], [15, 1.5], [18, 3]], z);
    if (l <= 0) continue;
    ctx.beginPath();
    tracer(ctx, o, t, false);
    ctx.strokeStyle = EAU_LIGNE;
    ctx.lineWidth = l * densite;
    ctx.stroke();
  }

  // Bâtiments (à partir du zoom 14).
  if (z >= 14) {
    const bat = (par.get("buildings")?.objets ?? []).filter((o) => o.type === 3);
    remplir(ctx, bat, t, "#d9d0c9");
  }

  // Routes : bords puis intérieurs, des petites aux grandes.
  const routes = (par.get("roads")?.objets ?? [])
    .filter((o) => o.type === 2)
    .map((o) => ({ o, s: styleRoute(o.props.kind, o.props.kind_detail) }))
    .filter((r): r is { o: Objet; s: StyleRoute } => r.s !== null && largeurAuZoom(r.s.largeurs, z) > 0)
    .sort((a, b) => a.s.rang - b.s.rang);
  if (z >= 12) {
    for (const { o, s } of routes) {
      if (!s.bord) continue;
      ctx.beginPath();
      tracer(ctx, o, t, false);
      ctx.setLineDash([]);
      ctx.strokeStyle = s.bord;
      ctx.lineWidth = (largeurAuZoom(s.largeurs, z) + 1.4) * densite;
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
  const pris: [number, number, number, number][] = [];
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
    ctx.font = `${commune ? 600 : 500} ${px}px Inter, system-ui, sans-serif`;
    const w = ctx.measureText(nom).width;
    const h = px * 1.2;
    const boite: [number, number, number, number] = [x - w / 2 - 2, y - h / 2, x + w / 2 + 2, y + h / 2];
    if (boite[0] < 0 || boite[1] < 0 || boite[2] > taille || boite[3] > taille) continue;
    if (pris.some((b) => b[0] < boite[2] && boite[0] < b[2] && b[1] < boite[3] && boite[1] < b[3])) continue;
    pris.push(boite);
    ctx.lineWidth = 3 * densite;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.strokeText(nom, x, y);
    ctx.fillStyle = commune ? "#2b2b2b" : "#555555";
    ctx.fillText(nom, x, y);
  }
}
