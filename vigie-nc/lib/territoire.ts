// Fiche du territoire servi par cette copie de Vigie.
//
// Une copie = un site (Vercel) + une base (Supabase), avec ses propres
// modérateurs et partenaires. Le même code sert tous les territoires :
// tout ce qui change d'un territoire à l'autre est ici (nom de l'appli,
// fuseau horaire, carte, recherche des lieux, météo officielle, numéros
// d'urgence…), et pas ailleurs dans l'appli.
//
// Choix du territoire : variable NEXT_PUBLIC_TERRITOIRE de Vercel. Sans
// variable, c'est « nc » : la Nouvelle-Calédonie, à l'identique d'avant
// cette fiche (valeurs vérifiées par tests/territoire.test.ts).
//
// ⚠️ La base a ses propres réglages (table vigie_config, clés « fuseau » et
// « emprise ») : pour un nouveau territoire, les aligner sur cette fiche.
// Le pas-à-pas pour lancer un territoire est dans TERRITOIRES.md.
//
// Restent propres à la Calédonie, à reprendre pour un autre territoire :
// pages légales, affiche, cagou, lecture des messages relayés (noms de
// routes), appli Android de test (voir TERRITOIRES.md).

import type { LatLng } from "./geo";

export interface Territoire {
  /** Code court, valeur de NEXT_PUBLIC_TERRITOIRE. */
  code: string;
  /** Nom de l'appli : titre, partage, notifications, voix. */
  nomAppli: string;
  /** Sigle du logo, après « VIGIE » (« NC »). */
  sigle: string;
  /** Adresse publique du site (liens partagés, QR codes). */
  siteUrl: string;

  /**
   * Façons de nommer le territoire dans les phrases : le français n'a pas
   * de règle unique (« en Nouvelle-Calédonie », « à La Réunion »…), d'où
   * une phrase toute faite par usage. En minuscules : `majuscule()` pour
   * un début de phrase.
   */
  phrases: {
    /** « Nouvelle-Calédonie » */
    nom: string;
    /** « en Nouvelle-Calédonie » */
    enNom: string;
    /** « hors de Nouvelle-Calédonie » */
    horsDuNom: string;
    /** « toute la Nouvelle-Calédonie » */
    toutLeNom: string;
    /** « toute la Calédonie » : vue de la carte, annonces générales */
    toutLeTerritoire: string;
    /** « toute la NC » : mention courte (bandeau des annonces) */
    toutLeSigle: string;
    /** « en Calédonie » */
    enCourt: string;
    /** « Calédoniens » : « signalés par les Calédoniens » */
    habitants: string;
  };

  /** Fuseau horaire (IANA) : jour des chantiers, heures des annonces et des partages. */
  fuseau: string;
  /** Vue par défaut quand la position est inconnue. */
  centre: LatLng;
  /**
   * Cadre de la carte « tout le territoire » : [[sud, ouest], [nord, est]].
   * Sert aussi à limiter la recherche d'un lieu par son nom.
   */
  emprise: [[number, number], [number, number]];
  /** Code pays pour la recherche d'un lieu (Nominatim, ISO 3166-1). */
  codePays: string;

  /** Vigilance météo officielle intégrable, ou null s'il n'y en a pas. */
  meteo: {
    /** « Météo-France Nouvelle-Calédonie » */
    service: string;
    /** « Météo-France » : mention courte de la source */
    source: string;
    /** « meteo.nc » : nom du site dans les phrases */
    site: string;
    /** Vignette à intégrer (302 × 122) */
    vignette: string;
    /** Page de la vigilance, détail et conseils */
    page: string;
  } | null;

  /** Numéros d'urgence. */
  urgences: { samu: string; police: string; pompiers: string };
  /** Exemple de numéro (contacts d'urgence du SOS). */
  exempleTelephone: string;
}

const NOUVELLE_CALEDONIE: Territoire = {
  code: "nc",
  nomAppli: "Vigie NC",
  sigle: "NC",
  siteUrl: "https://vigie-nc.com",
  phrases: {
    nom: "Nouvelle-Calédonie",
    enNom: "en Nouvelle-Calédonie",
    horsDuNom: "hors de Nouvelle-Calédonie",
    toutLeNom: "toute la Nouvelle-Calédonie",
    toutLeTerritoire: "toute la Calédonie",
    toutLeSigle: "toute la NC",
    enCourt: "en Calédonie",
    habitants: "Calédoniens",
  },
  fuseau: "Pacific/Noumea",
  // Centre du Grand Nouméa
  centre: { lat: -22.24, lng: 166.47 },
  // Grande Terre, Belep, îles Loyauté, île des Pins
  emprise: [
    [-22.8, 163.5],
    [-19.5, 168.2],
  ],
  codePays: "nc",
  meteo: {
    service: "Météo-France Nouvelle-Calédonie",
    source: "Météo-France",
    site: "meteo.nc",
    vignette: "https://meteo.nc/fr/widget-vigilance/vigilance",
    page: "https://meteo.nc/fr/vigilance",
  },
  urgences: { samu: "15", police: "17", pompiers: "18" },
  exempleTelephone: "+687 XX.XX.XX",
};

/** Tous les territoires connus, par code. */
export const TERRITOIRES: Record<string, Territoire> = {
  nc: NOUVELLE_CALEDONIE,
};

/** Fiche correspondant à un code ; sans code, la Calédonie. Code inconnu : erreur (la construction s'arrête). */
export function territoireDepuisCode(code: string | undefined): Territoire {
  const c = (code ?? "").trim().toLowerCase() || "nc";
  const t = TERRITOIRES[c];
  if (!t) {
    throw new Error(
      `Territoire « ${code} » inconnu (NEXT_PUBLIC_TERRITOIRE). Connus : ${Object.keys(TERRITOIRES).join(", ")}.`,
    );
  }
  return t;
}

/** Le territoire de cette copie de l'appli. */
export const TERRITOIRE: Territoire = territoireDepuisCode(process.env.NEXT_PUBLIC_TERRITOIRE);

/** Raccourcis */
export const NOM_APPLI = TERRITOIRE.nomAppli;
export const PHRASES = TERRITOIRE.phrases;
export const URGENCES = TERRITOIRE.urgences;

/** « toute la Calédonie » → « Toute la Calédonie » */
export function majuscule(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Premier mot en capitales : « toute la Calédonie » → « TOUTE la Calédonie ». */
export function premierMotAppuye(s: string): string {
  return s.replace(/^\S+/, (mot) => mot.toUpperCase());
}

/** Cadre de recherche Nominatim (viewbox) : ouest,nord,est,sud. */
export function cadreRecherche(t: Territoire = TERRITOIRE): string {
  const [[sud, ouest], [nord, est]] = t.emprise;
  return `${ouest},${nord},${est},${sud}`;
}
