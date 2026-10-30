// Trajet favori : ligne envoyée à la base (sans les extrémités), point sur
// le trajet, jours et heures, textes des alertes, mémoire du téléphone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceM } from "../lib/geo";
import {
  arrondirPosition,
  basculerJour,
  couperExtremites,
  dansNc,
  depuisDepartTexte,
  dureeTexte,
  heureTexte,
  heureValide,
  JOURS_SEMAINE,
  JOURS_TOUS,
  joursTexte,
  limiterPoints,
  lireTrajetTexte,
  longueurLigne,
  longueurTexte,
  positionSurLigne,
  preparerLigne,
  simplifier,
  sousLigne,
  texteAvantDepart,
  texteFinAlerte,
  texteSurTrajet,
  texteVerdict,
  TRAJET_COUPE_M,
  TRAJET_POINTS_MAX,
  verdictTrajet,
  type Point,
} from "../lib/trajet";

// Ligne droite près de Bourail, ≈ 9 km (même ligne que les essais SQL)
const A: Point = [-21.6, 165.45];
const B: Point = [-21.54, 165.51];

/** Ligne de A à B découpée en n segments. */
function ligneDroite(n: number): Point[] {
  return Array.from({ length: n + 1 }, (_, i) => [A[0] + ((B[0] - A[0]) * i) / n, A[1] + ((B[1] - A[1]) * i) / n] as Point);
}

const ll = (p: Point) => ({ lat: p[0], lng: p[1] });

test("trajet : longueur et morceau de ligne", () => {
  const l = longueurLigne([A, B]);
  assert.ok(l > 8500 && l < 9500, `longueur ${l}`);
  const morceau = sousLigne(ligneDroite(10), 1000, 3000);
  assert.ok(Math.abs(longueurLigne(morceau) - 2000) < 5);
  assert.ok(Math.abs(distanceM(ll(A), ll(morceau[0])) - 1000) < 5);
  assert.deepEqual(sousLigne([A, B], 5000, 4000), []);
});

test("trajet : la maison et le travail ne partent pas (500 m retirés de chaque côté)", () => {
  const ligne = ligneDroite(50);
  const { points, coupeM } = couperExtremites(ligne);
  assert.equal(coupeM, TRAJET_COUPE_M);
  assert.ok(Math.abs(distanceM(ll(A), ll(points[0])) - 500) < 2);
  assert.ok(Math.abs(distanceM(ll(B), ll(points[points.length - 1])) - 500) < 2);
  // trajet court (1,2 km) : 20 % de chaque côté au plus, il en reste
  const court = sousLigne(ligne, 0, 1200);
  const coupe = couperExtremites(court);
  assert.ok(Math.abs(coupe.coupeM - 240) < 2);
  assert.ok(longueurLigne(coupe.points) > 700);
});

test("trajet : simplification et nombre de points", () => {
  // une ligne droite en 1 000 morceaux redevient 2 points
  assert.equal(simplifier(ligneDroite(1000), 5).length, 2);
  // un détour de ~1 km est gardé
  const detour: Point[] = [A, [-21.57 + 0.009, 165.48 - 0.009], B];
  assert.equal(simplifier(detour, 15).length, 3);
  // ligne en zigzag : jamais plus de TRAJET_POINTS_MAX points
  const zigzag = Array.from({ length: 3000 }, (_, i) => [-21.6 + i * 0.00002, 165.45 + (i % 2) * 0.002] as Point);
  const limite = limiterPoints(zigzag);
  assert.ok(limite.length <= TRAJET_POINTS_MAX, `${limite.length} points`);
  const prep = preparerLigne(ligneDroite(200));
  assert.equal(prep.points.length, 2);
  assert.ok(prep.longueurM > 7500 && prep.longueurM < 8500);
});

test("trajet : distance à la ligne et place le long du trajet", () => {
  const ligne = ligneDroite(20);
  const milieu = { lat: -21.57, lng: 165.48 };
  const p = positionSurLigne(milieu, ligne);
  assert.ok(p.distanceM < 5);
  assert.ok(Math.abs(p.positionM - longueurLigne(ligne) / 2) < 50);
  // ~1,9 km à côté (même point que les essais SQL)
  const loin = positionSurLigne({ lat: -21.5573, lng: 165.4673 }, ligne);
  assert.ok(loin.distanceM > 1500 && loin.distanceM < 2300, `${loin.distanceM}`);
});

test("trajet : point sur le trajet (verdict)", () => {
  const r = (type: string, confirmations = 0, officialSource: string | null = null) =>
    ({ type, confirmations, officialSource, active: true }) as Parameters<typeof verdictTrajet>[0][number];
  assert.equal(verdictTrajet([]).niveau, "calme");
  assert.equal(texteVerdict(verdictTrajet([])), "Rien de signalé");
  // un danger pas encore confirmé, des travaux : à surveiller
  const v1 = verdictTrajet([r("inondation"), r("travaux", 3)]);
  assert.equal(v1.niveau, "surveiller");
  assert.equal(texteVerdict(v1), "2 à surveiller");
  // confirmé par une 2e personne ou vérifié : danger (même règle que les alertes)
  const v2 = verdictTrajet([r("route_coupee", 1), r("accident", 0, "Gendarmerie"), r("trafic_dense", 5)]);
  assert.equal(v2.niveau, "danger");
  assert.equal(v2.dangers.length, 2);
  assert.equal(v2.aSurveiller.length, 1);
  assert.equal(texteVerdict(v2), "2 dangers");
  // jamais de SOS, ni de signalement terminé
  assert.equal(verdictTrajet([r("sos", 3), { ...r("accident", 2), active: false }]).niveau, "calme");
});

