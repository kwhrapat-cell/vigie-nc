// Lecture d'un fichier PMTiles (version 3), sans dépendance : la carte de
// la Calédonie pour l'affichage sans réseau (lib/carte-hors-ligne.ts).
// Format : https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md
//
// Un fichier PMTiles = un en-tête de 127 octets, un répertoire racine (dans
// les 16 premiers Ko), des répertoires « feuilles », puis les tuiles. Chaque
// tuile a un numéro (tileId) qui suit une courbe de Hilbert, zoom par zoom :
// des tuiles voisines sur la carte sont voisines dans le fichier.

export const PMTILES_RACINE_OCTETS = 16_384;

export const COMPRESSION = { inconnue: 0, aucune: 1, gzip: 2, brotli: 3, zstd: 4 } as const;

export interface EnTete {
  version: number;
  racineDebut: number;
  racineLongueur: number;
  metaDebut: number;
  metaLongueur: number;
  feuillesDebut: number;
  feuillesLongueur: number;
  tuilesDebut: number;
  tuilesLongueur: number;
  compressionInterne: number;
  compressionTuiles: number;
  typeTuiles: number;
  zoomMin: number;
  zoomMax: number;
  /** ouest, sud, est, nord (degrés) */
  emprise: [number, number, number, number];
}

/**
 * Une entrée de répertoire : `longueurSerie` tuiles à partir de `tileId`
 * ont le même contenu (`debut`, `longueur`, depuis le début de la zone des
 * tuiles). `longueurSerie` = 0 : c'est un répertoire feuille (`debut` depuis
 * le début de la zone des feuilles).
 */
export interface Entree {
  tileId: number;
  debut: number;
  longueur: number;
  longueurSerie: number;
}

// --- Numéro de tuile (courbe de Hilbert) --------------------------------

const MAX_ZOOM = 26;
// Nombre de tuiles des zooms précédents : (4^z - 1) / 3.
const AVANT_ZOOM: number[] = [];
for (let z = 0, acc = 0; z <= MAX_ZOOM; z++) {
  AVANT_ZOOM.push(acc);
  acc += 4 ** z;
}

function tourner(n: number, xy: [number, number], rx: number, ry: number): void {
  if (ry === 0) {
    if (rx === 1) {
      xy[0] = n - 1 - xy[0];
      xy[1] = n - 1 - xy[1];
    }
    const t = xy[0];
    xy[0] = xy[1];
    xy[1] = t;
  }
}

