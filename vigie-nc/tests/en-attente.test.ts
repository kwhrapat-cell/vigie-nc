// Signalements faits sans réseau, gardés sur le téléphone.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avecDelai,
  avecNouveau,
  DelaiDepasse,
  EN_ATTENTE_MAX,
  ENVOI_AUTO_MAX_MIN,
  estErreurReseau,
  etatEnAttente,
  fileValide,
  gardeMaxMs,
  prochainAEnvoyer,
  sansPerimes,
  type SignalementEnAttente,
} from "../lib/en-attente";

// Comme ReportsApiError de lib/reports-api.ts (qui ne se charge pas sans
// les paquets npm) : `code` lisible, `detail` = message d'origine.
class ReportsApiError extends Error {
  code: string;
  detail?: string;
  constructor(code: string, detail?: string) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 11, 3, 0, 0);

function sig(partiel: Partial<SignalementEnAttente> = {}): SignalementEnAttente {
  return {
    id: partiel.id ?? "a",
    type: partiel.type ?? "inondation",
    lat: -22.2,
    lng: 166.5,
    description: null,
    riskLevel: null,
    place: null,
    vuA: partiel.vuA ?? T0,
    essais: 0,
    erreur: partiel.erreur ?? null,
  };
}

test("en attente : envoyé tout seul dans les 15 minutes, puis on demande", () => {
  assert.equal(ENVOI_AUTO_MAX_MIN, 15);
  assert.equal(etatEnAttente(sig(), T0), "envoi");
  assert.equal(etatEnAttente(sig(), T0 + 15 * MIN), "envoi");
  assert.equal(etatEnAttente(sig(), T0 + 15 * MIN + 1), "a_confirmer");
  assert.equal(etatEnAttente(sig(), T0 + 119 * MIN), "a_confirmer");
});

test("en attente : effacé après 2 h, ou plus tôt si le type vit moins longtemps", () => {
  assert.equal(etatEnAttente(sig(), T0 + 120 * MIN + 1), "perime");
  // trafic dense : 1 h sur la carte
  assert.equal(gardeMaxMs("trafic_dense"), 60 * MIN);
  assert.equal(etatEnAttente(sig({ type: "trafic_dense" }), T0 + 61 * MIN), "perime");
  // travaux : 3 jours sur la carte, mais 2 h au plus dans la file
  assert.equal(gardeMaxMs("travaux"), 120 * MIN);
});

test("en attente : horloge du téléphone qui recule = pas plus vieux", () => {
  assert.equal(etatEnAttente(sig({ vuA: T0 + 10 * MIN }), T0), "envoi");
});

test("en attente : refusé par la base = ne repart pas, mais s'efface avec le temps", () => {
  const refuse = sig({ erreur: "Position hors Calédonie" });
  assert.equal(etatEnAttente(refuse, T0), "refuse");
  assert.equal(etatEnAttente(refuse, T0 + 3 * 60 * MIN), "perime");
});

test("en attente : le plus ancien à envoyer part d'abord, jamais ceux à confirmer", () => {
  const vieux = sig({ id: "vieux", vuA: T0 - 30 * MIN });
  const recent = sig({ id: "recent", vuA: T0 - 2 * MIN });
  const moinsRecent = sig({ id: "moins", vuA: T0 - 5 * MIN });
  const refuse = sig({ id: "refuse", vuA: T0 - 10 * MIN, erreur: "non" });
  assert.equal(prochainAEnvoyer([recent, vieux, moinsRecent, refuse], T0)?.id, "moins");
  assert.equal(prochainAEnvoyer([vieux, refuse], T0), null);
  assert.deepEqual(
    sansPerimes([sig({ id: "x", vuA: T0 - 3 * 60 * MIN }), recent], T0).map((s) => s.id),
    ["recent"],
  );
});

test("en attente : 5 au plus, les plus récents gardés", () => {
  let file: SignalementEnAttente[] = [];
  for (let i = 0; i < EN_ATTENTE_MAX + 2; i++) file = avecNouveau(file, sig({ id: String(i), vuA: T0 + i * MIN }));
  assert.equal(file.length, EN_ATTENTE_MAX);
  assert.deepEqual(
    file.map((s) => s.id),
    ["2", "3", "4", "5", "6"],
  );
});

test("en attente : panne de réseau reconnue, refus de la base non", () => {
  // supabase-js, Chrome / Safari / Firefox
  assert.equal(estErreurReseau(new ReportsApiError("inconnu", "TypeError: Failed to fetch")), true);
  assert.equal(estErreurReseau(new ReportsApiError("inconnu", "TypeError: Load failed")), true);
  assert.equal(
    estErreurReseau(new ReportsApiError("inconnu", "TypeError: NetworkError when attempting to fetch resource.")),
    true,
  );
  assert.equal(estErreurReseau(new ReportsApiError("inconnu", "FetchError: request timed out")), true);
  // pas de session possible sans réseau
  assert.equal(estErreurReseau(new ReportsApiError("connexion_requise")), true);
  assert.equal(estErreurReseau(new DelaiDepasse()), true);
  // navigateur hors ligne : toujours
  assert.equal(estErreurReseau(new ReportsApiError("rate_limit"), false), true);
  // refus de la base : ne pas garder
  assert.equal(estErreurReseau(new ReportsApiError("rate_limit", "rate_limit")), false);
  assert.equal(estErreurReseau(new ReportsApiError("position_hors_nc", "position_hors_nc")), false);
  assert.equal(estErreurReseau(new ReportsApiError("inconnu", "permission denied for function")), false);
  assert.equal(estErreurReseau(null), false);
});

test("en attente : délai dépassé si le réseau ne répond pas", async () => {
  await assert.rejects(avecDelai(new Promise(() => undefined), 20), (e: unknown) => e instanceof DelaiDepasse);
  assert.equal(await avecDelai(Promise.resolve(42), 1_000), 42);
  await assert.rejects(avecDelai(Promise.reject(new Error("refus")), 1_000), /refus/);
});

test("en attente : file abîmée ou d'une ancienne version lue prudemment", () => {
  assert.deepEqual(fileValide(null), []);
  assert.deepEqual(fileValide({}), []);
  const lue = fileValide([
    { id: "ok", type: "accident", lat: -22, lng: 166, vuA: T0, riskLevel: "tres" },
    { id: "sos", type: "sos", lat: -22, lng: 166, vuA: T0 },
    { id: "type", type: "vol_voiture", lat: -22, lng: 166, vuA: T0 },
    { id: "pos", type: "accident", lat: "x", lng: 166, vuA: T0 },
    { id: "heure", type: "accident", lat: -22, lng: 166 },
    null,
  ]);
  assert.deepEqual(
    lue.map((s) => s.id),
    ["ok"],
  );
  assert.equal(lue[0].riskLevel, null);
  assert.equal(lue[0].essais, 0);
  assert.equal(lue[0].erreur, null);
});
