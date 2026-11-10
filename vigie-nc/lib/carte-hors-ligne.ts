"use client";

// Carte sans réseau : téléchargement d'une partie de la carte de la
// Calédonie (fichier PMTiles publié chaque mois par
// .github/workflows/carte.yml), gardée sur le téléphone, puis lue tuile par
// tuile quand le réseau manque (lib/couche-hors-ligne.ts).
//
// Le téléphone ne parle qu'à vigie-nc.com (/api/carte), qui va chercher les
// morceaux demandés dans le dépôt GitHub du projet.
//
// Rangement (Cache Storage « carte-hors-ligne-v1 », jamais effacé par le
// service worker, qui ne touche qu'aux caches « vigie-… ») :
//   /__carte/<aire>/<fichier>/index        index des tuiles (lib/carte-plan.ts)
//   /__carte/<aire>/<fichier>/m/<début>    un morceau du fichier
// et, dans le localStorage, la liste des cartes (« vigie-nc:carte-hors-ligne-v1 »).

import { chercherEntree, decompresser, lireEnTete, lireRepertoire, PMTILES_RACINE_OCTETS, zxyVersTileId } from "./pmtiles";
import type { EnTete, Entree } from "./pmtiles";
import {
  chercherMorceau,
  chercherTuile,
  encoderIndex,
  lireIndex,
  morceauDe,
  octetsTotal,
  RAYON_ZONE_KM,
  regrouper,
  tuilesCercle,
  tuilesLigne,
  ZOOM_MAX_CARTE,
} from "./carte-plan";
import type { Index } from "./carte-plan";
import type { LatLng } from "./geo";
import type { Point } from "./trajet";

export const CARTE_CACHE = "carte-hors-ligne-v1";
export const CARTE_META_CLE = "vigie-nc:carte-hors-ligne-v1";
export const CARTE_MAJ_AUTO_CLE = "vigie-nc:carte-maj-auto";
/** Prévenu quand une carte est ajoutée, mise à jour ou supprimée. */
export const CARTE_EVENT = "vigie-nc:carte-hors-ligne";

export type AireId = "zone" | "trajet" | "nc";
export const AIRES: AireId[] = ["zone", "trajet", "nc"];

export const NOM_AIRE: Record<AireId, string> = {
  zone: `Autour de moi · ${RAYON_ZONE_KM} km`,
  trajet: "Mon trajet",
  nc: "Toute la Calédonie",
};

export interface AireCarte {
  id: AireId;
  fichier: string;
  source: string;
  octets: number;
  nbTuiles: number;
  /** Heure de la fin du téléchargement (ms), 0 tant que ce n'est pas fini. */
  at: number;
  fini: boolean;
  compressionTuiles: number;
  /** Zone : centre choisi et nom du lieu. */
  centre?: LatLng;
  lieu?: string | null;
}

export interface Fiche {
  fichier: string;
  source: string;
  octets: number;
  zoomMax: number;
}

export type ChoixCarte = { id: "zone"; centre: LatLng; lieu?: string | null } | { id: "trajet"; points: Point[] } | { id: "nc" };

export interface Plan {
  choix: ChoixCarte;
  fiche: Fiche;
  entete: EnTete;
  entrees: Entree[];
  morceaux: [number, number][];
  octets: number;
}

// --- Liste des cartes (localStorage) --------------------------------------

function annoncer(): void {
  try {
    window.dispatchEvent(new Event(CARTE_EVENT));
  } catch {
    // pas de fenêtre
  }
}

export function lireAires(): AireCarte[] {
  if (typeof window === "undefined") return [];
  try {
    const brut = JSON.parse(window.localStorage.getItem(CARTE_META_CLE) ?? "[]") as unknown;
    if (!Array.isArray(brut)) return [];
    return brut.filter(
      (a): a is AireCarte =>
        a && typeof a === "object" && AIRES.includes(a.id) && typeof a.fichier === "string" && typeof a.octets === "number",
    );
  } catch {
    return [];
  }
}

