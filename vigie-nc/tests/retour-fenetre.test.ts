// Bouton Retour du téléphone (lib/retour-fenetre.ts) : il ferme la fenêtre
// ouverte au lieu de quitter la page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { creerGestionnaireRetour, fenetresDe, type GestionnaireRetour } from "../lib/retour-fenetre";

/** Faux historique : Retour est traité plus tard, comme dans un vrai navigateur. */
class FauxHistorique {
  entrees: unknown[] = [{ __NA: true, arbre: "accueil" }];
  i = 0;
  retoursEnFile = 0;
  retoursDemandes = 0;
  ecouteur: (state: unknown) => void = () => {};
  get state(): unknown {
    return this.entrees[this.i];
  }
  pushState(d: unknown): void {
    this.entrees = this.entrees.slice(0, this.i + 1);
    this.entrees.push(d);
    this.i += 1;
  }
  replaceState(d: unknown): void {
    this.entrees[this.i] = d;
  }
  back(): void {
    this.retoursEnFile += 1;
    this.retoursDemandes += 1;
  }
  /** Le navigateur traite les retours en attente (événement popstate). */
  traiter(): void {
    while (this.retoursEnFile > 0) {
      this.retoursEnFile -= 1;
      if (this.i > 0) {
        this.i -= 1;
        this.ecouteur(this.state);
      }
    }
  }
  /** La personne appuie sur Retour. */
  appuyerRetour(): void {
    this.retoursEnFile += 1;
    this.traiter();
  }
}

/** Faux minuteur : les tâches attendent qu'on les lance. */
class FauxMinuteur {
  taches: { f: () => void; ms: number }[] = [];
  planifier = (f: () => void, ms: number): void => {
    this.taches.push({ f, ms });
  };
  /** Lance les tâches immédiates (setTimeout 0). */
  tour(): void {
    const maintenant = this.taches.filter((t) => t.ms === 0);
    this.taches = this.taches.filter((t) => t.ms !== 0);
    for (const t of maintenant) t.f();
  }
  /** Le temps passe : tout est lancé. */
  toutLancer(): void {
    while (this.taches.length > 0) {
      const t = this.taches.shift();
      t?.f();
    }
  }
}

function monter(): { h: FauxHistorique; m: FauxMinuteur; g: GestionnaireRetour } {
  const h = new FauxHistorique();
  const m = new FauxMinuteur();
  const g = creerGestionnaireRetour(h, m.planifier);
  h.ecouteur = (s) => g.surRetour(s);
  return { h, m, g };
}

test("Retour : ferme la fiche ouverte et revient à l'accueil, état de Next.js gardé", () => {
  const { h, g } = monter();
  let fermee = 0;
  g.ouvrir(() => {
    fermee += 1;
  });
  assert.equal(h.entrees.length, 2);
  assert.equal((h.state as { arbre: string }).arbre, "accueil", "l'état de Next.js est recopié");
  assert.equal(fenetresDe(h.state).length, 1);
  h.appuyerRetour();
  assert.equal(fermee, 1);
  assert.equal(h.i, 0);
  assert.equal(g.ouvertes(), 0);
});

test("Fermée par la croix : son étape est retirée, rien d'autre ne se ferme", () => {
  const { h, m, g } = monter();
  let fermee = 0;
  const fermer = g.ouvrir(() => {
    fermee += 1;
  });
  fermer();
  m.tour();
  h.traiter();
  assert.equal(h.i, 0, "l'étape de la fiche a été retirée");
  assert.equal(fermee, 0, "la fenêtre n'est pas refermée une 2e fois");
  assert.equal(h.retoursDemandes, 1);
});

test("Fermée par Retour puis démontée : pas de retour en trop", () => {
  const { h, m, g } = monter();
  let fermer = () => {};
  fermer = g.ouvrir(() => fermer());
  h.appuyerRetour();
  m.toutLancer();
  assert.equal(h.retoursDemandes, 0, "seul le Retour de la personne a compté");
  assert.equal(h.i, 0);
});

test("D'une fiche à l'autre : une seule étape, Retour ferme la seconde", () => {
  const { h, m, g } = monter();
  let premiere = 0;
  let seconde = 0;
  const fermer1 = g.ouvrir(() => {
    premiere += 1;
  });
  // Même tour : la 1re fiche se démonte, la 2e se monte (clé React changée).
  fermer1();
  g.ouvrir(() => {
    seconde += 1;
  });
  m.tour();
  h.traiter();
  assert.equal(h.entrees.length, 2, "pas d'étape empilée");
  assert.equal(h.retoursDemandes, 0);
  h.appuyerRetour();
  assert.equal(seconde, 1);
  assert.equal(premiere, 0);
  assert.equal(h.i, 0);
});

test("Deux fenêtres empilées : Retour ferme celle du dessus, puis l'autre", () => {
  const { h, g } = monter();
  const fermees: string[] = [];
  g.ouvrir(() => fermees.push("fiche"));
  g.ouvrir(() => fermees.push("légende"));
  h.appuyerRetour();
  assert.deepEqual(fermees, ["légende"]);
  h.appuyerRetour();
  assert.deepEqual(fermees, ["légende", "fiche"]);
  assert.equal(h.i, 0);
});

test("Fenêtre du dessous fermée à la main : Retour ferme encore celle du dessus", () => {
  const { h, m, g } = monter();
  const fermees: string[] = [];
  const fermerFiche = g.ouvrir(() => fermees.push("fiche"));
  g.ouvrir(() => fermees.push("légende"));
  fermerFiche();
  m.toutLancer();
  h.traiter();
  assert.equal(h.retoursDemandes, 0, "on ne recule pas sous la légende");
  h.appuyerRetour();
  assert.deepEqual(fermees, ["légende"]);
  assert.equal(g.ouvertes(), 0);
});

test("Changement de page pendant qu'une fenêtre est ouverte : pas de retour vers l'ancienne page", () => {
  const { h, m, g } = monter();
  const fermer = g.ouvrir(() => {});
  h.pushState({ __NA: true, arbre: "signaler" }); // Next.js ouvre /signaler
  fermer(); // la fiche est démontée avec l'ancienne page
  m.toutLancer();
  h.traiter();
  assert.equal(h.retoursDemandes, 0);
  assert.equal((h.state as { arbre: string }).arbre, "signaler");
});

test("Fenêtre ouverte pendant un retour en route : posée après, jamais refermée par erreur", () => {
  const { h, m, g } = monter();
  const fermer1 = g.ouvrir(() => {});
  fermer1();
  m.tour(); // le retour part
  let seconde = 0;
  g.ouvrir(() => {
    seconde += 1;
  });
  h.traiter(); // le retour arrive
  assert.equal(seconde, 0, "la nouvelle fenêtre reste ouverte");
  assert.equal(g.ouvertes(), 1);
  assert.equal(h.i, 1, "elle a son étape");
  h.appuyerRetour();
  assert.equal(seconde, 1);
  assert.equal(h.i, 0);
});

test("Retour sans fenêtre ouverte : rien ne se passe de notre côté", () => {
  const { h, g } = monter();
  h.pushState({ __NA: true, arbre: "alertes" });
  h.appuyerRetour();
  assert.equal(g.ouvertes(), 0);
  assert.equal(h.i, 0);
});
