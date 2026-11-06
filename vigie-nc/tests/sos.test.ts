// SOS (lib/sos.ts) : SMS préparé sur le téléphone, jamais envoyé tout seul.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lienPosition, lienSms, messageSos } from "../lib/sos";

test("SOS : lien de position à 6 décimales (Google Maps)", () => {
  assert.equal(lienPosition(-22.1316123, 166.358234), "https://maps.google.com/?q=-22.131612,166.358234");
});

test("SOS : message avec ou sans position", () => {
  assert.match(messageSos("https://maps.google.com/?q=1,2"), /voici ma position : https:\/\/maps\.google\.com/);
  const sans = messageSos(null);
  assert.match(sans, /n'a pas pu donner ma position/);
  assert.doesNotMatch(sans, /https?:/);
});

test("SOS : SMS vers tous les contacts, numéros nettoyés, texte encodé", () => {
  const href = lienSms(["+687 82.68.81", "826881", "  "], "SOS — aide & position ?");
  assert.ok(href);
  assert.equal(href.split("?")[0], "sms:+687826881,826881");
  assert.equal(decodeURIComponent(href.split("?body=")[1]), "SOS — aide & position ?");
  assert.ok(!href.includes(" "), "pas d'espace dans le lien");
});

test("SOS : sans contact valable, aucun SMS (l'écran le dit)", () => {
  assert.equal(lienSms([], "x"), null);
  assert.equal(lienSms(["12", "abc"], "x"), null);
});
