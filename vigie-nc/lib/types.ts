export type ReportType =
  | "sos"
  | "trafic_dense"
  | "accident"
  | "route_coupee"
  | "inondation"
  | "chaussee_degradee"
  | "autre";

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  sos: "SOS — urgence",
  trafic_dense: "Trafic dense",
  accident: "Accident",
  route_coupee: "Route coupée",
  inondation: "Inondation",
  chaussee_degradee: "Chaussée dégradée",
  autre: "Autre",
};

// Durée de vie d'un signalement sans nouvelle confirmation.
// ⚠️ Doit rester alignée sur vigie_duree_vie() dans supabase/schema.sql.
export const REPORT_TYPE_LIFETIME_MIN: Record<ReportType, number> = {
  trafic_dense: 60,
  accident: 120,
  sos: 120,
  route_coupee: 240,
  inondation: 240,
  chaussee_degradee: 3 * 24 * 60,
  autre: 180,
};

// Rayon de regroupement des doublons (0 = jamais regroupé).
// ⚠️ Doit rester aligné sur vigie_rayon_fusion_m() dans supabase/schema.sql.
export const REPORT_TYPE_MERGE_RADIUS_M: Record<ReportType, number> = {
  accident: 300,
  trafic_dense: 500,
  route_coupee: 800,
  inondation: 1000,
  chaussee_degradee: 150,
  sos: 0,
  autre: 0,
};

// Sévérité -> couleur de la maquette (rust = danger, ochre = ralentissement, lagoon = météo/eau)
export type Severity = "rust" | "ochre" | "lagoon";

export const REPORT_TYPE_SEVERITY: Record<ReportType, Severity> = {
  sos: "rust",
  route_coupee: "rust",
  accident: "rust",
  trafic_dense: "ochre",
  chaussee_degradee: "ochre",
  inondation: "lagoon",
  autre: "ochre",
};

export const SEVERITY_HEX: Record<Severity, string> = {
  rust: "#E8622F",
  ochre: "#E8A33D",
  lagoon: "#22B8B0",
};

export type Vote = "present" | "termine";

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
  // Un SOS n'est pas rattaché à une zone/axe suivi — zoneId/zoneName
  // restent vides dans ce cas.
  zoneId?: string;
  zoneName?: string;
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string; // format international, ex: +687XXXXXX
}

export interface ZoneHistory {
  zoneId: string;
  zoneName: string;
  riskLabel: string;
  incidentsThisYear: number;
  monthlyCounts: number[]; // 12 valeurs, Jan -> Déc
  timeline: {
    id: string;
    text: string;
    severity: Severity;
    relativeTime: string;
    confirmations: number;
  }[];
}
