// Démonstration Mont-Dore : le scénario fictif reste crédible et sans danger.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANNONCE_DEMO,
  DEMO_EMPRISE,
  DEMO_POSITION,
  DEMO_SOURCE,
  demoActive,
  SCENARIO_MONT_DORE,
} from "../lib/demo";
import { distanceM } from "../lib/geo";
import { ANNONCE_SOURCE_MAX, ANNONCE_TEXTE_MAX, ANNONCE_TEXTE_MIN, REPORT_TYPE_LIFETIME_MIN } from "../lib/types";

const [[latMin, lngMin], [latMax, lngMax]] = DEMO_EMPRISE;
const dansLeCadre = (p: { lat: number; lng: number }) =>
  p.lat >= latMin && p.lat <= latMax && p.lng >= lngMin && p.lng <= lngMax;

test("démo : jamais active hors d'un navigateur (serveur, tests)", () => {
  assert.equal(demoActive(), false);
});

test("démo : tous les signalements et la position simulée sont dans le cadre du Mont-Dore", () => {
  assert.ok(dansLeCadre(DEMO_POSITION));
  for (const s of SCENARIO_MONT_DORE) assert.ok(dansLeCadre(s), `${s.place} hors du cadre`);
});

test("démo : chaque signalement est encore en cours quand on ouvre la démo", () => {
  for (const s of SCENARIO_MONT_DORE) {
    if (s.finDansJours != null) {
      assert.equal(s.type, "travaux", "seuls les travaux ont une date de fin annoncée");
      assert.ok(s.finDansJours >= 1);
    } else {
      assert.ok(s.ageMin < REPORT_TYPE_LIFETIME_MIN[s.type], `${s.place} déjà expiré`);
    }
  }
});

test("démo : la source officielle dit toujours que c'est un exemple", () => {
  assert.match(DEMO_SOURCE, /\(exemple\)$/);
  assert.ok(DEMO_SOURCE.length <= ANNONCE_SOURCE_MAX);
  const verifies = SCENARIO_MONT_DORE.filter((s) => s.officialSource);
  assert.ok(verifies.length >= 1, "au moins un signalement « Vérifié » à montrer");
  for (const s of verifies) assert.equal(s.officialSource, DEMO_SOURCE);
  assert.equal(ANNONCE_DEMO.source, DEMO_SOURCE);
});

test("démo : les niveaux de fiabilité sont tous représentés", () => {
  // lib/reliability.ts : auteur + « Toujours là » = 1 signalement (Signalé),
  // 2 et plus (Plusieurs signalements, petits et grands nombres), source
  // officielle (Vérifié).
  const simple = (s: (typeof SCENARIO_MONT_DORE)[number]) => !s.relaySource && !s.officialSource && !s.termine;
  assert.ok(SCENARIO_MONT_DORE.some((s) => simple(s) && s.present === 0), "signalement");
  assert.ok(SCENARIO_MONT_DORE.some((s) => simple(s) && s.present >= 1 && s.present <= 2), "plusieurs signalements (2 à 3)");
  assert.ok(SCENARIO_MONT_DORE.some((s) => simple(s) && s.present >= 3), "plusieurs signalements (4 et plus)");
  assert.ok(SCENARIO_MONT_DORE.some((s) => s.relaySource === "facebook"), "relayé");
  assert.ok(SCENARIO_MONT_DORE.some((s) => (s.termine ?? 0) > 0), "contesté");
});

test("démo : une info relayée ne porte aucun texte (règle des relais)", () => {
  for (const s of SCENARIO_MONT_DORE.filter((r) => r.relaySource)) assert.equal(s.description, undefined);
});

test("démo : aucun signalement à moins de 300 m de la position simulée", () => {
  // Sinon « Tu passes par là ? » s'ouvrirait tout seul pendant la présentation.
  for (const s of SCENARIO_MONT_DORE) assert.ok(distanceM(DEMO_POSITION, s) > 300, `${s.place} trop près`);
});

test("démo : l'annonce respecte les limites des vraies annonces", () => {
  assert.ok(ANNONCE_DEMO.texte.length >= ANNONCE_TEXTE_MIN);
  assert.ok(ANNONCE_DEMO.texte.length <= ANNONCE_TEXTE_MAX);
  assert.ok(ANNONCE_DEMO.ageMin < ANNONCE_DEMO.dureeMin);
});
