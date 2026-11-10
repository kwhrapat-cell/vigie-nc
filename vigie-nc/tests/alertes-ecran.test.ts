import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FIL_RECENT_MIN,
  grouperFil,
  ongletDepuisAncre,
  resumeAlertes,
  texteFilVide,
  type EtatAlertes,
} from "@/lib/alertes-ecran";

const MAINTENANT = Date.parse("2026-11-11T10:00:00+11:00");
const ilYa = (min: number) => new Date(MAINTENANT - min * 60_000).toISOString();

test("onglet : #trajet et #prevenir ouvrent « Être prévenu », le reste « En cours »", () => {
  assert.equal(ongletDepuisAncre("#trajet"), "prevenir");
  assert.equal(ongletDepuisAncre("#prevenir"), "prevenir");
  assert.equal(ongletDepuisAncre(""), "en-cours");
  assert.equal(ongletDepuisAncre("#autre"), "en-cours");
});

test("résumé : alertes actives, avec le lieu, le rayon et le trajet", () => {
  const actif: EtatAlertes = { etat: "actif", zone: { lat: -22.2, lng: 166.4, rayonKm: 5, nom: "Maison" } };
  const r = resumeAlertes(actif, true);
  assert.ok(r);
  assert.equal(r.actif, true);
  assert.equal(r.action, "regler");
  assert.equal(r.detail, "5 km autour de « Maison », et ton trajet.");
  const sansNom = resumeAlertes({ etat: "actif", zone: { lat: 0, lng: 0, rayonKm: 3, nom: null } }, false);
  assert.equal(sansNom?.detail, "3 km autour de ton lieu d'alerte.");
});

test("résumé : invitation à activer, explication quand c'est impossible", () => {
  assert.equal(resumeAlertes({ etat: "chargement" }, false), null);
  assert.equal(resumeAlertes({ etat: "inactif" }, false)?.action, "activer");
  const iphone = resumeAlertes({ etat: "indisponible", raison: "iphone-a-installer" }, false);
  assert.equal(iphone?.action, "voir");
  assert.match(iphone?.detail ?? "", /écran d'accueil/);
  assert.match(resumeAlertes({ etat: "inconnu" }, false)?.detail ?? "", /Pas de réseau/);
});

test("textes : jamais de « route libre » ni de « confirmé »", () => {
  const etats: EtatAlertes[] = [
    { etat: "actif", zone: { lat: 0, lng: 0, rayonKm: 10, nom: "Travail" } },
    { etat: "inactif" },
    { etat: "inconnu" },
    { etat: "indisponible", raison: "bloque" },
    { etat: "indisponible", raison: "appli-integree" },
    { etat: "indisponible", raison: "non-supporte" },
  ];
  const textes = [
    ...etats.flatMap((e) => {
      const r = resumeAlertes(e, true);
      return r ? [r.titre, r.detail] : [];
    }),
    texteFilVide(true, 5),
    texteFilVide(false, 5),
  ];
  for (const t of textes) {
    assert.doesNotMatch(t, /libre|sûre|dégagée|tout est calme|confirmé|personnes/i, t);
  }
  assert.equal(texteFilVide(true, 3), "Rien de signalé à moins de 3 km pour l'instant.");
});

test("fil : plus récent d'abord, dernière heure, plus tôt, puis chantiers annoncés", () => {
  const liste = [
    { id: "a", type: "accident", createdAt: ilYa(90), endDate: null },
    { id: "b", type: "inondation", createdAt: ilYa(5), endDate: null },
    { id: "c", type: "travaux", createdAt: ilYa(60 * 24 * 20), endDate: "2027-01-15" },
    { id: "d", type: "travaux", createdAt: ilYa(30), endDate: null },
    { id: "e", type: "danger", createdAt: ilYa(FIL_RECENT_MIN), endDate: null },
  ] as const;
  const groupes = grouperFil(liste.map((r) => ({ ...r })), MAINTENANT);
  assert.deepEqual(
    groupes.map((g) => [g.cle, g.signalements.map((r) => r.id)]),
    [
      ["recent", ["b", "d", "e"]],
      ["avant", ["a"]],
      ["chantiers", ["c"]],
    ],
  );
});

test("fil : les groupes vides ne sont pas affichés", () => {
  assert.deepEqual(grouperFil([], MAINTENANT), []);
  const seul = grouperFil([{ type: "accident" as const, createdAt: ilYa(200), endDate: null }], MAINTENANT);
  assert.deepEqual(
    seul.map((g) => g.cle),
    ["avant"],
  );
});