function ecrireAires(aires: AireCarte[]): void {
  try {
    window.localStorage.setItem(CARTE_META_CLE, JSON.stringify(aires));
  } catch {
    // stockage plein : la carte reste dans le cache, mais l'appli l'ignore
  }
  annoncer();
}

function majAire(a: AireCarte): void {
  ecrireAires([...lireAires().filter((x) => x.id !== a.id), a]);
}

/** Une carte téléchargée en entier existe sur ce téléphone. */
export function carteHorsLigneDisponible(): boolean {
  return lireAires().some((a) => a.fini);
}

export function majAutoActive(): boolean {
  try {
    return window.localStorage.getItem(CARTE_MAJ_AUTO_CLE) !== "non";
  } catch {
    return true;
  }
}

export function changerMajAuto(oui: boolean): void {
  try {
    window.localStorage.setItem(CARTE_MAJ_AUTO_CLE, oui ? "oui" : "non");
  } catch {
    // sans stockage : réglage par défaut (oui)
  }
}

// --- Lecture à distance (/api/carte) --------------------------------------

export async function lireFiche(signal?: AbortSignal): Promise<Fiche> {
  const r = await fetch("/api/carte?fiche=1", { signal, cache: "no-store" });
  if (!r.ok) throw new Error("carte_indisponible");
  const f = (await r.json()) as Partial<Fiche>;
  if (typeof f.fichier !== "string" || !/^nc-\d{8}\.pmtiles$/.test(f.fichier) || typeof f.octets !== "number") {
    throw new Error("carte_indisponible");
  }
  return { fichier: f.fichier, source: String(f.source ?? ""), octets: f.octets, zoomMax: Number(f.zoomMax ?? ZOOM_MAX_CARTE) };
}

/** Octets [debut, fin[ du fichier. */
async function lirePlage(fichier: string, debut: number, fin: number, signal?: AbortSignal): Promise<Uint8Array> {
  const r = await fetch(`/api/carte?f=${encodeURIComponent(fichier)}&debut=${debut}&fin=${fin - 1}`, { signal });
  if (!r.ok) throw new Error("carte_indisponible");
  const octets = new Uint8Array(await r.arrayBuffer());
  if (octets.length !== fin - debut) throw new Error("carte_incomplete");
  return octets;
}

class LecteurDistant {
  private feuilles = new Map<number, Promise<Entree[]>>();
  private fiche: Fiche;
  readonly entete: EnTete;
  private racine: Entree[];
  private signal?: AbortSignal;

  private constructor(fiche: Fiche, entete: EnTete, racine: Entree[], signal?: AbortSignal) {
    this.fiche = fiche;
    this.entete = entete;
    this.racine = racine;
    this.signal = signal;
  }

  static async ouvrir(fiche: Fiche, signal?: AbortSignal): Promise<LecteurDistant> {
    const debut = await lirePlage(fiche.fichier, 0, Math.min(PMTILES_RACINE_OCTETS, fiche.octets), signal);
    const entete = lireEnTete(debut);
    const racine = lireRepertoire(
      await decompresser(debut.subarray(entete.racineDebut, entete.racineDebut + entete.racineLongueur), entete.compressionInterne),
    );
    return new LecteurDistant(fiche, entete, racine, signal);
  }

  private feuille(e: Entree): Promise<Entree[]> {
    let f = this.feuilles.get(e.debut);
    if (!f) {
      const d = this.entete.feuillesDebut + e.debut;
      f = lirePlage(this.fiche.fichier, d, d + e.longueur, this.signal).then(async (o) =>
        lireRepertoire(await decompresser(o, this.entete.compressionInterne)),
      );
      this.feuilles.set(e.debut, f);
    }
    return f;
  }

