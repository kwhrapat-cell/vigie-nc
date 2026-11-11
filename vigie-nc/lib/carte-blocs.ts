// Fond de carte Vigie en ligne : le fichier de la carte (PMTiles, publié
// chaque mois) est lu par blocs alignés de 32 Ko (/api/carte). Mêmes
// adresses pour tout le monde : le CDN de Vercel garde chaque bloc (environ
// 700 pour toute la Calédonie), le navigateur et le service worker aussi
// (public/sw.js, cache « carte-blocs-v1 »). Mesuré le 11/11/2026 sur la
// carte réelle : une vue de téléphone ≈ 7 blocs, ≈ 220 Ko, souvent déjà
// gardés en passant d'une vue à la voisine. Logique pure, testée par
// tests/carte-blocs.test.ts.

export const BLOC_OCTETS = 32_768;

/** Numéros des blocs qui couvrent les octets [debut, debut + longueur[. */
export function blocsCouvrant(debut: number, longueur: number, bloc: number = BLOC_OCTETS): number[] {
  if (longueur <= 0) return [];
  const premier = Math.floor(debut / bloc);
  const dernier = Math.floor((debut + longueur - 1) / bloc);
  const out: number[] = [];
  for (let n = premier; n <= dernier; n++) out.push(n);
  return out;
}

/** Octets [debut, fin] (fin incluse) du bloc n, sans dépasser la fin du fichier. */
export function bornesBloc(n: number, total: number, bloc: number = BLOC_OCTETS): [number, number] {
  const debut = n * bloc;
  return [debut, Math.min(debut + bloc, total) - 1];
}

/** Adresse d'un bloc (la même pour tout le monde : gardée en cache partout). */
export function adresseBloc(fichier: string, n: number, total: number, bloc: number = BLOC_OCTETS): string {
  const [debut, fin] = bornesBloc(n, total, bloc);
  return `/api/carte?f=${encodeURIComponent(fichier)}&debut=${debut}&fin=${fin}`;
}

/** Recolle les octets [debut, debut + longueur[ à partir des blocs lus. */
export function assembler(
  blocs: ReadonlyMap<number, Uint8Array>,
  debut: number,
  longueur: number,
  bloc: number = BLOC_OCTETS,
): Uint8Array {
  const out = new Uint8Array(longueur);
  let ecrit = 0;
  for (const n of blocsCouvrant(debut, longueur, bloc)) {
    const b = blocs.get(n);
    if (!b) throw new Error("bloc_manquant");
    const depuis = Math.max(0, debut + ecrit - n * bloc);
    const morceau = b.subarray(depuis, Math.min(b.length, depuis + (longueur - ecrit)));
    out.set(morceau, ecrit);
    ecrit += morceau.length;
  }
  if (ecrit !== longueur) throw new Error("bloc_incomplet");
  return out;
}
