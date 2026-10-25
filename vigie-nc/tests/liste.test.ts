// Liste « À proximité » de l'accueil : repliée ou dépliée.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readListeRepliee, saveListeRepliee, sensGlisseListe, suiviGlisseListe } from "../lib/preferences";

test("liste : glisser vers le bas replie, vers le haut déplie", () => {
  assert.equal(sensGlisseListe(5, 80), "replier");
  assert.equal(sensGlisseListe(-5, -80), "deplier");
  assert.equal(sensGlisseListe(0, 20), null); // trop court : simple toucher
  assert.equal(sensGlisseListe(90, 60), null); // plutôt horizontal
});

test("liste : dépliée par défaut, choix gardé sur le téléphone", () => {
  assert.equal(readListeRepliee(), false); // pas de stockage (comme côté serveur)
  const donnees = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => donnees.get(k) ?? null,
      setItem: (k: string, v: string) => void donnees.set(k, v),
    },
  };
  try {
    assert.equal(readListeRepliee(), false);
    saveListeRepliee(true);
    assert.equal(readListeRepliee(), true);
    saveListeRepliee(false);
    assert.equal(readListeRepliee(), false);
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});

test("liste : elle suit le doigt, dans le bon sens et sans dépasser", () => {
  assert.equal(suiviGlisseListe(120, false, 300), 120); // dépliée, on tire vers le bas
  assert.equal(suiviGlisseListe(500, false, 300), 300); // pas plus loin que la liste
  assert.equal(suiviGlisseListe(-50, false, 300), 0); // dépliée : vers le haut, rien
  assert.equal(suiviGlisseListe(-90, true, 160), -90); // repliée, on tire vers le haut
  assert.equal(suiviGlisseListe(-400, true, 160), -160);
  assert.equal(suiviGlisseListe(40, true, 160), 0); // repliée : vers le bas, rien
});
