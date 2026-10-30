// Rapport d'erreurs des téléphones (lib/erreurs-texte.ts) : ce qui part, ce qui ne part pas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { navigateurCourt, texteErreur } from "../lib/erreurs-texte";

test("navigateur : nom + version + système, jamais le texte complet", () => {
  const chromeAndroid =
    "Mozilla/5.0 (Linux; Android 14; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
  assert.equal(navigateurCourt(chromeAndroid), "Chrome 140 · Android");
  const safari =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
  assert.equal(navigateurCourt(safari), "Safari 18 · iPhone");
  assert.equal(navigateurCourt(`${chromeAndroid} VigieNCApp`), "Appli Android · Android");
  assert.equal(navigateurCourt(`${chromeAndroid} [FBAN/EMA;FBAV/400.0]`), "Facebook · Android");
});

test("erreurs sans intérêt ignorées, adresse du site retirée de la pile", () => {
  assert.equal(texteErreur(new TypeError("Failed to fetch")), null);
  assert.equal(texteErreur(new Error("ResizeObserver loop limit exceeded")), null);
  // Erreur d'un script d'un autre site (robot, extension) : aucun détail, rien à corriger.
  assert.equal(texteErreur("Script error."), null);
  assert.equal(texteErreur(new Error("Script error")), null);
  assert.equal(texteErreur("   "), null);
  const e = new TypeError("x est vide");
  e.stack = "TypeError: x est vide\n    at f (https://vigie-nc.com/_next/static/chunks/app.js:1:234)\n    at g (x.js:2:3)";
  assert.equal(texteErreur(e), "TypeError: x est vide @ at f (/_next/static/chunks/app.js:1:234) | at g (x.js:2:3)");
  assert.equal(texteErreur("texte simple"), "Error: texte simple");
});
