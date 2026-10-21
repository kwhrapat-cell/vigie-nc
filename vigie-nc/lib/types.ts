// « Incivilité » et « Véhicule volé » volontairement absents : Vigie NC s'en
// tient à des informations d'infrastructure vérifiables (routes, météo).
export type ReportType =
  | "sos"
  | "accident"
  | "inondation"
  | "feu"
  | "route_coupee"
  | "danger"
  | "travaux"
  | "meteo"
  | "trafic_dense"
  | "chaussee_degradee"
  | "autre";

// Ordre d'affichage dans l'écran « Quel est le type de signalement ? »
export const SIGNALABLE_TYPES: Exclude<ReportType, "sos">[] = [
  "accident",
  "inondation",
  "feu",
  "route_coupee",
  "danger",
  "travaux",
  "meteo",
  "trafic_dense",
  "chaussee_degradee",
  "autre",
];

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  sos: "SOS — urgence",
  accident: "Accident",
  inondation: "Inondation",
  feu: "Feu ou fumée",
  route_coupee: "Route coupée",
  danger: "Danger",
  travaux: "Travaux",
  meteo: "Météo dangereuse",
  trafic_dense: "Trafic dense",
  chaussee_degradee: "Chaussée dégradée",
  autre: "Autre",
};

// Libellés courts pour les tuiles
export const REPORT_TYPE_SHORT: Record<ReportType, string> = {
  ...REPORT_TYPE_LABELS,
  sos: "SOS",
  meteo: "Météo",
  feu: "Feu",
};

// Durée de vie d'un signalement sans nouvelle confirmation (minutes).
// ⚠️ Doit rester alignée sur vigie_duree_vie() dans supabase/schema.sql.
export const REPORT_TYPE_LIFETIME_MIN: Record<ReportType, number> = {
  trafic_dense: 60,
  accident: 120,
  sos: 120,
  danger: 180,
  meteo: 180,
  autre: 180,
  route_coupee: 240,
  inondation: 240,
  feu: 240,
  travaux: 3 * 24 * 60,
  chaussee_degradee: 3 * 24 * 60,
};

// Rayon de regroupement des doublons (0 = jamais regroupé).
// ⚠️ Doit rester aligné sur vigie_rayon_fusion_m() dans supabase/schema.sql.
export const REPORT_TYPE_MERGE_RADIUS_M: Record<ReportType, number> = {
  accident: 300,
  danger: 300,
  travaux: 300,
  trafic_dense: 500,
  route_coupee: 800,
  inondation: 1000,
  // Un feu se voit (fumée) depuis plusieurs points de la route.
  feu: 1500,
  meteo: 2000,
  chaussee_degradee: 150,
  sos: 0,
  autre: 0,
};

// ---------------------------------------------------------------------
// Catégories affichées sur l'accueil : Dangers / Perturbations / Météo
// ---------------------------------------------------------------------
export type Category = "danger" | "perturbation" | "meteo";

export const REPORT_TYPE_CATEGORY: Record<ReportType, Category> = {
  sos: "danger",
  accident: "danger",
  route_coupee: "danger",
  danger: "danger",
  feu: "danger",
  travaux: "perturbation",
  trafic_dense: "perturbation",
  chaussee_degradee: "perturbation",
  autre: "perturbation",
  inondation: "meteo",
  meteo: "meteo",
};

export const CATEGORY_LABELS: Record<Category, { one: string; many: string }> = {
  danger: { one: "Danger", many: "Dangers" },
  perturbation: { one: "Perturbation", many: "Perturbations" },
  meteo: { one: "Info météo", many: "Infos météo" },
};

// Couleur des marqueurs de la carte, par catégorie
export const CATEGORY_HEX: Record<Category, string> = {
  danger: "#E5484D",
  perturbation: "#F0912E",
  meteo: "#3B82F6",
};

// Couleur des tuiles, par type (écran Signaler, listes)
export const REPORT_TYPE_HEX: Record<ReportType, string> = {
  sos: "#E5484D",
  accident: "#E2572B",
  inondation: "#2D7BE5",
  feu: "#C2410C",
  route_coupee: "#F0912E",
  danger: "#D93A3A",
  travaux: "#D9A11E",
  meteo: "#139E95",
  trafic_dense: "#7C5CE0",
  chaussee_degradee: "#9A6B3F",
  autre: "#3D5157",
};

