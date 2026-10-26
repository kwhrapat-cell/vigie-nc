// Fiche du territoire : sans NEXT_PUBLIC_TERRITOIRE, la Calédonie doit
// rester EXACTEMENT comme avant la fiche (valeurs et textes d'origine).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cadreRecherche,
  majuscule,
  NOM_APPLI,
  PHRASES,
  premierMotAppuye,
  TERRITOIRE,
  territoireDepuisCode,
  URGENCES,
} from "../lib/territoire";
import { CENTRE_PAR_DEFAUT } from "../lib/geo";
import { EMPRISE_TERRITOIRE } from "../lib/map-styles";
import { SHARE_TEXT, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "../lib/site";
import { CONSIGNE, CONSIGNE_POINT_ROUTE } from "../lib/ia";
import { aujourdhuiLocal } from "../lib/chantier";

test("territoire : la Calédonie par défaut, code inconnu refusé", () => {
  assert.equal(TERRITOIRE.code, "nc");
  assert.equal(territoireDepuisCode(undefined).code, "nc");
  assert.equal(territoireDepuisCode("").code, "nc");
  assert.equal(territoireDepuisCode(" NC ").code, "nc");
  assert.throws(() => territoireDepuisCode("xx"), /inconnu/);
});

test("territoire : valeurs techniques d'origine de la Calédonie", () => {
  assert.equal(TERRITOIRE.fuseau, "Pacific/Noumea");
  assert.deepEqual(CENTRE_PAR_DEFAUT, { lat: -22.24, lng: 166.47 });
  assert.deepEqual(EMPRISE_TERRITOIRE, [
    [-22.8, 163.5],
    [-19.5, 168.2],
  ]);
  // Paramètres de recherche Nominatim d'origine
  assert.equal(TERRITOIRE.codePays, "nc");
  assert.equal(cadreRecherche(), "163.5,-19.5,168.2,-22.8");
  assert.deepEqual(URGENCES, { samu: "15", police: "17", pompiers: "18" });
  assert.equal(TERRITOIRE.exempleTelephone, "+687 XX.XX.XX");
  assert.deepEqual(TERRITOIRE.meteo, {
    service: "Météo-France Nouvelle-Calédonie",
    source: "Météo-France",
    site: "meteo.nc",
    vignette: "https://meteo.nc/fr/widget-vigilance/vigilance",
    page: "https://meteo.nc/fr/vigilance",
  });
  // 23 h 30 à Nouméa le 24 = 12 h 30 UTC ; 00 h 30 le 25 = 13 h 30 UTC le 24
  assert.equal(aujourdhuiLocal(new Date("2026-10-24T12:30:00Z")), "2026-10-24");
  assert.equal(aujourdhuiLocal(new Date("2026-10-24T13:30:00Z")), "2026-10-25");
});

test("territoire : textes d'origine (nom, phrases, partage)", () => {
  assert.equal(NOM_APPLI, "Vigie NC");
  assert.equal(SITE_NAME, "Vigie NC");
  assert.equal(TERRITOIRE.sigle, "NC");
  assert.equal(SITE_URL, "https://vigie-nc.com");
  assert.equal(majuscule(PHRASES.toutLeTerritoire), "Toute la Calédonie");
  assert.equal(premierMotAppuye(PHRASES.toutLeTerritoire), "TOUTE la Calédonie");
  assert.equal(majuscule(PHRASES.toutLeNom), "Toute la Nouvelle-Calédonie");
  assert.equal(majuscule(PHRASES.toutLeSigle), "Toute la NC");
  assert.equal(majuscule(PHRASES.enCourt), "En Calédonie");
  assert.equal(majuscule(`partout ${PHRASES.enCourt}`), "Partout en Calédonie");
  assert.equal(`Choisis un lieu ${PHRASES.enNom}.`, "Choisis un lieu en Nouvelle-Calédonie.");
  assert.equal(
    `Cette position semble ${PHRASES.horsDuNom} : le signalement n'a pas été envoyé.`,
    "Cette position semble hors de Nouvelle-Calédonie : le signalement n'a pas été envoyé.",
  );
  assert.equal(
    SITE_DESCRIPTION,
    "L'état des routes en Nouvelle-Calédonie, en direct : inondations, accidents, routes coupées, signalés anonymement par les Calédoniens. Gratuit, sans compte.",
  );
  assert.equal(
    SHARE_TEXT,
    "Je t'envoie Vigie NC : la carte en direct de l'état des routes en Nouvelle-Calédonie (inondations, accidents, routes coupées), signalé anonymement par les Calédoniens. Gratuit et sans compte.",
  );
  assert.ok(
    CONSIGNE.startsWith(
      "Tu écris le résumé d'un signalement routier pour Vigie NC, une carte citoyenne et anonyme de l'état des routes en Nouvelle-Calédonie.\n",
    ),
  );
  assert.ok(
    CONSIGNE_POINT_ROUTE.startsWith(
      "Tu es la voix du mode conduite de Vigie NC, une carte citoyenne et anonyme de l'état des routes en Nouvelle-Calédonie.\n",
    ),
  );
});
