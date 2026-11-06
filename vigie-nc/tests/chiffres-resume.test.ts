// Résumé des chiffres de /moderation (lib/chiffres-resume.ts) : période
// honnête, jamais « confirmé », des appareils et pas des personnes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { debutRecent, delaiTexte, resumeChiffres } from "../lib/chiffres-resume";
import type { ModStats } from "../lib/reports-api";

// Les chiffres du 06/11/2026
const stats: ModStats = {
  maintenant: 1,
  aujourdhui: 9,
  semaine: 18,
  mois: 54,
  nouveauxMois: 54,
  visiteursTotal: 54,
  debut: "2026-10-20",
  record: { nombre: 4, jour: "2026-10-26" },
  fidelite: { base: 10, revenus: 4 },
  signalements: { aujourdhui: 0, semaine: 2, mois: 19, confirmesMois: 7, delaiConfirmationMin: 10, votesMois: 9 },
  abonnesAlertes: 5,
  abonnesTrajet: 0,
  appareilsEquipe: 0,
  sources: [],
  courbe: [],
};

test("comptage commencé il y a moins de 30 jours : la date de début, pas « 30 jours »", () => {
  const r = resumeChiffres(stats, "2026-11-06", "06/11/2026");
  assert.match(r, /^Vigie NC — chiffres au 06\/11\/2026/);
  assert.match(r, /54 utilisateurs actifs depuis le 20 octobre 2026, début du comptage \(18 sur 7 jours, 9 aujourd'hui\)/);
  assert.doesNotMatch(r, /utilisateurs actifs sur 30 jours/);
  assert.equal(debutRecent("2026-10-20", "2026-11-06"), "2026-10-20");
  // Fenêtre pleine : on revient à « sur 30 jours »
  assert.equal(debutRecent("2026-09-01", "2026-11-06"), null);
  assert.match(resumeChiffres({ ...stats, debut: "2026-09-01" }, "2026-11-06", "06/11/2026"), /actifs sur 30 jours/);
});

test("jamais « confirmé » ni « personnes » : niveaux du 06/11/2026", () => {
  const r = resumeChiffres(stats, "2026-11-06", "06/11/2026");
  assert.doesNotMatch(r, /confirm/i);
  assert.doesNotMatch(r, /personne/i);
  assert.match(r, /19 signalements en 30 jours, dont 37 % signalés plusieurs fois ou vérifiés/);
  assert.match(r, /Délai médian avant un 2e signalement : 10 min/);
  assert.match(r, /Record : 4 appareils connectés en même temps \(26 octobre 2026\)/);
  assert.match(r, /5 téléphones abonnés aux alertes, dont 0 avec un trajet surveillé/);
});

test("appareils de l'équipe : dit seulement quand ils sont vraiment retirés", () => {
  assert.doesNotMatch(resumeChiffres(stats, "2026-11-06", "06/11/2026"), /équipe/);
  assert.match(
    resumeChiffres({ ...stats, appareilsEquipe: 3 }, "2026-11-06", "06/11/2026"),
    /Appareils de l'équipe non comptés\.$/,
  );
});

test("sans signalement ni délai : lignes retirées proprement", () => {
  const r = resumeChiffres(
    { ...stats, record: null, signalements: { ...stats.signalements, mois: 0, delaiConfirmationMin: null } },
    "2026-11-06",
    "06/11/2026",
  );
  assert.match(r, /• 0 signalements en 30 jours\n/);
  assert.doesNotMatch(r, /Record|Délai|undefined|null/);
  assert.equal(delaiTexte(150), "2,5 h");
});
