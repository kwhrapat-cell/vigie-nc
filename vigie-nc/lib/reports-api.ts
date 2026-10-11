"use client";

// Point d'accès unique aux signalements. Avec Supabase configuré, tout
// passe par les fonctions SQL (RPC) de supabase/schema.sql ; sinon, par le
// mode démo en mémoire (lib/demo-store.ts).

import { supabase } from "./supabase";
import { getDeviceId } from "./device-id";
import { demoCreate, demoNearby, demoVote } from "./demo-store";
import { LatLng } from "./geo";
import { Report, ReportType, REPORT_TYPE_LABELS, Vote } from "./types";

export type CreateResult = "cree" | "fusionne" | "deja_signale";
export type VoteResult = "confirme" | "en_baisse" | "resolu" | "deja_vote";

export interface VoteOutcome {
  resultat: VoteResult;
  confirmations: number;
  infirmations: number;
  expiresAt: string;
  resolu: boolean;
}

const ERROR_MESSAGES: Record<string, string> = {
  rate_limit:
    "Un signalement vient d'être envoyé depuis ce téléphone — patiente une minute avant le suivant.",
  position_hors_nc:
    "Ta position semble hors de Nouvelle-Calédonie : le signalement n'a pas été envoyé.",
  propre_signalement:
    "C'est ton propre signalement : tu peux seulement le déclarer terminé.",
  signalement_termine: "Ce signalement est déjà terminé ou a expiré.",
  signalement_introuvable: "Ce signalement n'existe plus.",
  photo_invalide: "La photo n'a pas pu être rattachée au signalement.",
  appareil_invalide: "Identifiant du téléphone invalide — recharge la page.",
  vote_invalide: "Vote non reconnu.",
};

export class ReportsApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

function codeFromMessage(message: string | undefined): string {
  if (!message) return "inconnu";
  const known = Object.keys(ERROR_MESSAGES).find((k) => message.includes(k));
  return known ?? "inconnu";
}

/** Message lisible pour l'utilisateur à partir de n'importe quelle erreur. */
export function errorMessage(err: unknown, fallback: string): string {
  const code =
    err && typeof err === "object" && "code" in err && typeof err.code === "string"
      ? err.code
      : err instanceof Error
        ? codeFromMessage(err.message)
        : "inconnu";
  return ERROR_MESSAGES[code] ?? fallback;
}

// Ligne renvoyée par la fonction SQL signalements_proches()
interface NearbyRow {
  id: string;
  type: ReportType;
  lat: number;
  lng: number;
  photo_url: string | null;
  confirmations: number;
  infirmations: number;
  created_at: string;
  expires_at: string;
  last_confirmed_at: string | null;
  distance_m: number | null;
  est_auteur: boolean;
  mon_vote: Vote | null;
}

function mapRow(row: NearbyRow): Report {
  return {
    id: row.id,
    type: row.type,
    label: REPORT_TYPE_LABELS[row.type],
    lat: row.lat,
    lng: row.lng,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    confirmations: row.confirmations,
    infirmations: row.infirmations,
    lastConfirmedAt: row.last_confirmed_at,
    distanceM: row.distance_m,
    isMine: row.est_auteur,
    myVote: row.mon_vote,
    photoUrl: row.photo_url,
  };
}

/** Signalements actifs dans le rayon (ou partout si `center` est nul). */
export async function fetchNearby(center: LatLng | null, radiusM: number): Promise<Report[]> {
  const deviceId = getDeviceId();
  if (!supabase) return demoNearby(center, radiusM, deviceId);

  const { data, error } = await supabase.rpc("signalements_proches", {
    p_lat: center?.lat ?? null,
    p_lng: center?.lng ?? null,
    p_rayon_m: Math.round(radiusM),
    p_device_id: deviceId,
  });
  if (error) throw new ReportsApiError(codeFromMessage(error.message));
  return ((data ?? []) as NearbyRow[]).map(mapRow);
}

/**
 * Crée un signalement. Si le même événement est déjà signalé à proximité,
 * le serveur le compte comme une confirmation (« fusionne »).
 */
export async function createReport(input: {
  type: ReportType;
  lat: number;
  lng: number;
  photoUrl?: string | null;
}): Promise<{ id: string; resultat: CreateResult }> {
  const deviceId = getDeviceId();
  const photoUrl = input.photoUrl ?? null;

  if (!supabase) {
    try {
      const r = demoCreate({ ...input, photoUrl, deviceId });
      return { id: r.id, resultat: r.resultat as CreateResult };
    } catch (e) {
      throw new ReportsApiError(e instanceof Error ? e.message : "inconnu");
    }
  }

  const { data, error } = await supabase.rpc("creer_signalement", {
    p_type: input.type,
    p_lat: input.lat,
    p_lng: input.lng,
    p_device_id: deviceId,
    p_photo_url: photoUrl,
  });
  if (error) throw new ReportsApiError(codeFromMessage(error.message));
  const result = data as { id: string; resultat: CreateResult };
  return { id: result.id, resultat: result.resultat };
}

/** « Toujours là » (present) ou « C'est terminé » (termine). */
export async function voteOnReport(reportId: string, vote: Vote): Promise<VoteOutcome> {
  const deviceId = getDeviceId();

  let raw: {
    resultat: VoteResult;
    confirmations: number;
    infirmations: number;
    expires_at: string;
    resolu: boolean;
  };

  if (!supabase) {
    try {
      raw = demoVote(reportId, deviceId, vote) as typeof raw;
    } catch (e) {
      throw new ReportsApiError(e instanceof Error ? e.message : "inconnu");
    }
  } else {
    const { data, error } = await supabase.rpc("voter_signalement", {
      p_report_id: reportId,
      p_device_id: deviceId,
      p_vote: vote,
    });
    if (error) throw new ReportsApiError(codeFromMessage(error.message));
    raw = data as typeof raw;
  }

  return {
    resultat: raw.resultat,
    confirmations: raw.confirmations,
    infirmations: raw.infirmations,
    expiresAt: raw.expires_at,
    resolu: raw.resolu,
  };
}

/**
 * Envoie une photo déjà préparée (visages floutés, métadonnées retirées —
 * voir lib/face-blur.ts) et renvoie son adresse publique. En mode démo, la
 * photo reste locale au téléphone.
 */
export async function uploadReportPhoto(file: File): Promise<string> {
  if (!supabase) return URL.createObjectURL(file);

  const path = `${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from("report-photos").upload(path, file, {
    upsert: false,
    contentType: "image/jpeg",
    cacheControl: "86400",
  });
  if (error) throw new ReportsApiError("photo_invalide");
  return supabase.storage.from("report-photos").getPublicUrl(path).data.publicUrl;
}
