// Annonces d'une commune : le téléphone ne montre que celles de son périmètre.
import { test } from "node:test";
import assert from "node:assert/strict";
import { annoncesPourMoi, dansPerimetre, destinataires, libelleZone, textePerimetre } from "../lib/annonces-zone";
import { offsetKm } from "../lib/geo";
import type { Annonce, Perimetre } from "../lib/types";

const BOULARI = { lat: -22.2312, lng: 166.5262 };
const MONT_DORE: Perimetre = { id: "mont-dore", nom: "Ville du Mont-Dore", ...BOULARI, rayonM: 12_000 };

function annonce(id: string, zone: Perimetre | null | undefined): Annonce {
  return {
    id,
    niveau: "vigilance",
    texte: "Radier de La Coulée fermé.",
    source: null,
    createdAt: "2026-11-10T08:00:00Z",
    expiresAt: "2026-11-10T12:00:00Z",
    ...(zone === undefined ? {} : { zone }),
  };
}

const NC = annonce("nc", null);
const ANCIENNE_COPIE = annonce("ancienne", undefined);
const COMMUNE = annonce("commune", MONT_DORE);

test("annonces de commune : dans le périmètre, on les voit", () => {
  const dedans = offsetKm(BOULARI, 0, 11);
  assert.ok(dansPerimetre(MONT_DORE, dedans));
  assert.deepEqual(annoncesPourMoi([NC, COMMUNE], dedans).map((a) => a.id), ["nc", "commune"]);
});

test("annonces de commune : dehors ou sans position, seulement toute la Calédonie", () => {
  const dehors = offsetKm(BOULARI, 0, 13);
  assert.equal(dansPerimetre(MONT_DORE, dehors), false);
  assert.deepEqual(annoncesPourMoi([NC, COMMUNE], dehors).map((a) => a.id), ["nc"]);
  assert.deepEqual(annoncesPourMoi([NC, COMMUNE], null).map((a) => a.id), ["nc"]);
});

test("annonces de commune : une ancienne copie sans zone vaut toute la Calédonie", () => {
  assert.deepEqual(annoncesPourMoi([ANCIENNE_COPIE], null).map((a) => a.id), ["ancienne"]);
  assert.equal(libelleZone(ANCIENNE_COPIE), "Toute la NC");
});

test("annonces de commune : celle ouverte depuis une notification reste visible", () => {
  assert.deepEqual(annoncesPourMoi([COMMUNE], null, "commune").map((a) => a.id), ["commune"]);
  assert.deepEqual(annoncesPourMoi([COMMUNE], null, "autre").map((a) => a.id), []);
});

test("annonces de commune : textes", () => {
  assert.equal(libelleZone(NC), "Toute la NC");
  assert.equal(libelleZone(COMMUNE), "Ville du Mont-Dore");
  assert.equal(destinataires(NC), "pour toute la Calédonie");
  assert.equal(destinataires(COMMUNE), "pour Ville du Mont-Dore");
  assert.equal(textePerimetre(MONT_DORE), "12 km autour du centre");
  assert.equal(textePerimetre({ ...MONT_DORE, rayonM: 7_500 }), "7,5 km autour du centre");
});
