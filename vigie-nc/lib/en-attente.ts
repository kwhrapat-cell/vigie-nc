// Signalements faits sans réseau (cyclone, réseau saturé, zone blanche) :
// gardés sur le téléphone, puis envoyés tout seuls dès que ça capte
// (components/EnvoiEnAttente.tsx).
//
// La base date un signalement à l'heure où elle le reçoit. Pour ne jamais
// publier comme « tout frais » un événement vu il y a longtemps :
//   - envoi automatique seulement dans les ENVOI_AUTO_MAX_MIN minutes ;
//   - ensuite, on demande à la personne si c'est encore d'actualité
//     (« Publier » = elle le confirme maintenant) ;
//   - effacé après GARDE_MAX_MIN minutes, ou plus tôt si le type vit moins
//     longtemps sur la carte (trafic dense : 1 h).
// La photo n'est pas gardée : l'info route compte plus que l'image.
// Rien de tout ça ne sort du téléphone avant l'envoi.

import type { ReportType, RiskLevel } from "./types";
import { REPORT_TYPE_LIFETIME_MIN } from "./types";

export const EN_ATTENTE_CLE = "vigie-nc:en-attente-v1";
/** Prévenu à chaque changement de la file (écrans et envoi). */
export const EN_ATTENTE_EVENT = "vigie-nc:en-attente";
/** Prévenu quand un signalement de la file est parti (detail = SignalementEnAttente). */
export const EN_ATTENTE_ENVOYE_EVENT = "vigie-nc:en-attente-envoye";

export const ENVOI_AUTO_MAX_MIN = 15;
export const GARDE_MAX_MIN = 120;
export const EN_ATTENTE_MAX = 5;
/** La base accepte un signalement par minute et par téléphone. */
export const ECART_ENVOIS_MS = 65_000;
/** Au-delà, on considère que le réseau ne répond pas (réseau saturé). */
export const DELAI_RESEAU_MS = 20_000;

export type TypeEnAttente = Exclude<ReportType, "sos">;

export interface SignalementEnAttente {
  /** Identifiant local (jamais envoyé). */
  id: string;
  type: TypeEnAttente;
  lat: number;
  lng: number;
  description: string | null;
  riskLevel: RiskLevel | null;
  place: string | null;
  /** Heure où la personne a voulu publier (horloge du téléphone, ms). */
  vuA: number;
  essais: number;
  /** Message lisible si la base l'a refusé (il ne repartira pas). */
  erreur: string | null;
}

export type EtatEnAttente = "envoi" | "a_confirmer" | "refuse" | "perime";

/** Durée de garde pour ce type, en ms. */
export function gardeMaxMs(type: TypeEnAttente): number {
  const vie = REPORT_TYPE_LIFETIME_MIN[type] ?? GARDE_MAX_MIN;
  return Math.min(GARDE_MAX_MIN, vie) * 60_000;
}

/** Âge en ms (0 si l'horloge du téléphone a reculé). */
export function ageMs(s: Pick<SignalementEnAttente, "vuA">, maintenant: number): number {
  return Math.max(0, maintenant - s.vuA);
}

export function etatEnAttente(
  s: Pick<SignalementEnAttente, "type" | "vuA" | "erreur">,
  maintenant: number,
): EtatEnAttente {
  const age = ageMs(s, maintenant);
  if (age > gardeMaxMs(s.type)) return "perime";
  if (s.erreur) return "refuse";
  if (age > ENVOI_AUTO_MAX_MIN * 60_000) return "a_confirmer";
  return "envoi";
}

/** File sans les signalements trop anciens. */
export function sansPerimes(list: SignalementEnAttente[], maintenant: number): SignalementEnAttente[] {
  return list.filter((s) => etatEnAttente(s, maintenant) !== "perime");
}

/** Le plus ancien signalement à envoyer tout seul, s'il y en a un. */
export function prochainAEnvoyer(list: SignalementEnAttente[], maintenant: number): SignalementEnAttente | null {
  const prets = list.filter((s) => etatEnAttente(s, maintenant) === "envoi").sort((a, b) => a.vuA - b.vuA);
  return prets[0] ?? null;
}

/** Ajoute à la file en gardant les EN_ATTENTE_MAX plus récents. */
export function avecNouveau(list: SignalementEnAttente[], s: SignalementEnAttente): SignalementEnAttente[] {
  return [...list, s].sort((a, b) => a.vuA - b.vuA).slice(-EN_ATTENTE_MAX);
}

// Messages d'erreur des navigateurs et de supabase-js quand le réseau ne
// répond pas (Chrome, Safari, Firefox, Node), ou délai dépassé.
const RESEAU = /failed to fetch|load failed|networkerror|network request failed|fetch failed|fetcherror|timed? ?out|aborted|err_internet|err_network|délai/i;

