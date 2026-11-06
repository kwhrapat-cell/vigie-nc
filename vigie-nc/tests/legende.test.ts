// Légende de la carte et astuce « cercle + SOS » (lib/legende.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASTUCE_CARTE_KEY,
  astuceCarteAMontrer,
  CHARGEMENT_LENT_MS,
  ecrireAstuceCarteVue,
  LEGENDE,
  SOS_EXPLICATION,
  libelleMiseAJour,
  lireAstuceCarte,
  REPERE_RECENT_MIN,
  texteDerniereMiseAJour,
  texteTypesCategorie,
  typesDeCategorie,
  TYPE_EXEMPLE,
} from "../lib/legende";
import { ACCUEIL_KEY, ASTUCE_SIGNALER_KEY } from "../lib/tuto";
import { RADIUS_OPTIONS_KM } from "../lib/preferences";
import { REPORT_TYPE_CATEGORY, SIGNALABLE_TYPES, type Category } from "../lib/types";

const CATEGORIES: Category[] = ["danger", "perturbation", "meteo"];

/** Tous les textes de la légende et de l'astuce, à plat. */
function tousLesTextes(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(tousLesTextes);
  if (v && typeof v === "object") return Object.values(v).flatMap(tousLesTextes);
  return [];
}

test("légende : jamais « route libre », « sûre » ni « tout est calme » (décision du 05/11/2026)", () => {
  const textes = [
    ...tousLesTextes(LEGENDE),
    ...tousLesTextes(SOS_EXPLICATION),
    ...CATEGORIES.map(texteTypesCategorie),
    texteDerniereMiseAJour(null),
    texteDerniereMiseAJour(new Date()),
  ];
  const interdit = /(route|voie|trajet|chemin)s?\s+(est\s+|sont\s+)?(libres?|sûres?|dégagée?s?)|tout est calme|sans danger|sans risque/i;
  for (const t of textes) {
    const m = interdit.exec(t);
    if (!m) continue;
    // Seule forme admise : la mise en garde (« ne garantit pas que la route est dégagée »).
    const avant = t.slice(0, m.index);
    assert.match(avant, /ne (garantit|veut dire) pas que (la |le |les |ta |ton )?$/, `texte interdit : « ${t} »`);
  }
});

test("légende : chaque type signalable est dans une seule catégorie, sans le SOS", () => {
  const vus = CATEGORIES.flatMap(typesDeCategorie);
  assert.equal(vus.length, SIGNALABLE_TYPES.length);
  assert.deepEqual(new Set(vus), new Set(SIGNALABLE_TYPES));
  assert.ok(!(vus as string[]).includes("sos"));
  for (const c of CATEGORIES) {
    assert.ok(typesDeCategorie(c).length > 0, `catégorie vide : ${c}`);
    assert.equal(REPORT_TYPE_CATEGORY[TYPE_EXEMPLE[c]], c, `repère d'exemple hors catégorie : ${c}`);
  }
  assert.equal(texteTypesCategorie("danger"), "accident, feu ou fumée, route coupée, danger");
});

test("légende : les rayons cités sont ceux du choix de la zone", () => {
  const cites = RADIUS_OPTIONS_KM.join(", ").replace(/, (\d+)$/, " ou $1");
  assert.ok(LEGENDE.zone.rayon.startsWith(`${cites} km`), LEGENDE.zone.rayon);
  assert.ok(LEGENDE.astuce.cercle.includes(`${cites} km`), LEGENDE.astuce.cercle);
  assert.ok(LEGENDE.reperes.recent.includes(`${REPERE_RECENT_MIN} minutes`));
});

