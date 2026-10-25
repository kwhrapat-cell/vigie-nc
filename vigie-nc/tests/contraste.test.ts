// Lisibilité au soleil : contraste des couleurs de l'appli.
import { test } from "node:test";
import assert from "node:assert/strict";
import { contraste, couleurSur, CONTRASTE_MIN } from "../lib/contraste";
import { CATEGORY_HEX, REPORT_TYPE_HEX } from "../lib/types";
import config from "../tailwind.config";

const BLANC = "#FFFFFF";
const FONCE = "#081317";
const couleurs = (config.theme?.extend?.colors ?? {}) as unknown as Record<string, string>;

test("contraste : valeurs connues", () => {
  assert.equal(Math.round(contraste("#000000", "#FFFFFF")), 21);
  assert.equal(contraste("#22B8B0", "#22B8B0"), 1);
  assert.equal(contraste("#000000", "#FFFFFF"), contraste("#FFFFFF", "#000000"));
});

test("tuiles : texte foncé sur l'orange et le jaune, blanc ailleurs", () => {
  assert.equal(couleurSur(REPORT_TYPE_HEX.route_coupee), FONCE);
  assert.equal(couleurSur(REPORT_TYPE_HEX.travaux), FONCE);
  assert.equal(couleurSur(CATEGORY_HEX.perturbation), FONCE);
  for (const t of ["accident", "inondation", "feu", "danger", "meteo", "trafic_dense", "chaussee_degradee", "autre", "sos"] as const) {
    assert.equal(couleurSur(REPORT_TYPE_HEX[t]), BLANC, t);
  }
});

test("tuiles et repères : jamais sous 3 pour 1", () => {
  for (const [nom, fond] of [...Object.entries(REPORT_TYPE_HEX), ...Object.entries(CATEGORY_HEX)]) {
    assert.ok(contraste(couleurSur(fond), fond) >= CONTRASTE_MIN, nom);
  }
});

test("boutons principaux : texte blanc lisible (4,5 pour 1)", () => {
  assert.ok(contraste(BLANC, couleurs.primary) >= 4.5, `primary ${couleurs.primary}`);
  assert.ok(contraste(BLANC, couleurs["primary-strong"]) >= 4.5, "bouton appuyé");
  // Le texte gris des explications reste bien lisible sur les cartes
  assert.ok(contraste(couleurs["mist-dim"], couleurs.panel) >= 4.5);
});