/**
 * Vrai si l'échec vient du réseau (pas de données, réseau saturé) et pas
 * d'un refus de la base (limite d'envoi, position hors Calédonie…).
 * Sans réseau, la session anonyme ne peut pas s'ouvrir : « connexion_requise »
 * compte comme une panne de réseau.
 */
export function estErreurReseau(err: unknown, enLigne = true): boolean {
  if (!enLigne) return true;
  if (!err) return false;
  if (typeof err === "object") {
    const o = err as { code?: unknown; detail?: unknown; message?: unknown; name?: unknown };
    if (o.code === "connexion_requise" || o.code === "delai") return true;
    if (o.name === "AbortError" || o.name === "TimeoutError") return true;
    for (const texte of [o.detail, o.message]) {
      if (typeof texte === "string" && RESEAU.test(texte)) return true;
    }
    return false;
  }
  return typeof err === "string" && RESEAU.test(err);
}

/** Erreur « délai dépassé » (réseau saturé). */
export class DelaiDepasse extends Error {
  code = "delai";
  constructor() {
    super("delai");
  }
}

/** La promesse, ou DelaiDepasse au bout de `ms`. */
export function avecDelai<T>(promesse: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const minuteur = setTimeout(() => reject(new DelaiDepasse()), ms);
    promesse.then(
      (v) => {
        clearTimeout(minuteur);
        resolve(v);
      },
      (e) => {
        clearTimeout(minuteur);
        reject(e);
      },
    );
  });
}

/** « 14:05 » (heure du téléphone). */
export function heureVu(s: Pick<SignalementEnAttente, "vuA">): string {
  return new Date(s.vuA).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/** Lecture prudente d'une file écrite par une ancienne version ou abîmée. */
export function fileValide(brut: unknown): SignalementEnAttente[] {
  if (!Array.isArray(brut)) return [];
  const out: SignalementEnAttente[] = [];
  for (const x of brut) {
    if (!x || typeof x !== "object") continue;
    const s = x as Partial<SignalementEnAttente>;
    // Valeur lue sur le téléphone : n'importe quel texte possible.
    const type: unknown = s.type;
    if (typeof s.id !== "string" || typeof type !== "string") continue;
    if (type === "sos" || !(type in REPORT_TYPE_LIFETIME_MIN)) continue;
    if (typeof s.lat !== "number" || typeof s.lng !== "number" || !Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
    if (typeof s.vuA !== "number" || !Number.isFinite(s.vuA)) continue;
    out.push({
      id: s.id,
      type: type as TypeEnAttente,
      lat: s.lat,
      lng: s.lng,
      description: typeof s.description === "string" ? s.description : null,
      riskLevel: s.riskLevel === "faible" || s.riskLevel === "moyen" || s.riskLevel === "eleve" ? s.riskLevel : null,
      place: typeof s.place === "string" ? s.place : null,
      vuA: s.vuA,
      essais: typeof s.essais === "number" ? s.essais : 0,
      erreur: typeof s.erreur === "string" ? s.erreur : null,
    });
  }
  return out;
}

// --- Stockage sur le téléphone ------------------------------------------

function ecrire(list: SignalementEnAttente[]): void {
  try {
    if (list.length === 0) window.localStorage.removeItem(EN_ATTENTE_CLE);
    else window.localStorage.setItem(EN_ATTENTE_CLE, JSON.stringify(list));
  } catch {
    // stockage plein ou indisponible : le signalement est perdu, tant pis
  }
  try {
    window.dispatchEvent(new Event(EN_ATTENTE_EVENT));
  } catch {
    // pas de fenêtre (serveur)
  }
}

/** File du téléphone, sans les signalements trop anciens. */
export function lireEnAttente(maintenant: number = Date.now()): SignalementEnAttente[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(EN_ATTENTE_CLE);
    if (!raw) return [];
    const toutes = fileValide(JSON.parse(raw));
    const gardees = sansPerimes(toutes, maintenant);
    if (gardees.length !== toutes.length) ecrire(gardees);
    return gardees;
  } catch {
    return [];
  }
}

function nouvelId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function ajouterEnAttente(
  s: Omit<SignalementEnAttente, "id" | "essais" | "erreur">,
): SignalementEnAttente {
  const nouveau: SignalementEnAttente = { ...s, id: nouvelId(), essais: 0, erreur: null };
  ecrire(avecNouveau(lireEnAttente(), nouveau));
  return nouveau;
}

export function retirerEnAttente(id: string): void {
  ecrire(lireEnAttente().filter((s) => s.id !== id));
}

export function majEnAttente(id: string, patch: Partial<Omit<SignalementEnAttente, "id">>): void {
  ecrire(lireEnAttente().map((s) => (s.id === id ? { ...s, ...patch } : s)));
}
