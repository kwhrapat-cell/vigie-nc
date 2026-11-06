// Fraîcheur des signalements (lib/fraicheur.ts) : « ancien », fin, heure.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aEteReconfirme,
  ANCIEN_MIN_MIN,
  derniereNouvelle,
  estAncien,
  heureSignalement,
  seuilAncienMin,
  statutFin,
  texteAncien,
} from "../lib/fraicheur";
import { REPORT_TYPE_LIFETIME_MIN, type Report } from "../lib/types";

const MIN = 60_000;
const MAINTENANT = new Date(2026, 10, 6, 19, 30).getTime();
const il = (min: number) => new Date(MAINTENANT - min * MIN).toISOString();

function r(type: Report["type"], ageMin: number, extra: Partial<Report> = {}) {
  return { type, createdAt: il(ageMin), lastConfirmedAt: null, officialSource: null, ...extra };
}

test("ancien : plus de la moitié de sa durée sans nouvelle, 30 min au moins", () => {
  assert.equal(seuilAncienMin("trafic_dense"), 30); // 60 min de vie
  assert.equal(seuilAncienMin("accident"), 60);
  assert.equal(seuilAncienMin("travaux"), 36 * 60); // 3 jours
  for (const t of Object.keys(REPORT_TYPE_LIFETIME_MIN) as Report["type"][]) {
    assert.ok(seuilAncienMin(t) >= ANCIEN_MIN_MIN);
    assert.ok(seuilAncienMin(t) < REPORT_TYPE_LIFETIME_MIN[t] || REPORT_TYPE_LIFETIME_MIN[t] <= ANCIEN_MIN_MIN);
  }
  assert.equal(estAncien(r("accident", 50), MAINTENANT), false);
  assert.equal(estAncien(r("accident", 70), MAINTENANT), true);
  assert.equal(estAncien(r("chaussee_degradee", 40 * 60), MAINTENANT), true);
});

test("ancien : une confirmation sur place le rajeunit", () => {
  const confirme = r("accident", 70, { lastConfirmedAt: il(10) });
  assert.equal(estAncien(confirme, MAINTENANT), false);
  assert.equal(derniereNouvelle(confirme), MAINTENANT - 10 * MIN);
  assert.equal(aEteReconfirme(confirme), true);
  // Confirmation plus vieille que la création (horloge) : on garde la création
  assert.equal(derniereNouvelle(r("accident", 5, { lastConfirmedAt: il(9) })), MAINTENANT - 5 * MIN);
  assert.equal(aEteReconfirme(r("accident", 5)), false);
});

test("ancien : jamais pour le SOS ni une source officielle (chantiers datés)", () => {
  assert.equal(estAncien(r("sos", 500), MAINTENANT), false);
  assert.equal(estAncien(r("travaux", 9 * 24 * 60, { officialSource: "Province Sud" }), MAINTENANT), false);
});

test("ancien : le texte dit depuis quand, sans jamais dire que c'est dégagé", () => {
  const t = texteAncien(r("accident", 70), MAINTENANT);
  assert.match(t, /^Pas de nouvelle depuis 1 h 10/);
  assert.match(t, /À revérifier sur place/);
  assert.doesNotMatch(t, /libre|dégagé|sûr|calme/i);
});

test("fin : expiré, terminé sur place ou retiré", () => {
  const base = { infirmations: 0, expiresAt: new Date(MAINTENANT + 30 * MIN).toISOString() };
  assert.equal(statutFin({ ...base, active: true }, MAINTENANT), null);
  assert.equal(statutFin({ ...base, active: undefined }, MAINTENANT), null);
  assert.equal(statutFin({ ...base, active: false, infirmations: 2 }, MAINTENANT), "termine");
  assert.equal(statutFin({ ...base, active: false }, MAINTENANT), "retire");
  assert.equal(
    statutFin({ ...base, active: true, expiresAt: new Date(MAINTENANT - MIN).toISOString() }, MAINTENANT),
    "expire",
  );
});

test("heure : « à 19:14 » le jour même, avec la date sinon", () => {
  assert.match(heureSignalement(new Date(2026, 10, 6, 19, 14).toISOString(), MAINTENANT), /^à 19[:h]14$/);
  assert.match(heureSignalement(new Date(2026, 9, 28, 8, 0).toISOString(), MAINTENANT), /^le 28 oct\.? à 08[:h]00$/);
});
