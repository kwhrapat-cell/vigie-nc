// Traitement par lots (revue de sécurité du 11/11/2026) : les notifications
// partent N à la fois au lieu de toutes ensemble. Avec beaucoup d'abonnés (ou
// des milliers de faux abonnements), tout envoyer d'un coup ouvrirait des
// milliers de connexions et ferait tomber l'envoi pour tout le monde.
// Logique pure, testée par tests/securite.test.ts.

export const LOT_ENVOIS = 50;

/** Applique `traiter` à chaque élément, `taille` à la fois, dans l'ordre. */
export async function parLots<T, R>(elements: readonly T[], traiter: (e: T) => Promise<R>, taille = LOT_ENVOIS): Promise<R[]> {
  const n = Math.max(1, Math.floor(taille));
  const resultats: R[] = [];
  for (let i = 0; i < elements.length; i += n) {
    resultats.push(...(await Promise.all(elements.slice(i, i + n).map(traiter))));
  }
  return resultats;
}
