// Démo d'accueil (cartes, glissement du doigt) et astuce du bouton « + ».
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASTUCE_SIGNALER_EVENT,
  ASTUCE_SIGNALER_KEY,
  astuceAMontrer,
  cartePrecedente,
  carteSuivante,
  directionGlisse,
  ecrireAstuceSignaler,
  lireAstuceSignaler,
  TUTO_CARTES,
  TUTO_DERNIERE,
} from "../lib/tuto";

test("démo : 4 cartes, les règles en dernier", () => {
  assert.deepEqual([...TUTO_CARTES], ["voir", "signaler", "confirmer", "regles"]);
  assert.equal(TUTO_CARTES[TUTO_DERNIERE], "regles");
});

test("démo : on ne sort jamais des cartes", () => {
  assert.equal(carteSuivante(0), 1);
  assert.equal(carteSuivante(TUTO_DERNIERE), TUTO_DERNIERE);
  assert.equal(carteSuivante(99), TUTO_DERNIERE);
  assert.equal(cartePrecedente(2), 1);
  assert.equal(cartePrecedente(0), 0);
  assert.equal(cartePrecedente(-5), 0);
});

test("démo : glissement du doigt", () => {
  assert.equal(directionGlisse(-80, 10), "suivante"); // vers la gauche
  assert.equal(directionGlisse(80, -10), "precedente"); // vers la droite
  assert.equal(directionGlisse(-30, 0), null); // trop court : un simple toucher
  assert.equal(directionGlisse(-80, 70), null); // en biais : c'est un défilement
  assert.equal(directionGlisse(0, -200), null); // vertical
});

/** Faux navigateur : localStorage en mémoire + événements comptés. */
function fauxNavigateur() {
  const donnees = new Map<string, string>();
  const evenements: string[] = [];
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => donnees.get(k) ?? null,
      setItem: (k: string, v: string) => void donnees.set(k, v),
    },
    dispatchEvent: (e: Event) => {
      evenements.push(e.type);
      return true;
    },
  };
  return { donnees, evenements };
}

test("astuce du « + » : seulement pour les nouveaux, une seule fois", () => {
  assert.equal(astuceAMontrer(null), false); // ancien utilisateur : rien
  assert.equal(astuceAMontrer("vue"), false);
  assert.equal(astuceAMontrer("a-montrer"), true);

  const { donnees, evenements } = fauxNavigateur();
  try {
    assert.equal(lireAstuceSignaler(), false);
    ecrireAstuceSignaler("a-montrer"); // fin de l'accueil
    assert.equal(lireAstuceSignaler(), true);
    ecrireAstuceSignaler("vue"); // « + » touché ou bulle fermée
    assert.equal(lireAstuceSignaler(), false);
    ecrireAstuceSignaler("a-montrer"); // jamais remontrée ensuite
    assert.equal(donnees.get(ASTUCE_SIGNALER_KEY), "vue");
    assert.ok(evenements.length >= 2);
    assert.ok(evenements.every((e) => e === ASTUCE_SIGNALER_EVENT));
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});

test("astuce du « + » : sans stockage, rien ne plante", () => {
  assert.equal(lireAstuceSignaler(), false); // pas de fenêtre (comme côté serveur)
  assert.doesNotThrow(() => ecrireAstuceSignaler("a-montrer"));
});
