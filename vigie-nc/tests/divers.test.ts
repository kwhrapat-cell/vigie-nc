// Fiabilité, chantiers, lecture des messages relayés, nettoyage des erreurs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getReliability } from "../lib/reliability";
import { ajouterJours, aujourdhuiLocal, estChantier, libelleFinChantier } from "../lib/chantier";
import { analyzeRelayText } from "../lib/relay-parser";

const base = { confirmations: 0, infirmations: 0, officialSource: null, relaySource: null };

test("fiabilité : 4 niveaux", () => {
  assert.equal(getReliability(base).label, "Signalement");
  assert.equal(getReliability({ ...base, confirmations: 1 }).label, "À confirmer");
  assert.equal(getReliability({ ...base, confirmations: 3 }).label, "Confirmé");
  assert.equal(getReliability({ ...base, officialSource: "Mairie" }).label, "Vérifié");
  assert.equal(getReliability({ ...base, relaySource: "facebook" as const }).label, "Relayé");
  assert.match(getReliability({ ...base, infirmations: 2 }).contested ?? "", /2 personnes/);
});

test("chantiers : dates de Nouméa", () => {
  // 23 h 30 à Nouméa le 24 = 12 h 30 UTC le 24 ; 00 h 30 à Nouméa le 25 = 13 h 30 UTC le 24
  assert.equal(aujourdhuiLocal(new Date("2026-10-24T12:30:00Z")), "2026-10-24");
  assert.equal(aujourdhuiLocal(new Date("2026-10-24T13:30:00Z")), "2026-10-25");
  assert.equal(ajouterJours("2026-12-31", 1), "2027-01-01");
  assert.ok(estChantier({ type: "travaux", endDate: "2026-12-15" }));
  assert.ok(!estChantier({ type: "accident", endDate: "2026-12-15" }));
  const maintenant = new Date("2026-10-24T01:00:00Z");
  assert.match(libelleFinChantier("2026-12-15", maintenant), /^jusqu'au 15 déc/);
  assert.match(libelleFinChantier("2026-10-01", maintenant), /dépassée$/);
});

test("message relayé : type et lieu devinés", () => {
  const a = analyzeRelayText("Attention radier de la Coulée inondé ce matin au Mont-Dore, ne passez pas !");
  assert.equal(a.type, "inondation");
  assert.match(a.label ?? "", /Coulée/);
  const b = analyzeRelayText("Gros accident sur la RT1 à Païta, ça bouchonne");
  assert.equal(b.type, "accident");
  assert.equal(analyzeRelayText("Bonjour tout le monde").type, null);
});