test("SOS : ce qu'il fait, qui reçoit, la position, si ça ne marche pas (avant usage)", () => {
  assert.deepEqual(
    SOS_EXPLICATION.map((q) => q.titre),
    ["Ce qu'il fait", "Qui le reçoit", "Ta position", "Si ça ne marche pas"],
  );
  const sos = SOS_EXPLICATION.map((q) => q.texte).join(" ");
  assert.match(sos, /3 secondes/); // appui long de app/sos/page.tsx
  assert.match(sos, /C'est toi qui l'envoies/);
  assert.match(sos, /ne prévient pas les secours/);
  assert.match(sos, /ni publiée sur la carte/);
  assert.match(sos, /pas même Vigie NC/);
  assert.match(sos, /lien Google Maps/); // lib/sos.ts lienPosition
  assert.match(sos, /sans elle/); // « Prévenir mes contacts sans position »
  assert.match(sos, /15.*17.*18/);
  assert.match(LEGENDE.astuce.sos, /rien n'est publié/i);
  assert.match(LEGENDE.astuce.sos, /rien ne part sans toi/i);
});

test("mise à jour : chargement, chargement long, heure, pas de connexion", () => {
  const d = new Date(2026, 10, 6, 19, 4);
  assert.equal(libelleMiseAJour("loading", null, false), "Chargement…");
  assert.equal(libelleMiseAJour("loading", null, true), "Chargement long…");
  assert.match(libelleMiseAJour("ready", d, false), /^Mis à jour à 19[:h]04$/);
  assert.equal(libelleMiseAJour("ready", null, false), "");
  assert.equal(libelleMiseAJour("error", null, false), "Pas de connexion");
  // Hors ligne avec la dernière carte connue : on garde son heure.
  assert.match(libelleMiseAJour("error", d, false), /^Mis à jour à 19[:h]04$/);
  assert.match(texteDerniereMiseAJour(d), /^Dernière mise à jour : 19[:h]04\.$/);
  assert.ok(CHARGEMENT_LENT_MS >= 5_000 && CHARGEMENT_LENT_MS <= 30_000);
});

test("astuce de la carte : après l'accueil et la bulle du « + », une seule fois", () => {
  assert.equal(astuceCarteAMontrer(null, null, null), false); // accueil pas encore vu
  assert.equal(astuceCarteAMontrer(null, "1", "a-montrer"), false); // la bulle du « + » d'abord
  assert.equal(astuceCarteAMontrer(null, "1", "vue"), true);
  assert.equal(astuceCarteAMontrer(null, "1", null), true); // anciens utilisateurs
  assert.equal(astuceCarteAMontrer("vue", "1", "vue"), false);
});

test("astuce de la carte : lue et écrite sur le téléphone, sans planter", () => {
  assert.equal(lireAstuceCarte(), false); // pas de fenêtre (comme côté serveur)
  assert.doesNotThrow(() => ecrireAstuceCarteVue());

  const donnees = new Map<string, string>([
    [ACCUEIL_KEY, "1"],
    [ASTUCE_SIGNALER_KEY, "vue"],
  ]);
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => donnees.get(k) ?? null,
      setItem: (k: string, v: string) => void donnees.set(k, v),
    },
  };
  try {
    assert.equal(lireAstuceCarte(), true);
    ecrireAstuceCarteVue();
    assert.equal(donnees.get(ASTUCE_CARTE_KEY), "vue");
    assert.equal(lireAstuceCarte(), false);
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});

test("légende : le modèle de confiance et la position disent ce que fait le code", () => {
  const confiance = LEGENDE.confiance.lignes.join(" ");
  assert.match(confiance, /sans compte et sans nom/);
  assert.match(confiance, /5 km/); // MAX_WITNESS_DISTANCE_M
  assert.match(confiance, /C'est terminé/);
  assert.match(confiance, /Relayé/);
  assert.match(confiance, /Vérifié/);
  const position = LEGENDE.position.lignes.join(" ");
  assert.match(position, /fonds de carte/); // tuiles : zone affichée
  assert.match(position, /OpenStreetMap/); // nom du lieu (lib/place.ts)
  assert.match(position, /sans être enregistrée/);
  assert.match(LEGENDE.zone.rayon, /centré sur ta position/);
  assert.match(LEGENDE.zone.rayon, /Ma zone/);
});