test("trajet : jours et heures", () => {
  assert.equal(joursTexte(JOURS_SEMAINE), "du lundi au vendredi");
  assert.equal(joursTexte(JOURS_TOUS), "tous les jours");
  assert.equal(joursTexte(0b1100000), "le week-end");
  assert.equal(joursTexte(0b0010101), "lun, mer, ven");
  assert.equal(joursTexte(0b0000100), "le mercredi");
  assert.equal(joursTexte(0b0001110), "du mardi au jeudi");
  assert.equal(basculerJour(JOURS_SEMAINE, 5), 0b0111111);
  assert.equal(basculerJour(JOURS_SEMAINE, 0), 0b0011110);
  assert.ok(heureValide("06:30") && heureValide("23:59") && heureValide("00:00"));
  assert.ok(!heureValide("24:00") && !heureValide("6:30") && !heureValide("6h30") && !heureValide(null));
  assert.equal(heureTexte("06:30"), "6 h 30");
  assert.equal(heureTexte("17:00"), "17 h");
});

test("trajet : distances et durées", () => {
  assert.equal(depuisDepartTexte(400), "à moins d'1 km du départ");
  assert.equal(depuisDepartTexte(4550), "à 5 km du départ");
  assert.equal(depuisDepartTexte(null), null);
  assert.equal(longueurTexte(28_400), "28 km");
  assert.equal(longueurTexte(4_560), "4,6 km");
  assert.equal(dureeTexte(35 * 60), "35 min");
  assert.equal(dureeTexte(70 * 60), "1 h 10");
  assert.equal(dureeTexte(120 * 60), "2 h");
});

test("trajet : textes des alertes", () => {
  assert.equal(texteSurTrajet(12_300), "sur ton trajet, à 12 km du départ");
  assert.equal(texteSurTrajet(null), "sur ton trajet");
  // 19 h 30 UTC = 6 h 30 le lendemain à Nouméa
  const t = texteAvantDepart({
    sens: "aller",
    depart: "2026-10-30T19:30:00Z",
    nb: 4,
    problemes: [
      { id: "1", type: "route_coupee", lieu: "RT1, Païta", depuis_depart_m: 4_800 },
      { id: "2", type: "inondation", lieu: null, depuis_depart_m: 12_000 },
      { id: "3", type: "accident", lieu: "Dumbéa", depuis_depart_m: 300 },
      { id: "4", type: "feu", lieu: "Tontouta", depuis_depart_m: 20_000 },
    ],
  });
  assert.equal(t.title, "Trajet de 6 h 30 · 4 dangers");
  assert.match(t.body, /^Route coupée · RT1, Païta, à 5 km du départ\. Inondation, à 12 km du départ\./);
  assert.match(t.body, /Et 1 autre\. Vérifie avant de partir\.$/);
  const retour = texteAvantDepart({ sens: "retour", depart: "2026-10-30T05:30:00Z", nb: 1, problemes: [] });
  assert.equal(retour.title, "Retour de 16 h 30 · 1 danger");
  const fin = texteFinAlerte("inondation", "RT1, Païta");
  assert.equal(fin.title, "Fin d'alerte · Inondation · RT1, Païta");
  // factuel, sans emoji ni « touche ici » (Chrome les classe en spam)
  for (const texte of [t.title, t.body, fin.title, fin.body]) {
    assert.doesNotMatch(texte, /\p{Extended_Pictographic}|touche/iu);
  }
});

test("trajet : mémoire du téléphone", () => {
  const bon = {
    v: 1,
    points: [A, B],
    longueurM: 9000,
    distanceTotaleM: 10_000,
    dureeS: 900,
    jours: JOURS_SEMAINE,
    aller: "06:30",
    retour: null,
    majAt: "2026-10-30T00:00:00Z",
  };
  assert.deepEqual(lireTrajetTexte(JSON.stringify(bon)), bon);
  assert.equal(lireTrajetTexte(null), null);
  assert.equal(lireTrajetTexte("pas du json"), null);
  assert.equal(lireTrajetTexte(JSON.stringify({ ...bon, points: [A] })), null);
  assert.equal(lireTrajetTexte(JSON.stringify({ ...bon, jours: 0 })), null);
  assert.equal(lireTrajetTexte(JSON.stringify({ ...bon, aller: "25:00" })), null);
  assert.equal(lireTrajetTexte(JSON.stringify({ ...bon, points: [A, ["x", 1]] })), null);
});

test("trajet : positions envoyées et emprise de la Calédonie", () => {
  assert.deepEqual(arrondirPosition({ lat: -22.27654, lng: 166.45321 }), { lat: -22.277, lng: 166.453 });
  assert.ok(dansNc({ lat: -22.27, lng: 166.45 }));
  assert.ok(!dansNc({ lat: 48.85, lng: 2.35 }));
});
