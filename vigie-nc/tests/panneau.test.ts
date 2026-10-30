// Accueil sur ordinateur : panneau de gauche replié ou ouvert, et vue par
// défaut (toute la Calédonie) quand aucune zone n'a été choisie.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readPanneauReplie, readZoneChoice, savePanneauReplie, saveZoneChoice } from "../lib/preferences";

function avecStockage(fn: () => void) {
  const donnees = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => donnees.get(k) ?? null,
      setItem: (k: string, v: string) => void donnees.set(k, v),
    },
  };
  try {
    fn();
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
}

test("panneau : ouvert par défaut, choix gardé sur l'appareil", () => {
  assert.equal(readPanneauReplie(), false); // pas de stockage (comme côté serveur)
  avecStockage(() => {
    assert.equal(readPanneauReplie(), false);
    savePanneauReplie(true);
    assert.equal(readPanneauReplie(), true);
    savePanneauReplie(false);
    assert.equal(readPanneauReplie(), false);
  });
});

test("zone : la vue par défaut ne sert que tant que rien n'est choisi", () => {
  avecStockage(() => {
    assert.equal(readZoneChoice(), 5); // téléphone : le rayon habituel
    assert.equal(readZoneChoice("nc"), "nc"); // ordinateur : toute la Calédonie
    saveZoneChoice(3);
    assert.equal(readZoneChoice("nc"), 3); // un choix fait l'emporte toujours
    saveZoneChoice("nc");
    assert.equal(readZoneChoice(), "nc");
  });
});
