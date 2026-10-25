// Bandeaux de l'accueil : un seul à la fois, le plus important d'abord.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AUCUN_BANDEAU, bandeauAffiche, masquePar } from "../lib/bandeaux";

test("bandeaux : rien à montrer, rien d'affiché", () => {
  assert.equal(bandeauAffiche(AUCUN_BANDEAU), null);
  assert.equal(masquePar("impact", AUCUN_BANDEAU), false);
});

test("bandeaux : le plus important passe devant", () => {
  const tous = { "annonce-alerte": true, demande: true, "annonce-info": true, travaux: true, impact: true };
  assert.equal(bandeauAffiche(tous), "annonce-alerte");
  assert.equal(bandeauAffiche({ ...AUCUN_BANDEAU, travaux: true, impact: true }), "travaux");
  assert.equal(bandeauAffiche({ ...AUCUN_BANDEAU, demande: true, "annonce-info": true }), "demande");
});

test("bandeaux : une urgence cache tout le reste, une info ne cache pas « Tu passes par là ? »", () => {
  const urgence = { ...AUCUN_BANDEAU, "annonce-alerte": true };
  for (const b of ["demande", "annonce-info", "travaux", "impact"] as const) assert.equal(masquePar(b, urgence), true, b);
  assert.equal(masquePar("annonce-alerte", urgence), false);

  const info = { ...AUCUN_BANDEAU, "annonce-info": true };
  assert.equal(masquePar("demande", info), false);
  assert.equal(masquePar("travaux", info), true);
  assert.equal(masquePar("impact", info), true);
});

test("bandeaux : quand on ferme celui affiché, le suivant apparaît", () => {
  const avant = { ...AUCUN_BANDEAU, travaux: true, impact: true };
  assert.equal(masquePar("impact", avant), true);
  const apres = { ...avant, travaux: false }; // bandeau des travaux fermé
  assert.equal(bandeauAffiche(apres), "impact");
  assert.equal(masquePar("impact", apres), false);
});
