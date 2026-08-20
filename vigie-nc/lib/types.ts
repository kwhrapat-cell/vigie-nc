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

export interface Report {
  id: string;
  type: ReportType;
  label: string;
  lat: number;
  lng: number;
  createdAt: string; // ISO
  expiresAt: string; // ISO — signalement anonyme, expire sauf confirmation
  confirmations: number;
  // Un SOS n'est pas rattaché à une zone/axe suivi — zoneId/zoneName restent
  // vides dans ce cas (voir generateSosZoneLabel côté composant).
  zoneId?: string;
  zoneName?: string;
  photoUrl?: string | null;
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
