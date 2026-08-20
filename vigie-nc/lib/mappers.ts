import { Report, ReportType, REPORT_TYPE_LABELS } from "./types";

// Forme brute d'une ligne de la table `reports` (voir supabase/schema.sql).
export interface ReportRow {
  id: string;
  type: ReportType;
  lat: number;
  lng: number;
  created_at: string;
  expires_at: string;
  confirmations: number;
  zone_id: string | null;
  photo_url: string | null;
}

export function mapDbReportToReport(row: ReportRow): Report {
  return {
    id: row.id,
    type: row.type,
    label: REPORT_TYPE_LABELS[row.type],
    lat: row.lat,
    lng: row.lng,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    confirmations: row.confirmations,
    zoneId: row.zone_id ?? undefined,
    zoneName: undefined, // nécessite une jointure sur `zones`, hors périmètre Sprint 1
    photoUrl: row.photo_url,
  };
}