export function zxyVersTileId(z: number, x: number, y: number): number {
  if (z > MAX_ZOOM || z < 0) throw new Error("zoom hors limites");
  const n = 2 ** z;
  if (x < 0 || y < 0 || x >= n || y >= n) throw new Error("tuile hors limites");
  const xy: [number, number] = [x, y];
  let d = 0;
  let s = n / 2;
  while (s >= 1) {
    const rx = (xy[0] & s) > 0 ? 1 : 0;
    const ry = (xy[1] & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    tourner(s, xy, rx, ry);
    s /= 2;
  }
  return AVANT_ZOOM[z] + d;
}

export function tileIdVersZxy(tileId: number): [number, number, number] {
  let z = 0;
  while (z < MAX_ZOOM && AVANT_ZOOM[z + 1] <= tileId) z++;
  const n = 2 ** z;
  let t = tileId - AVANT_ZOOM[z];
  const xy: [number, number] = [0, 0];
  for (let s = 1; s < n; s *= 2) {
    // (calculs sans opérateurs binaires : t dépasse 2^31 aux grands zooms)
    const rx = Math.floor(t / 2) % 2;
    const ry = (t % 2) ^ rx;
    tourner(s, xy, rx, ry);
    xy[0] += s * rx;
    xy[1] += s * ry;
    t = Math.floor(t / 4);
  }
  return [z, xy[0], xy[1]];
}

// --- Lecture des octets -------------------------------------------------

/** Lit un entier « varint » (jusqu'à 2^53) ; renvoie [valeur, position suivante]. */
export function lireVarint(octets: Uint8Array, pos: number): [number, number] {
  let valeur = 0;
  let facteur = 1;
  for (let i = 0; i < 8; i++) {
    if (pos >= octets.length) throw new Error("varint tronqué");
    const b = octets[pos++];
    valeur += (b & 0x7f) * facteur;
    if (b < 0x80) return [valeur, pos];
    facteur *= 128;
  }
  throw new Error("varint trop long");
}

function u64(v: DataView, pos: number): number {
  return v.getUint32(pos, true) + v.getUint32(pos + 4, true) * 4_294_967_296;
}

export function lireEnTete(octets: Uint8Array): EnTete {
  if (octets.length < 127) throw new Error("en-tête trop court");
  const magie = String.fromCharCode(...octets.subarray(0, 7));
  if (magie !== "PMTiles") throw new Error("ce n'est pas un fichier PMTiles");
  const v = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  const version = octets[7];
  if (version !== 3) throw new Error("version de PMTiles non prise en charge");
  return {
    version,
    racineDebut: u64(v, 8),
    racineLongueur: u64(v, 16),
    metaDebut: u64(v, 24),
    metaLongueur: u64(v, 32),
    feuillesDebut: u64(v, 40),
    feuillesLongueur: u64(v, 48),
    tuilesDebut: u64(v, 56),
    tuilesLongueur: u64(v, 64),
    compressionInterne: octets[97],
    compressionTuiles: octets[98],
    typeTuiles: octets[99],
    zoomMin: octets[100],
    zoomMax: octets[101],
    emprise: [
      v.getInt32(102, true) / 1e7,
      v.getInt32(106, true) / 1e7,
      v.getInt32(110, true) / 1e7,
      v.getInt32(114, true) / 1e7,
    ],
  };
}

/** Répertoire déjà décompressé → entrées triées par tileId. */
export function lireRepertoire(octets: Uint8Array): Entree[] {
  let pos = 0;
  let n: number;
  [n, pos] = lireVarint(octets, pos);
  const entrees: Entree[] = new Array(n);
  let dernier = 0;
  for (let i = 0; i < n; i++) {
    let delta: number;
    [delta, pos] = lireVarint(octets, pos);
    dernier += delta;
    entrees[i] = { tileId: dernier, debut: 0, longueur: 0, longueurSerie: 1 };
  }
  for (let i = 0; i < n; i++) [entrees[i].longueurSerie, pos] = lireVarint(octets, pos);
  for (let i = 0; i < n; i++) [entrees[i].longueur, pos] = lireVarint(octets, pos);
  for (let i = 0; i < n; i++) {
    let brut: number;
    [brut, pos] = lireVarint(octets, pos);
    // 0 (sauf la première) : juste après la précédente.
    entrees[i].debut = brut === 0 && i > 0 ? entrees[i - 1].debut + entrees[i - 1].longueur : brut - 1;
  }
  return entrees;
}

/**
 * Entrée qui contient `tileId` : la tuile (longueurSerie ≥ 1), un
 * répertoire feuille à lire (longueurSerie = 0), ou null (tuile absente).
 */
export function chercherEntree(entrees: Entree[], tileId: number): Entree | null {
  let bas = 0;
  let haut = entrees.length - 1;
  while (bas <= haut) {
    const milieu = (bas + haut) >> 1;
    const e = entrees[milieu];
    if (e.tileId === tileId) return e;
    if (e.tileId < tileId) bas = milieu + 1;
    else haut = milieu - 1;
  }
  // `haut` = dernière entrée avant tileId
  if (haut >= 0) {
    const e = entrees[haut];
    if (e.longueurSerie === 0) return e;
    if (tileId - e.tileId < e.longueurSerie) return e;
  }
  return null;
}

/** Décompression gzip (navigateur et Node 18+). */
export async function degzip(octets: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") throw new Error("décompression indisponible");
  const flux = new Blob([octets as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(flux).arrayBuffer());
}

export async function decompresser(octets: Uint8Array, compression: number): Promise<Uint8Array> {
  if (compression === COMPRESSION.aucune || compression === COMPRESSION.inconnue) return octets;
  if (compression === COMPRESSION.gzip) return degzip(octets);
  throw new Error("compression non prise en charge");
}
