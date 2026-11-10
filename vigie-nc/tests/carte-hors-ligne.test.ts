// Carte sans réseau : lecture PMTiles, tuiles vectorielles, plan de
// téléchargement, index gardé sur le téléphone, styles de dessin.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import {
  chercherEntree,
  degzip,
  lireEnTete,
  lireRepertoire,
  lireVarint,
  tileIdVersZxy,
  zxyVersTileId,
  type Entree,
} from "../lib/pmtiles";
import { decoderGeometrie, lireTuile } from "../lib/mvt";
import {
  chercherMorceau,
  chercherTuile,
  encoderIndex,
  latVersY,
  lireIndex,
  lonVersX,
  morceauDe,
  octetsTotal,
  regrouper,
  texteOctets,
  tuilesCercle,
  tuilesLigne,
} from "../lib/carte-plan";
import { largeurAuZoom, lieuxAffiches, styleRoute } from "../lib/carte-dessin";
import type { Objet } from "../lib/mvt";

// --- petits encodeurs pour fabriquer des données de test -----------------

function varint(n: number): number[] {
  const out: number[] = [];
  while (n >= 128) {
    out.push((n % 128) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return out;
}

function repertoire(entrees: Entree[]): Uint8Array {
  const o: number[] = [...varint(entrees.length)];
  let dernier = 0;
  for (const e of entrees) {
    o.push(...varint(e.tileId - dernier));
    dernier = e.tileId;
  }
  for (const e of entrees) o.push(...varint(e.longueurSerie));
  for (const e of entrees) o.push(...varint(e.longueur));
  entrees.forEach((e, i) => {
    const prec = entrees[i - 1];
    o.push(...varint(i > 0 && prec.debut + prec.longueur === e.debut ? 0 : e.debut + 1));
  });
  return new Uint8Array(o);
}

function cle(champ: number, type: number): number[] {
  return varint(champ * 8 + type);
}

function bloc(champ: number, contenu: number[]): number[] {
  return [...cle(champ, 2), ...varint(contenu.length), ...contenu];
}

function texte(s: string): number[] {
  return [...new TextEncoder().encode(s)];
}

function zz(n: number): number {
  return n >= 0 ? n * 2 : -n * 2 - 1;
}

// --- PMTiles ---------------------------------------------------------------

test("pmtiles : numéros de tuiles (courbe de Hilbert) du format", () => {
  assert.equal(zxyVersTileId(0, 0, 0), 0);
  assert.equal(zxyVersTileId(1, 0, 0), 1);
  assert.equal(zxyVersTileId(1, 0, 1), 2);
  assert.equal(zxyVersTileId(1, 1, 1), 3);
  assert.equal(zxyVersTileId(1, 1, 0), 4);
  assert.equal(zxyVersTileId(2, 0, 0), 5);
  for (const [z, x, y] of [
    [15, 31526, 18450],
    [12, 3940, 2306],
    [20, 1000000, 600000],
    [26, 67108863, 1],
  ]) {
    assert.deepEqual(tileIdVersZxy(zxyVersTileId(z, x, y)), [z, x, y]);
  }
  assert.throws(() => zxyVersTileId(3, 8, 0));
});

test("pmtiles : entiers « varint »", () => {
  assert.deepEqual(lireVarint(new Uint8Array([0x96, 0x01]), 0), [150, 2]);
  assert.deepEqual(lireVarint(new Uint8Array(varint(2 ** 40 + 7)), 0), [2 ** 40 + 7, 6]);
  assert.throws(() => lireVarint(new Uint8Array([0x80]), 0));
});

test("pmtiles : en-tête", () => {
  const h = new Uint8Array(127);
  h.set(new TextEncoder().encode("PMTiles"), 0);
  h[7] = 3;
  const v = new DataView(h.buffer);
  v.setUint32(8, 127, true); // racine
  v.setUint32(16, 76, true);
  v.setUint32(56, 72123, true); // tuiles
  v.setUint32(64, 5_000_000_000 % 2 ** 32, true);
  v.setUint32(68, Math.floor(5_000_000_000 / 2 ** 32), true);
  h[97] = 2;
  h[98] = 2;
  h[99] = 1;
  h[101] = 15;
  v.setInt32(102, 1635000000, true);
  v.setInt32(106, -229000000, true);
  const e = lireEnTete(h);
  assert.equal(e.racineDebut, 127);
  assert.equal(e.racineLongueur, 76);
  assert.equal(e.tuilesDebut, 72123);
  assert.equal(e.tuilesLongueur, 5_000_000_000);
  assert.equal(e.compressionTuiles, 2);
  assert.equal(e.zoomMax, 15);
  assert.deepEqual(e.emprise.slice(0, 2), [163.5, -22.9]);
  const faux = h.slice();
  faux[0] = 0x58;
  assert.throws(() => lireEnTete(faux));
});

test("pmtiles : répertoire, séries et feuilles", () => {
  const entrees: Entree[] = [
    { tileId: 0, longueurSerie: 1, debut: 0, longueur: 100 },
    { tileId: 5, longueurSerie: 3, debut: 100, longueur: 50 }, // 5, 6, 7 : même contenu (mer)
    { tileId: 20, longueurSerie: 1, debut: 400, longueur: 10 },
    { tileId: 40, longueurSerie: 0, debut: 0, longueur: 900 }, // répertoire feuille
  ];
  const lues = lireRepertoire(repertoire(entrees));
  assert.deepEqual(lues, entrees);
  assert.equal(chercherEntree(lues, 6)?.debut, 100);
  assert.equal(chercherEntree(lues, 8), null);
  assert.equal(chercherEntree(lues, 3), null);
  assert.equal(chercherEntree(lues, 1000)?.longueurSerie, 0);
});

test("pmtiles : décompression gzip", async () => {
  const brut = new TextEncoder().encode("la carte de la Calédonie");
  assert.deepEqual(await degzip(new Uint8Array(gzipSync(brut))), brut);
});

// --- Tuiles vectorielles -----------------------------------------------------

test("mvt : géométrie (commandes et zigzag)", () => {
  // MoveTo(10, 20), LineTo(+5, 0), LineTo(0, +5), ClosePath
  const g = [9, zz(10), zz(20), 18, zz(5), zz(0), zz(0), zz(5), 15];
  assert.deepEqual(decoderGeometrie(g), [[10, 20, 15, 20, 15, 25]]);
  // deux parties
  assert.deepEqual(decoderGeometrie([9, 2, 2, 10, 0, 2, 9, 4, 4, 10, 0, 1]), [
    [1, 1, 1, 2],
    [3, 4, 3, 3],
  ]);
});

test("mvt : couches, propriétés, couches sautées", () => {
  const objet = [
    ...cle(1, 0),
    ...varint(7),
    ...bloc(2, [...varint(0), ...varint(0), ...varint(1), ...varint(1)]),
    ...cle(3, 0),
    ...varint(2),
    ...bloc(4, [9, zz(10), zz(20), 18, zz(5), zz(0), zz(0), zz(5)]),
  ];
  const routes = [
    ...cle(15, 0),
    2,
    ...bloc(1, texte("roads")),
    ...bloc(2, objet),
    ...bloc(3, texte("kind")),
    ...bloc(3, texte("min_zoom")),
    ...bloc(4, bloc(1, texte("major_road"))),
    ...bloc(4, [...cle(4, 0), ...varint(9)]),
    ...cle(5, 0),
    ...varint(4096),
  ];
  const autre = [...bloc(1, texte("pois")), ...bloc(2, objet)];
  const tuile = new Uint8Array([...bloc(3, autre), ...bloc(3, routes)]);
  const toutes = lireTuile(tuile);
  assert.deepEqual(
    toutes.map((c) => c.nom),
    ["pois", "roads"],
  );
  const [r] = lireTuile(tuile, new Set(["roads"]));
  assert.equal(r.nom, "roads");
  assert.equal(r.etendue, 4096);
  assert.equal(r.objets.length, 1);
  assert.equal(r.objets[0].type, 2);
  assert.deepEqual(r.objets[0].props, { kind: "major_road", min_zoom: 9 });
  assert.deepEqual(r.objets[0].parties, [[10, 20, 15, 20, 15, 25]]);
});

// --- Plan de téléchargement --------------------------------------------------

test("plan : tuiles d'une zone de 10 km autour de Païta", () => {
  const ids = tuilesCercle(-22.135, 166.365, 10_000);
  assert.deepEqual(ids, [...new Set(ids)].sort((a, b) => a - b));
  const z15 = ids.filter((id) => tileIdVersZxy(id)[0] === 15);
  // ~1,1 km par tuile au zoom 15 : un disque de 20 km en compte environ 300
  assert.ok(z15.length > 200 && z15.length < 450, `zoom 15 : ${z15.length}`);
  const centre = zxyVersTileId(15, Math.floor(lonVersX(166.365, 15)), Math.floor(latVersY(-22.135, 15)));
  assert.ok(ids.includes(centre));
  const zooms = new Set(ids.map((id) => tileIdVersZxy(id)[0]));
  assert.deepEqual([...zooms].sort((a, b) => a - b), [6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  // un coin à 14 km n'y est pas
  const loin = zxyVersTileId(15, Math.floor(lonVersX(166.465, 15)), Math.floor(latVersY(-22.235, 15)));
  assert.ok(!ids.includes(loin));
});

test("plan : tuiles le long d'un trajet", () => {
  const ligne: [number, number][] = [
    [-22.135, 166.365],
    [-22.2, 166.45],
  ];
  const ids = tuilesLigne(ligne, 1_500);
  for (const [lat, lng] of ligne) {
    assert.ok(ids.includes(zxyVersTileId(15, Math.floor(lonVersX(lng, 15)), Math.floor(latVersY(lat, 15)))));
  }
  // milieu de la ligne
  assert.ok(ids.includes(zxyVersTileId(15, Math.floor(lonVersX(166.4075, 15)), Math.floor(latVersY(-22.1675, 15)))));
  assert.deepEqual(tuilesLigne([]), []);
});

test("plan : morceaux réunis, limités en taille, sans doublon", () => {
  const m = regrouper(
    [
      { debut: 1000, longueur: 100 },
      { debut: 0, longueur: 100 },
      { debut: 0, longueur: 100 }, // même contenu (mer) : une fois
      { debut: 150, longueur: 50 }, // proche : réuni
      { debut: 900_000, longueur: 10 }, // loin : nouveau morceau
    ],
    1000,
    1_000_000,
  );
  assert.deepEqual(m, [
    [0, 1100],
    [900_000, 900_010],
  ]);
  assert.equal(octetsTotal(m), 1110);
  // taille maximale respectée
  const plein = regrouper(
    Array.from({ length: 10 }, (_, i) => ({ debut: i * 100, longueur: 100 })),
    0,
    350,
  );
  assert.deepEqual(plein, [
    [0, 300],
    [300, 600],
    [600, 900],
    [900, 1000],
  ]);
});

test("plan : index gardé sur le téléphone", () => {
  const entrees: Entree[] = [
    { tileId: 30, longueurSerie: 1, debut: 5000, longueur: 40 },
    { tileId: 10, longueurSerie: 4, debut: 1000, longueur: 20 },
  ];
  const morceaux: [number, number][] = [
    [5000, 5040],
    [1000, 1020],
  ];
  const idx = lireIndex(encoderIndex(entrees, morceaux));
  if (!idx) throw new Error("index illisible");
  assert.deepEqual(chercherTuile(idx, 12), [1000, 20]);
  assert.deepEqual(chercherTuile(idx, 30), [5000, 40]);
  assert.equal(chercherTuile(idx, 14), null);
  assert.equal(chercherTuile(idx, 5), null);
  assert.equal(chercherMorceau(idx, 5000, 40), 1);
  assert.deepEqual(morceauDe(idx, 0), [1000, 1020]);
  assert.equal(chercherMorceau(idx, 5030, 20), -1);
  assert.equal(lireIndex(new ArrayBuffer(12)), null);
});

test("plan : tailles affichées", () => {
  assert.equal(texteOctets(650_000), "650 Ko");
  assert.equal(texteOctets(2_400_000), "2,4 Mo");
  assert.equal(texteOctets(23_498_388), "23 Mo");
  assert.equal(texteOctets(10), "1 Ko");
});

// --- Dessin ------------------------------------------------------------------

test("dessin : style et largeur des routes", () => {
  assert.equal(styleRoute("major_road", "secondary")?.fond, "#f7fabf");
  assert.equal(styleRoute("major_road", "trunk")?.fond, "#fcd6a4");
  assert.equal(styleRoute("highway", "motorway")?.rang, 5);
  assert.equal(styleRoute("ferry", null), null);
  const l: [number, number][] = [
    [12, 1],
    [14, 3],
  ];
  assert.equal(largeurAuZoom(l, 11), 0);
  assert.equal(largeurAuZoom(l, 13), 2);
  assert.equal(largeurAuZoom(l, 17), 3);
});

test("dessin : noms des lieux selon le zoom, les plus grands d'abord", () => {
  const lieu = (name: string, kind: string, min_zoom: number, population_rank: number): Objet => ({
    type: 1,
    parties: [[100, 100]],
    props: { name, kind, min_zoom, population_rank },
  });
  const objets = [lieu("Nétéa", "neighbourhood", 13, 1), lieu("Païta", "locality", 8, 6), lieu("Nouméa", "locality", 6, 8)];
  assert.deepEqual(
    lieuxAffiches(objets, 10).map((o) => o.props.name),
    ["Nouméa", "Païta"],
  );
  assert.deepEqual(
    lieuxAffiches(objets, 13).map((o) => o.props.name),
    ["Nouméa", "Païta", "Nétéa"],
  );
});