  /** Entrée de la tuile (début depuis le début du fichier), ou null. */
  async entree(tileId: number): Promise<Entree | null> {
    let e = chercherEntree(this.racine, tileId);
    for (let profondeur = 0; e && e.longueurSerie === 0 && profondeur < 4; profondeur++) {
      e = chercherEntree(await this.feuille(e), tileId);
    }
    if (!e || e.longueurSerie === 0) return null;
    return { tileId, longueurSerie: 1, debut: this.entete.tuilesDebut + e.debut, longueur: e.longueur };
  }

  /** Toutes les tuiles du fichier (séries gardées), débuts depuis le début du fichier. */
  async toutes(): Promise<Entree[]> {
    const out: Entree[] = [];
    const visiter = async (entrees: Entree[], profondeur: number): Promise<void> => {
      for (const e of entrees) {
        if (e.longueurSerie === 0) {
          if (profondeur < 4) await visiter(await this.feuille(e), profondeur + 1);
        } else {
          out.push({ ...e, debut: this.entete.tuilesDebut + e.debut });
        }
      }
    };
    await visiter(this.racine, 0);
    return out;
  }
}

/** Calcule ce qu'il faut télécharger (quelques petites requêtes) et la taille. */
export async function planifier(choix: ChoixCarte, signal?: AbortSignal): Promise<Plan> {
  const fiche = await lireFiche(signal);
  const lecteur = await LecteurDistant.ouvrir(fiche, signal);
  let entrees: Entree[];
  if (choix.id === "nc") {
    entrees = await lecteur.toutes();
  } else {
    const ids =
      choix.id === "zone"
        ? tuilesCercle(choix.centre.lat, choix.centre.lng, RAYON_ZONE_KM * 1000)
        : tuilesLigne(choix.points);
    const trouvees = await Promise.all(ids.map((id) => lecteur.entree(id)));
    entrees = trouvees.filter((e): e is Entree => e !== null);
  }
  const morceaux = regrouper(entrees);
  return { choix, fiche, entete: lecteur.entete, entrees, morceaux, octets: octetsTotal(morceaux) };
}

// --- Téléchargement ---------------------------------------------------------

function cleIndex(id: AireId, fichier: string): string {
  return `/__carte/${id}/${fichier}/index`;
}

function cleMorceau(id: AireId, fichier: string, debut: number): string {
  return `/__carte/${id}/${fichier}/m/${debut}`;
}

const PARALLELE = 2;

/**
 * Télécharge le plan (les morceaux déjà gardés d'un essai interrompu ne
 * sont pas retéléchargés), puis remplace l'ancienne version de cette carte.
 */
export async function telecharger(
  plan: Plan,
  options: { signal?: AbortSignal; progression?: (fait: number, total: number) => void } = {},
): Promise<AireCarte> {
  const { signal, progression } = options;
  const id = plan.choix.id;
  const fichier = plan.fiche.fichier;
  const cache = await caches.open(CARTE_CACHE);
  const precedente = lireAires().find((a) => a.id === id) ?? null;
  const base: AireCarte = {
    id,
    fichier,
    source: plan.fiche.source,
    octets: plan.octets,
    nbTuiles: plan.entrees.reduce((s, e) => s + e.longueurSerie, 0),
    at: 0,
    fini: false,
    compressionTuiles: plan.entete.compressionTuiles,
    centre: plan.choix.id === "zone" ? plan.choix.centre : undefined,
    lieu: plan.choix.id === "zone" ? (plan.choix.lieu ?? null) : undefined,
  };
  // Une carte déjà prête reste utilisable pendant sa mise à jour.
  if (!precedente?.fini) majAire(base);

  let fait = 0;
  const total = plan.octets;
  progression?.(0, total);
  let suivant = 0;
  const travailleur = async () => {
    while (suivant < plan.morceaux.length) {
      if (signal?.aborted) throw new DOMException("Annulé", "AbortError");
      const [debut, fin] = plan.morceaux[suivant++];
      const cle = cleMorceau(id, fichier, debut);
      if (!(await cache.match(cle))) {
        const octets = await lirePlage(fichier, debut, fin, signal);
        await cache.put(cle, new Response(octets as BlobPart, { headers: { "content-type": "application/octet-stream" } }));
      }
      fait += fin - debut;
      progression?.(fait, total);
    }
  };
  await Promise.all(Array.from({ length: PARALLELE }, travailleur));

  await cache.put(cleIndex(id, fichier), new Response(encoderIndex(plan.entrees, plan.morceaux)));
  const prete: AireCarte = { ...base, at: Date.now(), fini: true };
  majAire(prete);
  // Ancienne version (ou ancienne zone) : effacée une fois la nouvelle prête.
  const gardees = new Set([cleIndex(id, fichier), ...plan.morceaux.map(([d]) => cleMorceau(id, fichier, d))]);
  await effacerCles((chemin) => chemin.startsWith(`/__carte/${id}/`) && !gardees.has(chemin));
  oublierLecture();
  // Demande au navigateur de ne pas effacer la carte quand la place manque.
  try {
    await navigator.storage?.persist?.();
  } catch {
    // pas grave
  }
  return prete;
}

