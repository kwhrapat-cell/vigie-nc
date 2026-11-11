// SOS (lib/sos.ts) : SMS préparé sur le téléphone, jamais envoyé tout seul.
import { test } from "node:test";
import assert from "node:assert/strict";
import { estAppareilApple, lienPosition, lienSms, messageSos } from "../lib/sos";

test("SOS : lien de position à 6 décimales (Google Maps)", () => {
  assert.equal(lienPosition(-22.1316123, 166.358234), "https://maps.google.com/?q=-22.131612,166.358234");
});

test("SOS : message avec ou sans position", () => {
  assert.match(messageSos("https://maps.google.com/?q=1,2"), /voici ma position : https:\/\/maps\.google\.com/);
  const sans = messageSos(null);
  assert.match(sans, /n'a pas pu donner ma position/);
  assert.doesNotMatch(sans, /https?:/);
});

test("SOS : SMS vers tous les contacts, numéros nettoyés, texte encodé (Android)", () => {
  const href = lienSms(["+687 82.68.81", "826881", "  "], "SOS — aide & position ?", false);
  assert.ok(href);
  assert.equal(href.split("?")[0], "sms:+687826881,826881");
  assert.equal(decodeURIComponent(href.split("?body=")[1]), "SOS — aide & position ?");
  assert.ok(!href.includes(" "), "pas d'espace dans le lien");
});

test("SOS : sans contact valable, aucun SMS (l'écran le dit)", () => {
  assert.equal(lienSms([], "x"), null);
  assert.equal(lienSms(["12", "abc"], "x"), null);
  assert.equal(lienSms(["12"], "x", true), null);
});

test("SOS iPhone : tous les contacts dans « addresses », texte après « &body= »", () => {
  const href = lienSms(["+687 82.68.81", "826881"], "SOS — aide & position ?", true);
  assert.ok(href);
  assert.equal(href.split("&body=")[0], "sms://open?addresses=+687826881,826881");
  assert.equal(decodeURIComponent(href.split("&body=")[1]), "SOS — aide & position ?");
  assert.ok(!href.includes("?body="), "pas la forme Android, où l'iPhone ne garde que le 1er numéro");
});

test("SOS iPhone : un seul contact, forme simple", () => {
  assert.equal(lienSms(["82 68 81"], "SOS", true), "sms:826881&body=SOS");
});

test("SOS : iPhone et iPad reconnus, Android non", () => {
  assert.equal(estAppareilApple("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)"), true);
  assert.equal(estAppareilApple("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5), true, "iPad récent");
  assert.equal(estAppareilApple("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0), false, "vrai Mac");
  assert.equal(estAppareilApple("Mozilla/5.0 (Linux; Android 10; Redmi 7)"), false);
});
