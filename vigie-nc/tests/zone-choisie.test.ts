// « Ma zone » choisie sur la carte quand la position est refusée ou
// introuvable : gardée sur l'appareil, seulement en Nouvelle-Calédonie.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dansLaCaledonie,
  effacerPointZone,
  lirePointZone,
  readPointZone,
  savePointZone,
} from "../lib/preferences";

function avecStockage(fn: (donnees: Map<string, string>) => void) {
  const donnees = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => donnees.get(k) ?? null,
      setItem: (k: string, v: string) => void donnees.set(k, v),
      removeItem: (k: string) => void donnees.delete(k),
    },
  };
  try {
    fn(donnees);
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
}

const BOULARI = { lat: -22.2385, lng: 166.4718 };

test("zone choisie : seulement en Nouvelle-Calédonie (îles comprises)", () => {
  assert.equal(dansLaCaledonie(BOULARI), true);
  assert.equal(dansLaCaledonie({ lat: -21.47, lng: 168.03 }), true); // Maré
  assert.equal(dansLaCaledonie({ lat: -19.75, lng: 163.66 }), true); // Belep
  assert.equal(dansLaCaledonie({ lat: -22.62, lng: 167.48 }), true); // Île des Pins
  assert.equal(dansLaCaledonie({ lat: -17.73, lng: 168.32 }), false); // Port-Vila
  assert.equal(dansLaCaledonie({ lat: -33.87, lng: 151.21 }), false); // Sydney
  assert.equal(dansLaCaledonie({ lat: Number.NaN, lng: 166 }), false);
});

test("zone choisie : un texte abîmé ne casse rien", () => {
  assert.equal(lirePointZone(null), null);
  assert.equal(lirePointZone(""), null);
  assert.equal(lirePointZone("pas du json"), null);
  assert.equal(lirePointZone("null"), null);
  assert.equal(lirePointZone('{"lat":"-22","lng":"166"}'), null);
  assert.equal(lirePointZone('{"lat":48.85,"lng":2.35}'), null); // Paris
  assert.deepEqual(lirePointZone(JSON.stringify(BOULARI)), BOULARI);
});

test("zone choisie : gardée sur l'appareil, puis retirée", () => {
  assert.equal(readPointZone(), null); // pas de stockage (comme côté serveur)
  avecStockage((donnees) => {
    assert.equal(readPointZone(), null);
    assert.equal(savePointZone({ lat: -22.238512345, lng: 166.471798765 }), true);
    assert.deepEqual(readPointZone(), { lat: -22.23851, lng: 166.4718 }); // arrondi à ~1 m
    assert.equal(savePointZone({ lat: -17.73, lng: 168.32 }), false); // hors Calédonie : refusé
    assert.deepEqual(readPointZone(), { lat: -22.23851, lng: 166.4718 }); // l'ancien reste
    effacerPointZone();
    assert.equal(readPointZone(), null);
    assert.equal(donnees.size, 0);
  });
});
