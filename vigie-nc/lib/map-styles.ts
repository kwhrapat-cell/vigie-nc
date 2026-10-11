import type { MapStyle } from "./preferences";

// Fonds de carte gratuits, sans clé, utilisables avec Leaflet.

export interface TileSpec {
  url: string;
  options: {
    attribution: string;
    subdomains?: string;
    maxZoom: number;
    maxNativeZoom?: number;
  };
}

const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

export const MAP_STYLES: Record<MapStyle, { label: string; hint: string; layers: TileSpec[] }> = {
  // Lisible de jour : routes, communes, relief des côtes bien visibles.
  plan: {
    label: "Plan",
    hint: "Routes et communes bien lisibles",
    layers: [
      {
        url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        options: { attribution: CARTO_ATTRIBUTION, subdomains: "abcd", maxZoom: 19 },
      },
    ],
  },
  // Sombre : moins éblouissant la nuit, en voiture.
  nuit: {
    label: "Nuit",
    hint: "Sombre, pour la conduite de nuit",
    layers: [
      {
        url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        options: { attribution: CARTO_ATTRIBUTION, subdomains: "abcd", maxZoom: 19 },
      },
    ],
  },
  // Vue aérienne + noms des lieux : utile pour reconnaître un radier, une
  // rivière, une zone inondable.
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
        url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png",
        options: { attribution: CARTO_ATTRIBUTION, subdomains: "abcd", maxZoom: 19 },
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
