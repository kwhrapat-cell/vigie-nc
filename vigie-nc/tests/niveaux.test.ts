// Niveaux du cagou (lib/niveaux.ts) et son dessin (lib/avatar.ts).
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";

// Faux téléphone : stockage + événements
const memoire = new Map<string, string>();
const evenements: string[] = [];
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => memoire.get(k) ?? null,
    setItem: (k: string, v: string) => void memoire.set(k, v),
    removeItem: (k: string) => void memoire.delete(k),
  },
  dispatchEvent: (e: Event) => {
    evenements.push(e.type);
    return true;
  },
};

const niveaux = await import("../lib/niveaux");
const { BADGES } = await import("../lib/impact");
const { avatarSvg } = await import("../lib/avatar");

beforeEach(() => {
  memoire.clear();
  evenements.length = 0;
});

test("niveaux : de Poussin à Légende, Légende = tous les badges", () => {
  assert.deepEqual(
    niveaux.NIVEAUX.map((n) => n.nom),
    ["Poussin", "Vigie", "Sentinelle", "Gardien", "Légende"],
  );
  assert.equal(niveaux.NIVEAUX[niveaux.NIVEAUX.length - 1].badgesMin, BADGES.length);
  assert.equal(niveaux.rangPourBadges(0), 0);
  assert.equal(niveaux.rangPourBadges(1), 1);
  assert.equal(niveaux.rangPourBadges(2), 1);
  assert.equal(niveaux.rangPourBadges(3), 2);
  assert.equal(niveaux.rangPourBadges(6), 3);
  assert.equal(niveaux.rangPourBadges(BADGES.length - 1), 3);
  assert.equal(niveaux.rangPourBadges(BADGES.length), 4);
});

test("niveaux : ce qu'il manque pour le suivant", () => {
  assert.equal(niveaux.badgesManquants(0, 0), 1);
  assert.equal(niveaux.badgesManquants(1, 2), 1); // Vigie → Sentinelle à 3
  assert.equal(niveaux.badgesManquants(3, 7), BADGES.length - 7);
  assert.equal(niveaux.badgesManquants(4, BADGES.length), null); // déjà Légende
});

test("niveaux : on fête une montée une seule fois, et on ne redescend jamais", () => {
  assert.equal(niveaux.noterRang(0), null); // Poussin : rien à fêter
  assert.equal(niveaux.noterRang(3)?.nom, "Sentinelle");
  assert.ok(evenements.includes(niveaux.NIVEAU_EVENT));
  assert.equal(niveaux.noterRang(3), null); // déjà fêté
  assert.equal(niveaux.noterRang(4), null); // toujours Sentinelle
  // Nouveaux badges ajoutés à l'appli, ou stockage des badges abîmé : le niveau reste
  assert.equal(niveaux.rangActuel(1), 2);
  assert.equal(niveaux.noterRang(6)?.nom, "Gardien");
});

test("cagou sur la carte : affiché par défaut, on peut revenir au point bleu", () => {
  assert.equal(niveaux.lireCagouSurCarte(), true);
  niveaux.ecrireCagouSurCarte(false);
  assert.equal(niveaux.lireCagouSurCarte(), false);
  niveaux.ecrireCagouSurCarte(true);
  assert.equal(niveaux.lireCagouSurCarte(), true);
});

test("dessin : couronne pour Gardien et Légende, éclats pour Légende seulement", () => {
  const couronne = 'd="M25 15 L27 4';
  assert.ok(!avatarSvg(2).includes(couronne));
  assert.ok(avatarSvg(3).includes(couronne));
  assert.ok(avatarSvg(4).includes(couronne));
  assert.ok(!avatarSvg(3).includes('class="eclat"'));
  assert.equal(avatarSvg(4).split('class="eclat"').length - 1, 3);
  assert.ok(avatarSvg(4).includes("avatar-legende"));
  // Toujours le point bleu de la position
  for (let r = 0; r <= 4; r++) assert.ok(avatarSvg(r).includes('fill="#3B82F6"'), `rang ${r}`);
  // Rang hors limites : ramené entre Poussin et Légende
  assert.equal(avatarSvg(9), avatarSvg(4));
  assert.equal(avatarSvg(-2), avatarSvg(0));
  // Taille demandée, proportions gardées (72 × 92)
  assert.match(avatarSvg(1, 54), /width="54" height="69"/);
});

test("grade sur les signalements : libellé, rien pour 0", () => {
  assert.equal(niveaux.libelleGrade(0), null);
  assert.equal(niveaux.libelleGrade(undefined), null);
  assert.equal(niveaux.libelleGrade(1), "Signalé par une Vigie");
  assert.equal(niveaux.libelleGrade(2), "Signalé par une Sentinelle");
  assert.equal(niveaux.libelleGrade(3, true), "Relayé par un Gardien");
  assert.equal(niveaux.libelleGrade(4), "Signalé par une Légende");
  assert.equal(niveaux.libelleGrade(9), null);
});

test("badges : même liste que le grade calculé par la base", () => {
  // ⚠️ Si cette liste change, changer aussi vigie_nb_badges() dans
  // supabase/schema.sql (le grade montré sur les signalements).
  assert.deepEqual(
    BADGES.map((b) => b.id),
    [
      "premiere-vigie",
      "bon-oeil",
      "temoin-fiable",
      "ouvreur-de-route",
      "sentinelle-cyclone",
      "vigie-du-quartier",
      "fidele-au-poste",
      "oeil-de-faucon",
      "pilier-de-la-route",
      "memoire-du-pays",
    ],
  );
});