// Icônes (traits SVG 24×24) — chaînes statiques, réutilisées par React et
// par les marqueurs Leaflet.
export const REPORT_TYPE_ICON: Record<ReportType, string> = {
  sos: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="M6 6l3.5 3.5M14.5 14.5L18 18M18 6l-3.5 3.5M9.5 14.5L6 18"/>',
  accident:
    '<path d="M5 11l1.5-4.3A2 2 0 0 1 8.4 5.3h7.2a2 2 0 0 1 1.9 1.4L19 11"/><rect x="3" y="11" width="18" height="6" rx="2"/><path d="M6 17v2M18 17v2"/><circle cx="7.5" cy="14" r="1"/><circle cx="16.5" cy="14" r="1"/>',
  inondation:
    '<path d="M7 11.5L12 7l5 4.5"/><path d="M3 15.5c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 4.5 0 3-1.2 4.5 0"/><path d="M3 19.5c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 4.5 0 3-1.2 4.5 0"/>',
  feu:
    '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.4-5.4 3.6-8.3.4 1.9 1.5 3 2.6 3.6C12 6.8 13.4 4.4 15.6 3c-.3 2.6.7 4.6 2 6.4 1 1.4 1.9 3 1.9 5.2C19.5 18.4 16.4 21 12 21z"/><path d="M12 21c-1.7 0-2.9-1.2-2.9-2.8 0-1.7 1.4-2.6 2-4.1.9 1.1 1.8 1.5 2.6 2.6.6.8.8 1.4.8 2 0 1.3-1.1 2.3-2.5 2.3z"/>',
  route_coupee:
    '<rect x="3" y="7.5" width="18" height="5.5" rx="1"/><path d="M7.5 7.5l-2.5 5.5M13 7.5l-2.5 5.5M18.5 7.5L16 13"/><path d="M6 13v6.5M18 13v6.5"/>',
  danger: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.3v.2"/>',
  travaux:
    '<path d="M10 4h4l4.5 15h-13z"/><path d="M8.2 10.5h7.6M6.9 15h10.2"/><path d="M3.5 19.5h17"/>',
  meteo:
    '<path d="M7 15a4 4 0 0 1-.4-7.98A5.5 5.5 0 0 1 17.2 8.1 3.5 3.5 0 0 1 17 15z"/><path d="M8.5 18l-1 2.2M12.5 18l-1 2.2M16.5 18l-1 2.2"/>',
  trafic_dense:
    '<rect x="2.5" y="10" width="11" height="5" rx="1.5"/><path d="M4.5 10l1-3h5l1 3"/><path d="M13.5 12h4l2.5 2.5V15h-6.5"/><circle cx="5.5" cy="16.6" r="1"/><circle cx="10.5" cy="16.6" r="1"/><circle cx="17.5" cy="16.6" r="1"/>',
  chaussee_degradee:
    '<path d="M5 20L9 4M19 20L15 4"/><path d="M12 5.5V8M12.4 11l-1.6 2.2 2 1.6-1.2 3"/>',
  autre:
    '<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>',
};

export type Vote = "present" | "termine";

// Dangers : ils déclenchent une alerte, et un seul « C'est terminé » ne
// suffit pas à les retirer de la carte (il en faut 2, et plus de
// « terminé » que de « toujours là »).
// ⚠️ Doit rester aligné sur vigie_est_danger() dans supabase/schema.sql.
export const ALERT_TYPES: ReportType[] = ["accident", "route_coupee", "inondation", "feu", "danger", "meteo"];

// On signale, confirme ou déclare terminé seulement ce qu'on voit autour de
// soi : à plus de 5 km, on n'est pas témoin. (L'auteur peut toujours clore
// son propre signalement, où qu'il soit.)
// ⚠️ Doit rester aligné sur vigie_distance_temoin_m() dans supabase/schema.sql.
export const MAX_WITNESS_DISTANCE_M = 5000;

