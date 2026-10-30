// Exemple d'alerte (écran Alertes) : marqué « Essai », nom du lieu nettoyé.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXEMPLE_FIN,
  EXEMPLE_SIGNALEMENT,
  EXEMPLE_TITRE_DEBUT,
  marquerEssai,
  nomLieuExemple,
} from "../lib/alerte-exemple";

test("exemple d'alerte : « Essai » en premier mot et en fin de message", () => {
  const p = marquerEssai({
    title: "Inondation · RT1, Païta",
    body: "Signalé par 2 personnes, à 3,2 km de « Maison ».",
  });
  assert.equal(p.title, "Essai · Inondation · RT1, Païta");
  assert.ok(p.title.startsWith(EXEMPLE_TITRE_DEBUT));
  assert.equal(p.body, "Signalé par 2 personnes, à 3,2 km de « Maison ». C'est un essai : rien de réel.");
  assert.ok(p.body.endsWith(EXEMPLE_FIN));
  // jamais vers un vrai signalement : ouvre l'écran Alertes
  assert.equal(p.url, "/alertes");
  assert.equal(p.tag, "test-exemple");
});

test("exemple d'alerte : un danger qui déclenche une vraie alerte", () => {
  assert.equal(EXEMPLE_SIGNALEMENT.type, "inondation");
  assert.equal(EXEMPLE_SIGNALEMENT.confirmations, 1);
});

test("exemple d'alerte : nom du lieu nettoyé, 30 caractères au plus", () => {
  assert.equal(nomLieuExemple("  Maison  "), "Maison");
  assert.equal(nomLieuExemple("Mai\nson\u0007"), "Mai son");
  assert.equal(nomLieuExemple("x".repeat(50))?.length, 30);
  assert.equal(nomLieuExemple("   "), null);
  assert.equal(nomLieuExemple(42), null);
  assert.equal(nomLieuExemple(undefined), null);
});
