// Lecture d'un signalement CÔTÉ SERVEUR, pour l'aperçu d'un lien partagé
// (page /s/[id] et son image). C'est la seule lecture hors de
// lib/reports-api.ts, qui ne tourne que dans le navigateur. Elle utilise
// la même fonction publique que la carte (signalement_detail_v3, clé
// publique, sans session) et ne garde que ce qui se voit déjà sur la
// carte : type, lieu, heures, confirmations. Ni photo, ni texte saisi.

import { getReliability } from "./reliability";
import { NOM_APPLI, TERRITOIRE } from "./territoire";
import { RelaySource, ReportType, REPORT_TYPE_LABELS } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isReportId(id: string): boolean {
  return UUID.test(id);
}

export interface PublicReport {
  id: string;
  type: ReportType;
  label: string;
  lieu: string | null;
  createdAt: string;
  actif: boolean;
  confirmations: number;
  infirmations: number;
  sourceOfficielle: string | null;
  relaisSource: RelaySource | null;
}

interface DetailRow {
  id: string;
  type: ReportType;
  lieu: string | null;
  created_at: string;
  actif: boolean;
  confirmations: number;
  infirmations: number;
  source_officielle: string | null;
  relais_source: RelaySource | null;
}

/** Le signalement (même terminé), ou null s'il n'existe pas / n'est pas lisible. */
export async function fetchPublicReport(id: string): Promise<PublicReport | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !isReportId(id)) return null;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/signalement_detail_v3`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_id: id }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as DetailRow[];
    const r = Array.isArray(rows) ? rows[0] : null;
    if (!r || !(r.type in REPORT_TYPE_LABELS)) return null;
    return {
      id: r.id,
      type: r.type,
      label: REPORT_TYPE_LABELS[r.type],
      lieu: r.lieu,
      createdAt: r.created_at,
      actif: r.actif,
      confirmations: r.confirmations,
      infirmations: r.infirmations,
      sourceOfficielle: r.source_officielle,
      relaisSource: r.relais_source,
    };
  } catch {
    return null;
  }
}

/** « le 20 oct. à 17 h 45 » (heure du territoire : Nouméa en Calédonie) */
export function quandLocal(iso: string): string {
  const d = new Date(iso);
  const jour = d.toLocaleDateString("fr-FR", { timeZone: TERRITOIRE.fuseau, day: "numeric", month: "short" });
  const heure = d
    .toLocaleTimeString("fr-FR", { timeZone: TERRITOIRE.fuseau, hour: "2-digit", minute: "2-digit" })
    .replace(":", " h ");
  return `le ${jour} à ${heure}`;
}

/** Titre de l'aperçu : « Inondation · Radier de la Coulée, Mont-Dore » */
export function shareTitle(r: PublicReport): string {
  return r.lieu ? `${r.label} · ${r.lieu}` : r.label;
}

/** Niveau de fiabilité lisible, comme sur la fiche (« À confirmer », « Vérifié »…) */
export function shareReliability(r: PublicReport): string {
  return getReliability({
    confirmations: r.confirmations,
    infirmations: r.infirmations,
    officialSource: r.sourceOfficielle,
    relaySource: r.relaisSource,
  }).label;
}

/** Description de l'aperçu. Jamais de promesse que la route est sûre. */
export function shareDescription(r: PublicReport): string {
  const etat = r.actif ? shareReliability(r) : "Terminé";
  return `${etat} · signalé ${quandLocal(r.createdAt)}. Info citoyenne à vérifier sur place : voir la carte en direct sur ${NOM_APPLI}.`;
}
