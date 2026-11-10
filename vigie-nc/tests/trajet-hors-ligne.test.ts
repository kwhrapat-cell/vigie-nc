// Dernier point sur le trajet favori, gardé pour l'affichage sans réseau.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleTrajet, dernierPointUtilisable, TRAJET_DERNIER_MAX_MS } from "../lib/trajet-hors-ligne";
import type { Point } from "../lib/trajet";

const T0 = Date.UTC(2026, 10, 11, 3, 0, 0);
const ligne: Point[] = [
  [-22.2, 166.4],
  [-22.21, 166.45],
  [-22.22, 166.5],
];

function signalement(id: string, expiresAt: number) {
  return {
    positionM: 1200,
    report: { id, type: "inondation", expiresAt: new Date(expiresAt).toISOString() },
  };
}

function copie(partiel: Record<string, unknown> = {}) {
  return {
    cle: cleTrajet(ligne),
    at: T0,
    liste: [signalement("encore", T0 + 3_600_000), signalement("fini", T0 + 60_000)],
    memoire: {
      pluieEnCours: true,
      zones: [{ lieu: "Radier", lat: -22.21, lng: 166.45, fois: 3, derniere: "2026-10-20", enCours: true, positionM: 900 }],
    },
    ...partiel,
  };
}

test("trajet hors ligne : un autre trajet n'utilise pas la copie", () => {
  assert.notEqual(cleTrajet(ligne), cleTrajet([...ligne, [-22.3, 166.6]]));
  assert.equal(dernierPointUtilisable(copie(), cleTrajet([[-21, 165]]), T0), null);
});

test("trajet hors ligne : copie de plus de 12 h ignorée", () => {
  assert.notEqual(dernierPointUtilisable(copie(), cleTrajet(ligne), T0 + TRAJET_DERNIER_MAX_MS), null);
  assert.equal(dernierPointUtilisable(copie(), cleTrajet(ligne), T0 + TRAJET_DERNIER_MAX_MS + 1), null);
});

test("trajet hors ligne : signalements expirés depuis retirés", () => {
  const d = dernierPointUtilisable(copie(), cleTrajet(ligne), T0 + 5 * 60_000);
  assert.deepEqual(
    d?.liste.map((x) => x.report.id),
    ["encore"],
  );
});

test("trajet hors ligne : rien n'est dit « en ce moment » d'après une vieille copie", () => {
  const d = dernierPointUtilisable(copie(), cleTrajet(ligne), T0 + 60_000);
  assert.equal(d?.memoire?.pluieEnCours, false);
  assert.equal(d?.memoire?.zones[0].enCours, false);
  assert.equal(d?.memoire?.zones[0].fois, 3);
});

test("trajet hors ligne : copie abîmée ignorée", () => {
  assert.equal(dernierPointUtilisable(null, cleTrajet(ligne), T0), null);
  assert.equal(dernierPointUtilisable({ cle: cleTrajet(ligne), at: T0 }, cleTrajet(ligne), T0), null);
  assert.equal(dernierPointUtilisable(copie({ at: "hier" }), cleTrajet(ligne), T0), null);
  const sansMemoire = dernierPointUtilisable(copie({ memoire: null }), cleTrajet(ligne), T0);
  assert.equal(sansMemoire?.memoire, null);
});
