// « Mon impact » (lib/impact.ts) : gardé sur le téléphone, badges.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";

// Faux stockage du téléphone (localStorage)
const memoire = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => memoire.get(k) ?? null,
    setItem: (k: string, v: string) => void memoire.set(k, v),
    removeItem: (k: string) => void memoire.delete(k),
  },
};

const impact = await import("../lib/impact");

beforeEach(() => memoire.clear());

test("premier signalement : badge « Première vigie »", () => {
  const avant = impact.idsBadges();
  impact.noterSignalement("r1", "accident", "RT1, Dumbéa", false);
  assert.deepEqual(
    impact.nouveauxBadges(avant).map((b) => b.id),
    ["premiere-vigie"],
  );
  assert.equal(impact.lireImpact().nbSignalements, 1);
  impact.noterSignalement("r1", "accident", "RT1, Dumbéa", false); // le même : compté une fois
  assert.equal(impact.lireImpact().nbSignalements, 1);
});

test("confirmations reçues : bonne nouvelle une seule fois, badge « Bon œil »", () => {
  impact.noterSignalement("r1", "inondation", "Plum", false);
  assert.equal(impact.noterNouvelles("r1", 0, true), null);
  const n = impact.noterNouvelles("r1", 3, true);
  assert.equal(n?.total, 3);
  assert.equal(impact.noterNouvelles("r1", 3, true), null);
  const i = impact.lireImpact();
  assert.equal(i.nbConfirmationsRecues, 3);
  assert.equal(i.nbSignalementsConfirmes, 1);
  assert.equal(i.nbAlertesMeteo, 1);
  assert.ok(impact.idsBadges().includes("bon-oeil"));
  assert.ok(impact.idsBadges().includes("sentinelle-cyclone"));
});

test("signalement fusionné : les confirmations d'avant ne comptent pas", () => {
  impact.noterSignalement("r2", "accident", null, true);
  assert.equal(impact.noterNouvelles("r2", 5, true), null);
  assert.equal(impact.noterNouvelles("r2", 6, true)?.total, 6);
  assert.equal(impact.lireImpact().nbConfirmationsRecues, 1);
  assert.equal(impact.lireImpact().nbSignalementsConfirmes, 0);
});

test("signalement terminé : plus vérifié ensuite", () => {
  impact.noterSignalement("r3", "travaux", null, false);
  impact.noterNouvelles("r3", 0, false);
  assert.deepEqual(impact.aVerifier(Date.now()), []);
});

test("vérification au plus toutes les 10 minutes", () => {
  impact.noterSignalement("r4", "danger", null, false);
  const t = Date.now();
  assert.equal(impact.aVerifier(t)?.length, 1);
  assert.equal(impact.aVerifier(t + 60_000), null);
  assert.equal(impact.aVerifier(t + impact.IMPACT_VERIF_INTERVALLE_MS + 1)?.length, 1);
});

test("votes : « Témoin fiable » à 5, « Ouvreur de route » quand on retire un signalement", () => {
  for (let i = 0; i < 4; i++) impact.noterVote("present", "confirme", false);
  impact.noterVote("present", "deja_vote", false); // déjà voté : ne compte pas
  assert.ok(!impact.idsBadges().includes("temoin-fiable"));
  impact.noterVote("termine", "resolu", true);
  assert.ok(impact.idsBadges().includes("temoin-fiable"));
  assert.ok(impact.idsBadges().includes("ouvreur-de-route"));
  assert.equal(impact.texteNouveauxBadges([]), "");
});

test("stockage abîmé : on repart de zéro sans planter", () => {
  memoire.set("vigie-nc:impact-v1", "{pas du json");
  assert.equal(impact.lireImpact().nbSignalements, 0);
});