async function effacerCles(garder: (chemin: string) => boolean): Promise<void> {
  const cache = await caches.open(CARTE_CACHE);
  for (const req of await cache.keys()) {
    const chemin = new URL(req.url).pathname;
    if (garder(chemin)) await cache.delete(req);
  }
}

export async function supprimerAire(id: AireId): Promise<void> {
  ecrireAires(lireAires().filter((a) => a.id !== id));
  await effacerCles((chemin) => chemin.startsWith(`/__carte/${id}/`));
  oublierLecture();
}

// --- Lecture sur le téléphone ---------------------------------------------

let index: Map<string, Promise<Index | null>> = new Map();
let blobs: Map<string, Promise<Blob | null>> = new Map();
let pretes: AireCarte[] | null = null;

function oublierLecture(): void {
  index = new Map();
  blobs = new Map();
  pretes = null;
}

function airesPretes(): AireCarte[] {
  if (!pretes) pretes = lireAires().filter((a) => a.fini);
  return pretes;
}

if (typeof window !== "undefined") window.addEventListener(CARTE_EVENT, oublierLecture);

function indexDe(a: AireCarte): Promise<Index | null> {
  const cle = cleIndex(a.id, a.fichier);
  let p = index.get(cle);
  if (!p) {
    p = caches
      .open(CARTE_CACHE)
      .then((c) => c.match(cle))
      .then(async (r) => (r ? lireIndex(await r.arrayBuffer()) : null))
      .catch(() => null);
    index.set(cle, p);
  }
  return p;
}

function blobDe(cle: string): Promise<Blob | null> {
  let p = blobs.get(cle);
  if (!p) {
    p = caches
      .open(CARTE_CACHE)
      .then((c) => c.match(cle))
      .then((r) => (r ? r.blob() : null))
      .catch(() => null);
    blobs.set(cle, p);
  }
  return p;
}

/**
 * Tuile gardée sur le téléphone (décompressée), ou null. La zone d'abord,
 * puis le trajet, puis toute la Calédonie.
 */
export async function lireTuileLocale(z: number, x: number, y: number): Promise<Uint8Array | null> {
  const tileId = zxyVersTileId(z, x, y);
  for (const id of AIRES) {
    const a = airesPretes().find((x) => x.id === id);
    if (!a) continue;
    const idx = await indexDe(a);
    if (!idx) continue;
    const t = chercherTuile(idx, tileId);
    if (!t) continue;
    const [debut, longueur] = t;
    const m = chercherMorceau(idx, debut, longueur);
    if (m < 0) continue;
    const [debutMorceau] = morceauDe(idx, m);
    const blob = await blobDe(cleMorceau(a.id, a.fichier, debutMorceau));
    if (!blob) continue;
    const octets = new Uint8Array(await blob.slice(debut - debutMorceau, debut - debutMorceau + longueur).arrayBuffer());
    return decompresser(octets, a.compressionTuiles);
  }
  return null;
}
