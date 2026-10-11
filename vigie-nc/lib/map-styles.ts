import type { MapStyle } from "./preferences";

// Fonds de carte gratuits, sans clé, utilisables avec Leaflet.
// Tout est regroupé ici pour pouvoir changer de fournisseur facilement.

export interface TileSpec {
  url: string;
  options: {
    attribution: string;
    subdomains?: string;
    maxZoom: number;
    maxNativeZoom?: number;
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

export const MAP_STYLES: Record<MapStyle, { label: string; hint: string; layers: TileSpec[] }> = {
  // Lisible de jour : routes, communes, rivières bien visibles.
  plan: {
    label: "Plan",
    hint: "Routes et communes bien lisibles",
    layers: [{ url: OSM_URL, options: { attribution: OSM_ATTRIBUTION, maxZoom: 19 } }],
  },
  // Même plan, assombri par un filtre (voir .leaflet-container[data-fond="nuit"]
  // dans globals.css) : moins éblouissant la nuit, en voiture.
  nuit: {
    label: "Nuit",
    hint: "Sombre, pour la conduite de nuit",
    layers: [{ url: OSM_URL, options: { attribution: OSM_ATTRIBUTION, maxZoom: 19 } }],
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
