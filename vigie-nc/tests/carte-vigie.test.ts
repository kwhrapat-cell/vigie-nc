// Fond de carte « Vigie » (revue de design du 11/11/2026) : lecture du
// fichier de la carte par blocs de 32 Ko, palettes sobres (jamais de route
// rouge ou orange), numéros des routes, fond gardé sur l'appareil.
import { test } from "node:test";
import assert from "node:assert/strict";
import { adresseBloc, assembler, BLOC_OCTETS, blocsCouvrant, bornesBloc } from "../lib/carte-blocs";
import { classeRoute, milieuLigne, numeroRoute, PALETTES, styleRoute } from "../lib/carte-dessin";
import { lireFond } from "../lib/preferences";

test("blocs : ceux qui couvrent une plage d'octets", () => {
  assert.deepEqual(blocsCouvrant(0, 16_384), [0]);
  assert.deepEqual(blocsCouvrant(32_000, 1_000), [0, 1]);
  assert.deepEqual(blocsCouvrant(32_768, 32_768), [1]);
  assert.deepEqual(blocsCouvrant(100_000, 70_000), [3, 4, 5]);
  assert.deepEqual(blocsCouvrant(5, 0), []);
});

test("blocs : bornes et adresse, la même pour tout le monde", () => {
  assert.deepEqual(bornesBloc(0, 23_498_388), [0, 32_767]);
  // Le dernier bloc s'arrête à la fin du fichier.
  assert.deepEqual(bornesBloc(717, 23_498_388), [717 * BLOC_OCTETS, 23_498_387]);
  assert.equal(adresseBloc("nc-20261103.pmtiles", 2, 23_498_388), "/api/carte?f=nc-20261103.pmtiles&debut=65536&fin=98303");
});

test("blocs : les octets recollés sont ceux du fichier", () => {
  const bloc = 8;
  const fichier = Uint8Array.from({ length: 40 }, (_, i) => i);
  const blocs = new Map<number, Uint8Array>();
  for (let n = 0; n * bloc < fichier.length; n++) blocs.set(n, fichier.subarray(n * bloc, (n + 1) * bloc));
  assert.deepEqual([...assembler(blocs, 5, 14, bloc)], [...fichier.subarray(5, 19)]);
  assert.deepEqual([...assembler(blocs, 16, 8, bloc)], [...fichier.subarray(16, 24)]);
  assert.deepEqual([...assembler(blocs, 33, 7, bloc)], [...fichier.subarray(33, 40)]);
  blocs.delete(2);
  assert.throws(() => assembler(blocs, 5, 14, bloc), /bloc_manquant/);
});

/** Écart entre la plus forte et la plus faible composante (0 = gris). */
function chroma(hex: string): number {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (Math.max(...v) - Math.min(...v)) / 255;
}

test("palettes Vigie : routes et numéros en couleurs neutres, jamais rouge ni orange", () => {
  for (const nom of ["vigie", "vigie-clair"] as const) {
    const p = PALETTES[nom];
    for (const [cle, trace] of Object.entries(p.routes)) {
      if (!trace) continue;
      assert.ok(chroma(trace.fond) < 0.25, `${nom} ${cle} ${trace.fond}`);
      if (trace.bord) assert.ok(chroma(trace.bord) < 0.25, `${nom} ${cle} bord ${trace.bord}`);
    }
    assert.ok(p.cartouche);
    for (const c of Object.values(p.cartouche)) assert.ok(chroma(c) < 0.25, `${nom} cartouche ${c}`);
  }
  // Le plan OpenStreetMap, lui, garde ses couleurs (carte sans réseau dessous).
  assert.equal(styleRoute("major_road", "trunk", "osm")?.fond, "#fcd6a4");
  assert.equal(styleRoute("major_road", "trunk", "vigie")?.fond, PALETTES.vigie.routes.principale?.fond);
});

test("routes : classes Protomaps", () => {
  assert.equal(classeRoute("highway", "motorway"), "highway");
  assert.equal(classeRoute("major_road", "primary"), "principale");
  assert.equal(classeRoute("major_road", "trunk"), "principale");
  assert.equal(classeRoute("major_road", "tertiary"), "secondaire");
  assert.equal(classeRoute("path", "track"), "piste");
  assert.equal(classeRoute("path", "footway"), "path");
  assert.equal(classeRoute("ferry", undefined), null);
  assert.equal(classeRoute("rail", "rail"), null);
});

test("numéros des routes : les grandes de loin, les municipales de près", () => {
  const rt1 = { kind: "major_road", kind_detail: "primary", ref: "RT1" };
  assert.equal(numeroRoute(rt1, 9), null);
  assert.equal(numeroRoute(rt1, 10), "RT1");
  const rp = { kind: "major_road", kind_detail: "secondary", ref: "RPN  3" };
  assert.equal(numeroRoute(rp, 11), null);
  assert.equal(numeroRoute(rp, 12), "RPN 3");
  const rm = { kind: "minor_road", kind_detail: "residential", ref: "RM5" };
  assert.equal(numeroRoute(rm, 13), null);
  assert.equal(numeroRoute(rm, 14), "RM5");
  assert.equal(numeroRoute({ ...rt1, is_link: true }, 14), null);
  assert.equal(numeroRoute({ ...rt1, ref: "RT1;RT3" }, 12), "RT1");
  assert.equal(numeroRoute({ kind: "major_road", kind_detail: "primary" }, 12), null);
});

test("numéros des routes : au milieu de la plus longue partie", () => {
  const ident = (x: number, y: number): [number, number] => [x, y];
  assert.deepEqual(milieuLigne([[0, 0, 10, 0]], ident), [5, 0]);
  assert.deepEqual(
    milieuLigne(
      [
        [0, 0, 2, 0],
        [0, 10, 0, 20, 30, 20],
      ],
      ident,
    ),
    [10, 20],
  );
  assert.equal(milieuLigne([[3, 3]], ident), null);
});

test("fond gardé : « Vigie » par défaut, l'ancien « Nuit » devient « Vigie »", () => {
  assert.equal(lireFond(null), "vigie");
  assert.equal(lireFond("nuit"), "vigie");
  assert.equal(lireFond("plan"), "plan");
  assert.equal(lireFond("vigie-clair"), "vigie-clair");
  assert.equal(lireFond("satellite"), "satellite");
  assert.equal(lireFond("n'importe quoi"), "vigie");
});
