"use client";

// Fond de carte Vigie en ligne : lit une tuile de la carte de la Calédonie
// (fichier PMTiles de la pré-version « carte-nc ») par blocs de 32 Ko
// (lib/carte-blocs.ts), à travers vigie-nc.com (/api/carte). Le téléphone
// ne parle à aucun autre serveur de cartes.

import { adresseBloc, assembler, BLOC_OCTETS, blocsCouvrant } from "./carte-blocs";
import { lireFiche } from "./carte-hors-ligne";
import type { Fiche } from "./carte-hors-ligne";
import { demoActive } from "./demo";
import { chercherEntree, decompresser, lireEnTete, lireRepertoire, PMTILES_RACINE_OCTETS, zxyVersTileId } from "./pmtiles";
import type { EnTete, Entree } from "./pmtiles";

/** Dernière fiche connue : la carte s'affiche sans réseau avec les blocs déjà gardés. */
const FICHE_CLE = "vigie-nc:carte-fiche";
/** Après un échec, nouvel essai au plus toutes les 20 s (pas une rafale par tuile). */
const REESSAI_MS = 20_000;
/** Blocs gardés en mémoire (≈ 3 Mo). */
const MEMOIRE_BLOCS = 96;

function ficheGardee(): Fiche | null {
  try {
    const f = JSON.parse(window.localStorage.getItem(FICHE_CLE) ?? "null") as Fiche | null;
    return f && typeof f.fichier === "string" && /^nc-\d{8}\.pmtiles$/.test(f.fichier) && typeof f.octets === "number"
      ? f
      : null;
  } catch {
    return null;
  }
}

function garderFiche(f: Fiche): void {
  if (demoActive()) return;
  try {
    window.localStorage.setItem(FICHE_CLE, JSON.stringify(f));
  } catch {
    // stockage plein : la fiche sera relue au prochain démarrage
  }
}

let fiche: Promise<Fiche> | null = null;
let ficheEchecA = 0;
let lecteur: { fichier: string; p: Promise<Lecteur> } | null = null;

function ficheCarte(): Promise<Fiche> {
  if (fiche && !(ficheEchecA && Date.now() - ficheEchecA >= REESSAI_MS)) return fiche;
  ficheEchecA = 0;
  fiche = lireFiche().then(
    (f) => {
      garderFiche(f);
      return f;
    },
    (e) => {
      // Sans réseau : la dernière fiche connue (blocs déjà gardés).
      const g = ficheGardee();
      if (g) return g;
      ficheEchecA = Date.now();
      throw e;
    },
  );
  return fiche;
}

const blocs = new Map<string, Promise<Uint8Array>>();

function lireBloc(f: Fiche, n: number): Promise<Uint8Array> {
  const cle = `${f.fichier}:${n}`;
  let p = blocs.get(cle);
  if (p) {
    blocs.delete(cle);
    blocs.set(cle, p);
    return p;
  }
  p = fetch(adresseBloc(f.fichier, n, f.octets)).then(async (r) => {
    if (r.status === 404) {
      // Version retirée (fiche gardée trop vieille) : relire la fiche.
      fiche = null;
      lecteur = null;
    }
    if (!r.ok) throw new Error("carte_indisponible");
    return new Uint8Array(await r.arrayBuffer());
  });
  p.catch(() => blocs.delete(cle));
  blocs.set(cle, p);
  if (blocs.size > MEMOIRE_BLOCS) blocs.delete(blocs.keys().next().value as string);
  return p;
}

async function lireOctets(f: Fiche, debut: number, longueur: number): Promise<Uint8Array> {
  const numeros = blocsCouvrant(debut, longueur);
  const lus = await Promise.all(numeros.map((n) => lireBloc(f, n)));
  return assembler(new Map(numeros.map((n, i) => [n, lus[i]] as [number, Uint8Array])), debut, longueur, BLOC_OCTETS);
}

interface Lecteur {
  fiche: Fiche;
  entete: EnTete;
  racine: Entree[];
  feuilles: Map<number, Promise<Entree[]>>;
}

async function ouvrir(f: Fiche): Promise<Lecteur> {
  const debut = await lireOctets(f, 0, Math.min(PMTILES_RACINE_OCTETS, f.octets));
  const entete = lireEnTete(debut);
  const racine = lireRepertoire(
    await decompresser(debut.subarray(entete.racineDebut, entete.racineDebut + entete.racineLongueur), entete.compressionInterne),
  );
  return { fiche: f, entete, racine, feuilles: new Map() };
}

async function lecteurCarte(): Promise<Lecteur> {
  const f = await ficheCarte();
  if (!lecteur || lecteur.fichier !== f.fichier) {
    const p = ouvrir(f);
    const courant = { fichier: f.fichier, p };
    p.catch(() => {
      if (lecteur === courant) lecteur = null;
    });
    lecteur = courant;
  }
  return lecteur.p;
}

function feuille(l: Lecteur, e: Entree): Promise<Entree[]> {
  let p = l.feuilles.get(e.debut);
  if (!p) {
    p = lireOctets(l.fiche, l.entete.feuillesDebut + e.debut, e.longueur).then(async (o) =>
      lireRepertoire(await decompresser(o, l.entete.compressionInterne)),
    );
    p.catch(() => l.feuilles.delete(e.debut));
    l.feuilles.set(e.debut, p);
  }
  return p;
}

/**
 * Tuile de la carte en ligne, décompressée. null = la carte n'a rien à cet
 * endroit (la mer au large) ; une panne de réseau rejette la promesse.
 */
export async function lireTuileEnLigne(z: number, x: number, y: number): Promise<Uint8Array | null> {
  const l = await lecteurCarte();
  if (z < l.entete.zoomMin || z > l.entete.zoomMax) return null;
  const tileId = zxyVersTileId(z, x, y);
  let e = chercherEntree(l.racine, tileId);
  for (let profondeur = 0; e && e.longueurSerie === 0 && profondeur < 4; profondeur++) {
    e = chercherEntree(await feuille(l, e), tileId);
  }
  if (!e || e.longueurSerie === 0) return null;
  const octets = await lireOctets(l.fiche, l.entete.tuilesDebut + e.debut, e.longueur);
  return decompresser(octets, l.entete.compressionTuiles);
}
