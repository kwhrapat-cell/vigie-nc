// Rythme des rechargements de la carte et des annonces.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  doitRecharger,
  RYTHME_ANNONCES,
  RYTHME_CARTE,
  sansExpires,
  suivreDirect,
  VERIFICATION_MS,
} from "../lib/rafraichissement";

const etat = (visible: boolean, directConnecte: boolean, depuisDernierMs: number) => ({
  visible,
  directConnecte,
  depuisDernierMs,
});

test("rafraîchissement : rien quand l'appli n'est pas à l'écran", () => {
  assert.equal(doitRecharger(etat(false, false, 10 * 60_000), RYTHME_CARTE), false);
  assert.equal(doitRecharger(etat(false, true, 10 * 60_000), RYTHME_ANNONCES), false);
});

test("rafraîchissement : chaque minute sans direct, même si le minuteur tombe un peu tôt", () => {
  // Le chargement a fini 300 ms après son départ : le minuteur suivant arrive à 59,7 s.
  assert.equal(doitRecharger(etat(true, false, VERIFICATION_MS - 300), RYTHME_CARTE), true);
  assert.equal(doitRecharger(etat(true, false, 30_000), RYTHME_CARTE), false);
});

test("rafraîchissement : toutes les 3 minutes avec le direct", () => {
  assert.equal(doitRecharger(etat(true, true, VERIFICATION_MS), RYTHME_CARTE), false);
  assert.equal(doitRecharger(etat(true, true, 2 * VERIFICATION_MS), RYTHME_CARTE), false);
  assert.equal(doitRecharger(etat(true, true, 3 * VERIFICATION_MS - 300), RYTHME_CARTE), true);
});

test("rafraîchissement : annonces toutes les 2 minutes sans direct, 6 avec", () => {
  assert.equal(doitRecharger(etat(true, false, 2 * VERIFICATION_MS - 300), RYTHME_ANNONCES), true);
  assert.equal(doitRecharger(etat(true, true, 5 * VERIFICATION_MS), RYTHME_ANNONCES), false);
  assert.equal(doitRecharger(etat(true, true, 6 * VERIFICATION_MS - 300), RYTHME_ANNONCES), true);
});

test("rafraîchissement : les signalements expirés disparaissent sans recharger", () => {
  const maintenant = Date.parse("2026-11-05T10:00:00Z");
  const liste = [
    { id: "a", expiresAt: "2026-11-05T09:59:59Z" },
    { id: "b", expiresAt: "2026-11-05T10:30:00Z" },
  ];
  assert.deepEqual(
    sansExpires(liste, maintenant).map((r) => r.id),
    ["b"],
  );
  // Rien d'expiré : la même liste, pour ne pas redessiner la carte pour rien.
  const encore = [liste[1]];
  assert.equal(sansExpires(encore, maintenant), encore);
});

test("rafraîchissement : rattrapage seulement après une coupure du direct", () => {
  const direct = suivreDirect();
  assert.equal(direct.connecte(), false);
  assert.equal(direct.statut("SUBSCRIBED"), false, "premier branchement : la carte vient d'être chargée");
  assert.equal(direct.connecte(), true);
  assert.equal(direct.statut("CHANNEL_ERROR"), false);
  assert.equal(direct.connecte(), false);
  assert.equal(direct.statut("TIMED_OUT"), false);
  assert.equal(direct.statut("SUBSCRIBED"), true, "rebranché : rattraper les changements manqués");
  assert.equal(direct.statut("SUBSCRIBED"), false, "déjà branché : rien de plus");
});
