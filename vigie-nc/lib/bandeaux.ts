// Bandeaux de l'accueil (au-dessus de la carte) : un seul à la fois, le plus
// important d'abord, pour ne pas écraser la carte. Quand on ferme celui
// affiché, le suivant apparaît. Les autres attendent sans rien perdre (un
// travaux n'est pas noté « vu », le merci ne s'efface pas en douce).
//
// Ordre :
// 1. annonce « urgence » ou « vigilance » de la modération (sécurité)
// 2. « Tu passes par là ? » (on est sur place maintenant)
// 3. annonce « info » de la modération
// 4. travaux près de toi (à l'ouverture)
// 5. « Ton signalement a servi » (merci)
//
// Une annonce masquée par un bandeau plus important reste visible en petite
// pastille (règle : une annonce en cours ne disparaît jamais).

export const BANDEAUX = ["annonce-alerte", "demande", "annonce-info", "travaux", "impact"] as const;
export type Bandeau = (typeof BANDEAUX)[number];
export type Presences = Record<Bandeau, boolean>;

export const AUCUN_BANDEAU: Presences = {
  "annonce-alerte": false,
  demande: false,
  "annonce-info": false,
  travaux: false,
  impact: false,
};

/** Le bandeau affiché : le plus important de ceux qui ont quelque chose à montrer. */
export function bandeauAffiche(presents: Presences): Bandeau | null {
  return BANDEAUX.find((b) => presents[b]) ?? null;
}

/** Un bandeau plus important que `b` a-t-il quelque chose à montrer ? */
export function masquePar(b: Bandeau, presents: Presences): boolean {
  return BANDEAUX.slice(0, BANDEAUX.indexOf(b)).some((x) => presents[x]);
}
