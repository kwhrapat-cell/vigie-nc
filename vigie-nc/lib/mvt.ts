// Lecture d'une tuile vectorielle (format « Mapbox Vector Tile », protobuf),
// sans dépendance : la carte sans réseau (lib/carte-dessin.ts).
// Format : https://github.com/mapbox/vector-tile-spec/tree/master/2.1

export type TypeGeometrie = 1 | 2 | 3; // point, ligne, polygone

export interface Objet {
  type: TypeGeometrie;
  /** Points (x, y à la suite), une liste par ligne ou anneau. */
  parties: number[][];
  props: Record<string, string | number | boolean>;
}

export interface Couche {
  nom: string;
  etendue: number;
  objets: Objet[];
}

class Lecteur {
  pos = 0;
  octets: Uint8Array;
  constructor(octets: Uint8Array) {
    this.octets = octets;
  }

  fini(fin: number): boolean {
    return this.pos >= fin;
  }

  varint(): number {
    let valeur = 0;
    let facteur = 1;
    for (let i = 0; i < 10; i++) {
      const b = this.octets[this.pos++];
      valeur += (b & 0x7f) * facteur;
      if (b < 0x80) return valeur;
      facteur *= 128;
    }
    throw new Error("varint trop long");
  }

  /** Clé d'un champ : [numéro, type de valeur]. */
  cle(): [number, number] {
    const c = this.varint();
    return [Math.floor(c / 8), c % 8];
  }

  longueur(): number {
    return this.varint();
  }

  texte(): string {
    const n = this.longueur();
    const s = DECODEUR.decode(this.octets.subarray(this.pos, this.pos + n));
    this.pos += n;
    return s;
  }

  /** Fin d'un bloc « length-delimited » (lit sa longueur). */
  finBloc(): number {
    const n = this.longueur();
    return this.pos + n;
  }

  sauter(typeValeur: number): void {
    if (typeValeur === 0) this.varint();
    else if (typeValeur === 1) this.pos += 8;
    else if (typeValeur === 2) this.pos = this.finBloc();
    else if (typeValeur === 5) this.pos += 4;
    else throw new Error("type de valeur inconnu");
  }

  /** Suite d'entiers « packed ». */
  entiers(): number[] {
    const fin = this.finBloc();
    const out: number[] = [];
    while (this.pos < fin) out.push(this.varint());
    return out;
  }
}

const DECODEUR = new TextDecoder();

function zigzag(n: number): number {
  return n % 2 === 0 ? n / 2 : -(n + 1) / 2;
}

function lireValeur(l: Lecteur, fin: number): string | number | boolean {
  let v: string | number | boolean = "";
  const vue = new DataView(l.octets.buffer, l.octets.byteOffset, l.octets.byteLength);
  while (!l.fini(fin)) {
    const [champ, type] = l.cle();
    if (champ === 1 && type === 2) v = l.texte();
    else if (champ === 2 && type === 5) {
      v = vue.getFloat32(l.pos, true);
      l.pos += 4;
    } else if (champ === 3 && type === 1) {
      v = vue.getFloat64(l.pos, true);
      l.pos += 8;
    } else if ((champ === 4 || champ === 5) && type === 0) v = l.varint();
    else if (champ === 6 && type === 0) v = zigzag(l.varint());
    else if (champ === 7 && type === 0) v = l.varint() !== 0;
    else l.sauter(type);
  }
  return v;
}

/** Commandes de géométrie → parties (lignes ou anneaux). */
export function decoderGeometrie(commandes: number[]): number[][] {
  const parties: number[][] = [];
  let actuelle: number[] | null = null;
  let x = 0;
  let y = 0;
  let i = 0;
  while (i < commandes.length) {
    const c = commandes[i++];
    const id = c & 0x7;
    const nb = c >>> 3;
    if (id === 1 || id === 2) {
      for (let k = 0; k < nb && i + 1 < commandes.length; k++) {
        x += zigzag(commandes[i++]);
        y += zigzag(commandes[i++]);
        if (id === 1) {
          actuelle = [];
          parties.push(actuelle);
        }
        actuelle?.push(x, y);
      }
    } else if (id === 7) {
      // fermeture : le dessin referme l'anneau lui-même
    } else {
      break;
    }
  }
  return parties;
}

function lireObjet(l: Lecteur, fin: number, brut: { tags: number[]; type: number; geom: number[] }): void {
  while (!l.fini(fin)) {
    const [champ, type] = l.cle();
    if (champ === 2 && type === 2) brut.tags = l.entiers();
    else if (champ === 3 && type === 0) brut.type = l.varint();
    else if (champ === 4 && type === 2) brut.geom = l.entiers();
    else l.sauter(type);
  }
}

/**
 * Tuile (déjà décompressée) → couches. `garder` : noms des couches à lire
 * (les autres sont sautées sans être décodées).
 */
export function lireTuile(octets: Uint8Array, garder?: Set<string>): Couche[] {
  const l = new Lecteur(octets);
  const couches: Couche[] = [];
  while (!l.fini(octets.length)) {
    const [champ, type] = l.cle();
    if (champ !== 3 || type !== 2) {
      l.sauter(type);
      continue;
    }
    const fin = l.finBloc();
    let nom = "";
    let etendue = 4096;
    const cles: string[] = [];
    const valeurs: (string | number | boolean)[] = [];
    const bruts: { tags: number[]; type: number; geom: number[] }[] = [];
    const debut = l.pos;
    // 1er passage : le nom (pour sauter vite les couches inutiles)
    while (!l.fini(fin)) {
      const [c, t] = l.cle();
      if (c === 1 && t === 2) {
        nom = l.texte();
        break;
      }
      l.sauter(t);
    }
    if (garder && !garder.has(nom)) {
      l.pos = fin;
      continue;
    }
    l.pos = debut;
    while (!l.fini(fin)) {
      const [c, t] = l.cle();
      if (c === 1 && t === 2) nom = l.texte();
      else if (c === 2 && t === 2) {
        const finObjet = l.finBloc();
        const brut = { tags: [] as number[], type: 0, geom: [] as number[] };
        lireObjet(l, finObjet, brut);
        l.pos = finObjet;
        bruts.push(brut);
      } else if (c === 3 && t === 2) cles.push(l.texte());
      else if (c === 4 && t === 2) {
        const finValeur = l.finBloc();
        valeurs.push(lireValeur(l, finValeur));
        l.pos = finValeur;
      } else if (c === 5 && t === 0) etendue = l.varint();
      else l.sauter(t);
    }
    l.pos = fin;
    const objets: Objet[] = [];
    for (const b of bruts) {
      if (b.type < 1 || b.type > 3) continue;
      const props: Record<string, string | number | boolean> = {};
      for (let k = 0; k + 1 < b.tags.length; k += 2) {
        const cle = cles[b.tags[k]];
        const val = valeurs[b.tags[k + 1]];
        if (cle !== undefined && val !== undefined) props[cle] = val;
      }
      objets.push({ type: b.type as TypeGeometrie, parties: decoderGeometrie(b.geom), props });
    }
    couches.push({ nom, etendue, objets });
  }
  return couches;
}
