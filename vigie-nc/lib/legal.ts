// Informations légales affichées dans l'appli (mentions légales,
// confidentialité, conditions d'utilisation). Un seul endroit à modifier.

export const LEGAL = {
  editeur: "Tramea Solutions",
  porteur: "Patrice Kouwahara",
  contact: "tramea.solutions@gmail.com",
  // Numéro RIDET : à remplir une fois l'immatriculation faite
  // (ex. "1 234 567.001"). Tant qu'il est vide, la ligne n'est pas affichée.
  ridet: "",
  lieu: "Nouvelle-Calédonie",
  // À changer à chaque modification des textes légaux.
  miseAJour: "22 octobre 2026",
  hebergeur: {
    nom: "Vercel Inc.",
    adresse: "440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis",
    site: "https://vercel.com",
  },
  base: {
    nom: "Supabase, Inc.",
    lieu: "Sydney (Australie)",
    site: "https://supabase.com",
  },
} as const;

export const CONTACT_MAILTO = `mailto:${LEGAL.contact}`;
