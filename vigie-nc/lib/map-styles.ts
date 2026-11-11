import type { NomPalette } from "./carte-dessin";
import type { MapStyle } from "./preferences";

// Fonds de carte. Par défaut, le fond « Vigie » (revue de design du
// 11/11/2026) : dessiné sur le téléphone à partir de la carte vectorielle
// de la Calédonie servie par vigie-nc.com (lib/carte-en-ligne.ts,
// lib/couche-hors-ligne.ts). Les autres sont des images gratuites, sans
// clé, d'autres serveurs. Tout est regroupé ici pour pouvoir changer de
// fournisseur facilement ; la pose sur une carte : lib/fond-carte.ts.

export interface TileSpec {
  url: string;
  options: {
    attribution: string;
    subdomains?: string;
    maxZoom: number;
    maxNativeZoom?: number;
    // Tuiles demandées en CORS : le service worker peut en garder une copie
    // lisible pour l'affichage sans réseau (public/sw.js).
    crossOrigin?: "anonymous";
    className?: string;
  };
}

// ⚠️ Depuis 2026, les fonds CARTO (basemaps.cartocdn.com) affichent « KEY
// REQUIRED » sans clé payante : ne plus les utiliser.
//
// OpenStreetMap : gratuit, sans clé, à condition d'afficher l'attribution et
// de ne pas télécharger de tuiles en masse (règles :
// https://operations.osmfoundation.org/policies/tiles/). Suffisant pour le
// pilote ; si l'appli grandit beaucoup, passer à un fournisseur avec clé
// (MapTiler, Stadia…) en changeant seulement ce fichier.
const OSM_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">contributeurs OpenStreetMap</a>';

// Clé MapTiler facultative (compte gratuit sur maptiler.com, variable
// Vercel NEXT_PUBLIC_MAPTILER_KEY) : si elle est renseignée, le plan passe
// par MapTiler, prévu pour les applis (OpenStreetMap interdit l'usage
// intensif de ses propres serveurs).
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";

const OSM_LAYER: TileSpec = {
  url: OSM_URL,
  options: { attribution: OSM_ATTRIBUTION, maxZoom: 19, crossOrigin: "anonymous" },
};

const MAPTILER_LAYER: TileSpec = {
  url: `https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`,
  options: {
    attribution: `&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> ${OSM_ATTRIBUTION}`,
    maxZoom: 19,
    crossOrigin: "anonymous",
  },
};

const ESRI_STREETS_LAYER: TileSpec = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
  options: { attribution: "Plan &copy; Esri", maxZoom: 19, maxNativeZoom: 18 },
};

const PLAN_LAYER = MAPTILER_KEY ? MAPTILER_LAYER : OSM_LAYER;

/**
 * Plan de secours : si les tuiles du plan n'arrivent plus (serveur bloqué
 * ou saturé, par exemple un jour de cyclone), la carte bascule dessus
 * toute seule (components/LiveMap.tsx).
 */
export const BACKUP_PLAN_LAYER: TileSpec = MAPTILER_KEY ? OSM_LAYER : ESRI_STREETS_LAYER;

/**
 * Secours du fond Vigie si la carte vectorielle n'arrive pas (serveur en
 * panne) : le plan habituel, assombri pour « Vigie » (classe fond-secours,
 * globals.css).
 */
export const SECOURS_VIGIE: TileSpec = {
  url: PLAN_LAYER.url,
  options: { ...PLAN_LAYER.options, className: "fond-secours" },
};

export interface DefinitionFond {
  label: string;
  hint: string;
  /** Images posées l'une sur l'autre (fonds d'autres serveurs). */
  layers: TileSpec[];
  /** Fond dessiné sur le téléphone, avec cette palette. */
  vecteur?: NomPalette;
}

export const MAP_STYLES: Record<MapStyle, DefinitionFond> = {
  // Sombre comme l'appli, sobre : les routes en clair, les rivières, le
  // lagon et les numéros des grandes routes. Les dangers ressortent
  // (aucune route en rouge ni en orange).
  vigie: {
    label: "Vigie",
    hint: "Sombre et sobre : routes, rivières, lagon",
    layers: [],
    vecteur: "vigie",
  },
  // La même en clair, pour le plein soleil.
  "vigie-clair": {
    label: "Vigie clair",
    hint: "La même en clair, pour le plein soleil",
    layers: [],
    vecteur: "vigie-clair",
  },
  // Le plan OpenStreetMap habituel, très détaillé.
  plan: {
    label: "OpenStreetMap",
    hint: "Le plan détaillé : commerces, chemins…",
    layers: [PLAN_LAYER],
  },
  // Vue aérienne + noms des lieux (Esri) : utile pour reconnaître un radier,
  // une rivière, une zone inondable.
  satellite: {
    label: "Satellite",
    hint: "Vue aérienne avec les noms",
    layers: [
      {
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        options: {
          attribution: "Imagerie &copy; Esri, Maxar, Earthstar Geographics",
          maxZoom: 19,
          maxNativeZoom: 18,
        },
      },
      {
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        options: { attribution: "Noms &copy; Esri", maxZoom: 19, maxNativeZoom: 18 },
      },
    ],
  },
};

// Emprise de la Nouvelle-Calédonie : Grande Terre, Belep, îles Loyauté,
// île des Pins.
export const NC_BOUNDS: [[number, number], [number, number]] = [
  [-22.8, 163.5],
  [-19.5, 168.2],
];
