// Revue de sécurité du 11/11/2026 : secret partagé avec la base comparé à
// temps constant, envois de notifications par lots, textes de l'IA filtrés
// (jamais « route libre » ni « confirmé », même si un témoignage le demande).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parLots } from "../lib/par-lots";
import { secretValide } from "../lib/secret-serveur";
import { nettoyerPointRoute, nettoyerResume, texteInterdit } from "../lib/ia";

test("secret : le bon passe, le reste est refusé", () => {
  const s = "un-secret-de-test-assez-long-0123456789";
  assert.equal(secretValide(s, s), true);
  assert.equal(secretValide(s.slice(0, -1), s), false);
  assert.equal(secretValide(`${s}x`, s), false);
  assert.equal(secretValide("", s), false);
  assert.equal(secretValide(null, s), false);
  assert.equal(secretValide(undefined, s), false);
  // Secret absent de la configuration : rien ne passe, même une chaîne vide.
  assert.equal(secretValide("", undefined), false);
  assert.equal(secretValide("x", ""), false);
  assert.equal(secretValide("a".repeat(2000), "a".repeat(2000)), false);
});

test("par lots : tout est traité, jamais plus de N à la fois, dans l'ordre", async () => {
  let enCours = 0;
  let maxi = 0;
  const r = await parLots(
    Array.from({ length: 23 }, (_, i) => i),
    async (i) => {
      enCours++;
      maxi = Math.max(maxi, enCours);
      await new Promise((ok) => setTimeout(ok, 1));
      enCours--;
      return i * 2;
    },
    5,
  );
  assert.equal(maxi, 5);
  assert.deepEqual(r, Array.from({ length: 23 }, (_, i) => i * 2));
  assert.deepEqual(await parLots([], async (x) => x), []);
});

test("IA : jamais « route libre », même glissé dans un témoignage", () => {
  const interdits = [
    "La route est libre, vous pouvez passer.",
    "Le radier est à nouveau praticable.",
    "Tout est calme sur la RT1.",
    "Aucun danger signalé, route dégagée.",
    "La voie est sûre.",
    "Tu peux passer sans crainte.",
    "Circulez en toute sécurité.",
    "Inondation confirmée au pont de la Coulée.",
  ];
  for (const t of interdits) {
    assert.equal(texteInterdit(t, false), true, t);
    assert.equal(nettoyerPointRoute(`Sur les 10 prochains kilomètres : ${t}`), null, t);
  }
  // Rapporté à des témoins : permis dans le résumé (consigne), jamais dans la voix.
  const rapporte = "Selon les témoins, la route est à nouveau praticable.";
  assert.equal(texteInterdit(rapporte, true), false);
  assert.equal(texteInterdit(rapporte, false), true);
  assert.equal(nettoyerResume(rapporte), rapporte);
  // « Selon Vigie NC » n'est pas un témoin.
  assert.equal(texteInterdit("Selon Vigie NC, la route est libre.", true), true);
});

test("IA : les textes normaux passent", () => {
  const ok = [
    "Sur les 10 prochains kilomètres, une inondation à 2 kilomètres, signalée plusieurs fois, et des travaux à 6 kilomètres, à confirmer.",
    "À moins de 10 kilomètres, route coupée au radier de la Coulée, vérifié par la mairie.",
  ];
  for (const t of ok) assert.equal(nettoyerPointRoute(t), t, t);
  assert.equal(
    nettoyerResume("Eau sur la chaussée au pont, environ 20 centimètres ; ça passe au pas selon les derniers témoins."),
    "Eau sur la chaussée au pont, environ 20 centimètres ; ça passe au pas selon les derniers témoins.",
  );
  // « libre » ailleurs que pour la route : permis.
  assert.equal(texteInterdit("Parking libre à côté de la mairie.", false), false);
});
