// Mode conduite : annonces vocales (lib/conduite.ts). Les cas de
// cas-conduite.json sont AUSSI joués par l'appli Android
// (android/app/src/test/…/ConduiteCasTest.kt) : les deux doivent dire
// exactement la même chose.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  aAnnoncer,
  citesPointRoute,
  dangersDevant,
  distanceParlee,
  evenementsDevant,
  palierPour,
  paliers,
  type PorteeKm,
  textePointRoute,
} from "../lib/conduite";
import { offsetKm, type LatLng } from "../lib/geo";
import type { Report, ReportType } from "../lib/types";

interface SignalementCas {
  id: string;
  type: ReportType;
  nordM: number;
  estM: number;
  confirmations: number;
  source?: string;
  expireDansMin?: number;
}
interface Cas {
  nom: string;
  portee: PorteeKm;
  trafic: boolean;
  signalements: SignalementCas[];
  cap: number | null;
  pasM: number;
  distanceM: number;
  annonces: [string, number][];
}

const donnees = JSON.parse(readFileSync(new URL("./cas-conduite.json", import.meta.url), "utf8")) as {
  cas: Cas[];
  distancesParlees: [number, string][];
};
const DEPART: LatLng = { lat: -22.27, lng: 166.58 };

function signalement(s: Omit<SignalementCas, "nordM" | "estM"> & { lieu: LatLng }, now: number): Report {
  return {
    id: s.id,
    type: s.type,
    label: s.type,
    lat: s.lieu.lat,
    lng: s.lieu.lng,
    createdAt: new Date(now - 10 * 60_000).toISOString(),
    expiresAt: new Date(now + (s.expireDansMin ?? 60) * 60_000).toISOString(),
    confirmations: s.confirmations,
    infirmations: 0,
    officialSource: s.source ?? null,
    active: true,
  };
}

/** On roule plein nord et on note chaque annonce : [identifiant, palier]. */
function rouler(c: Cas): [string, number][] {
  const now = Date.now();
  const reports = c.signalements.map((s) =>
    signalement({ ...s, lieu: offsetKm(DEPART, s.nordM / 1000, s.estM / 1000) }, now),
  );
  const deja = new Map<string, number>();
  const annonces: [string, number][] = [];
  const pas = c.pasM > 0 ? Math.floor(c.distanceM / c.pasM) : 0;
  for (let i = 0; i <= pas; i++) {
    const ici = offsetKm(DEPART, (i * c.pasM) / 1000, 0);
    const devant = dangersDevant(ici, c.cap, reports, c.trafic, c.portee, now);
    for (const d of aAnnoncer(devant, deja, c.portee)) annonces.push([d.report.id, deja.get(d.report.id)!]);
  }
  return annonces;
}

for (const c of donnees.cas) {
  test(`cas commun : ${c.nom}`, () => {
    assert.deepEqual(rouler(c), c.annonces);
  });
}

test("cas commun : distances dites à voix haute", () => {
  for (const [m, texte] of donnees.distancesParlees) assert.equal(distanceParlee(m), texte, `${m} m`);
});

test("paliers selon la portée", () => {
  assert.deepEqual(paliers(3), [3000, 500]);
  assert.deepEqual(paliers(5), [5000, 500]);
  assert.deepEqual(paliers(10), [10000, 3000, 500]);
  assert.equal(palierPour(4200, paliers(5)), 5000);
  assert.equal(palierPour(450, paliers(5)), 500);
  assert.equal(palierPour(6000, paliers(5)), null);
});

test("réduire la portée en route ne refait pas l'annonce", () => {
  const now = Date.now();
  const r = signalement({ id: "a", type: "inondation", confirmations: 1, lieu: DEPART }, now);
  const deja = new Map<string, number>();
  assert.equal(aAnnoncer([{ report: r, distanceM: 4000 }], deja, 10).length, 1);
  assert.equal(aAnnoncer([{ report: r, distanceM: 3900 }], deja, 5).length, 0);
  assert.equal(aAnnoncer([{ report: r, distanceM: 400 }], deja, 5).length, 1);
});

test("un danger cité par le point route n'est redit qu'à 500 m", () => {
  // Même règle que demanderPointRoute (components/ModeConduite.tsx).
  const now = Date.now();
  const r = signalement({ id: "a", type: "inondation", confirmations: 1, lieu: offsetKm(DEPART, 3.9, 0) }, now);
  const deja = new Map<string, number>();
  const cites = citesPointRoute(evenementsDevant(DEPART, null, [r], now));
  assert.equal(cites.length, 1);
  for (const d of cites) {
    const p = palierPour(d.distanceM, paliers(5));
    if (p != null) deja.set(d.report.id, p);
  }
  const dits: number[] = [];
  for (let m = 0; m <= 3900; m += 50) {
    const ici = offsetKm(DEPART, m / 1000, 0);
    for (const d of aAnnoncer(dangersDevant(ici, 0, [r], false, 5, now), deja, 5)) dits.push(deja.get(d.report.id)!);
  }
  assert.deepEqual(dits, [500]);
});

test("point route sans IA : dangers d'abord, 4 nommés, le reste compté", () => {
  const now = Date.now();
  const types: ReportType[] = ["travaux", "accident", "chaussee_degradee", "inondation", "travaux", "autre"];
  const reports = types.map((t, i) =>
    signalement(
      { id: `s${i}`, type: t, confirmations: t === "accident" ? 1 : 0, lieu: offsetKm(DEPART, 1 + i, 0) },
      now,
    ),
  );
  const texte = textePointRoute(evenementsDevant(DEPART, 0, reports, now), true);
  assert.match(texte, /^Sur les 10 prochains kilomètres : accident à \d/);
  assert.ok(texte.indexOf("inondation") < texte.indexOf("travaux"), texte);
  assert.match(texte, /inondation à [\d,]+ kilomètres, à confirmer/);
  assert.match(texte, /et 2 autres signalements\.$/);
  assert.match(textePointRoute([], false), /^Rien de signalé sur Vigie NC à moins de 10 kilomètres/);
});
