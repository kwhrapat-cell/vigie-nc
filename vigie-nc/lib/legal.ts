// Informations légales affichées dans l'appli (mentions légales,
// confidentialité, conditions d'utilisation). Un seul endroit à modifier.
// Identité de l'entreprise : avis de situation RIDET (Isee) du 29/10/2026.

export const LEGAL = {
  editeur: "Tramea Solutions",
  porteur: "Patrice Kouwahara",
  // Nom tel qu'inscrit au RIDET (« Désignation »).
  designation: "KOUWAHARA Patrice",
  formeJuridique: "Entreprise individuelle (personne physique)",
  // « Enseigne » de l'établissement sur l'avis RIDET.
  enseigne: "Tramea Solutions / Vigie-nc",
  // Numéro RIDET de l'établissement (obligatoire sur toute correspondance).
  // Tant qu'il est vide, la ligne n'est pas affichée.
  ridet: "0 726 331.003",
  // Adresse de l'établissement (avis RIDET) et adresse postale.
  adresse: "73 rue Cécile Tetumu, Julisa, Païta",
  adressePostale: "BP 622, 98890 Païta",
  // Téléphone professionnel (exigé par la loi pour un éditeur personne
  // physique). Vide = ligne masquée.
  telephone: "82 68 81",
  telephoneLien: "tel:+687826881",
  contact: "tramea.solutions@gmail.com",
  lieu: "Nouvelle-Calédonie",
  // À changer à chaque modification des textes légaux.
  miseAJour: "30 octobre 2026",
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