// Bandeau « Travaux près de toi » à l'ouverture de l'appli : les travaux
// en cours dans ce rayon, quelle que soit la zone choisie sur la carte
// (on regarde un peu plus loin que la zone, pour le trajet qui commence).
export const TRAVAUX_BANDEAU_RAYON_M = 10_000;
// Revenir sur l'appli après au moins ce délai compte comme une nouvelle
// ouverture : le bandeau est recalculé et réapparaît s'il avait été fermé.
export const TRAVAUX_BANDEAU_REOUVERTURE_MS = 30 * 60_000;

// Signalement d'un contenu (photo ou texte) qui pose problème. Une info
// fausse ou finie se traite par le vote « C'est terminé », pas ici.
export type FlagReason = "donnee_personnelle" | "inapproprie" | "hors_sujet";

export const FLAG_REASON_LABELS: Record<FlagReason, string> = {
  donnee_personnelle: "Visage, plaque, nom ou numéro visible",
  inapproprie: "Insulte, accusation ou image choquante",
  hors_sujet: "Rien à voir avec la route",
};

// Nombre de téléphones différents qui signalent un contenu avant que la
// photo et le texte soient masqués automatiquement.
// ⚠️ Doit rester aligné sur vigie_seuil_masquage() dans supabase/schema.sql.
export const FLAG_HIDE_THRESHOLD = 2;

// Info relayée par quelqu'un qui l'a vue ailleurs (pas forcément sur place)
export type RelaySource = "facebook" | "radio" | "sms" | "autre";

export const RELAY_SOURCE_LABELS: Record<RelaySource, string> = {
  facebook: "Facebook",
  radio: "Radio / TV",
  sms: "SMS / WhatsApp",
  autre: "Autre",
};
export type RiskLevel = "faible" | "moyen" | "eleve";

export const RISK_LABELS: Record<RiskLevel, string> = {
  faible: "Faible",
  moyen: "Moyen",
  eleve: "Élevé",
};

export interface Report {
  id: string;
  type: ReportType;
  label: string;
  lat: number;
  lng: number;
  createdAt: string; // ISO
  expiresAt: string; // ISO — disparaît à cette heure sauf nouvelle confirmation
  confirmations: number; // votes « toujours là » (hors auteur)
  infirmations: number; // votes « c'est terminé »
  lastConfirmedAt?: string | null;
  distanceM?: number | null; // distance à l'utilisateur, si position connue
  isMine?: boolean; // signalé depuis ce téléphone
  myVote?: Vote | null; // vote déjà donné depuis ce téléphone
  photoUrl?: string | null;
  description?: string | null;
  riskLevel?: RiskLevel | null;
  place?: string | null; // « RT1, Dumbéa »
  officialSource?: string | null; // renseigné par l'équipe : niveau « Vérifié »
  relaySource?: RelaySource | null; // info relayée, pas vue sur place par l'auteur
  active?: boolean;
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string; // format international, ex: +687XXXXXX
}

// ---------------------------------------------------------------------
// Annonces générales : message vu par tout le monde, dans toute la
// Calédonie (bandeau en haut de la carte). Publiées depuis /moderation.
// ⚠️ Limites alignées sur moderation_annonce_publier() dans supabase/schema.sql.
// ---------------------------------------------------------------------
export type AnnonceNiveau = "info" | "vigilance" | "urgence";

export const ANNONCE_NIVEAUX: AnnonceNiveau[] = ["info", "vigilance", "urgence"];

export const ANNONCE_NIVEAU_LABELS: Record<AnnonceNiveau, string> = {
  info: "Info",
  vigilance: "Vigilance",
  urgence: "Urgence",
};

export const ANNONCE_TEXTE_MIN = 10;
export const ANNONCE_TEXTE_MAX = 280;
export const ANNONCE_SOURCE_MAX = 60;
export const ANNONCE_DUREES_H = [2, 6, 12, 24, 48] as const;
// Notifications à tous les abonnés : 3 annonces par 24 h au plus.
export const ANNONCE_NOTIF_MAX_24H = 3;

export interface Annonce {
  id: string;
  niveau: AnnonceNiveau;
  texte: string;
  source: string | null;
  createdAt: string; // ISO
  expiresAt: string; // ISO — disparaît toute seule à cette heure
}
