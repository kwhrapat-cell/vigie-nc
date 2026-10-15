"use client";

// Point d'accès unique aux signalements. Avec Supabase configuré, tout
// passe par les fonctions SQL (RPC) de supabase/schema.sql ; sinon, par le
// mode démo en mémoire (lib/demo-store.ts).

import { supabase } from "./supabase";
import { getDeviceId } from "./device-id";
import { demoCreate, demoDetail, demoFlag, demoNearby, demoRelay, demoStats, demoVote } from "./demo-store";
import { LatLng } from "./geo";
import { FlagReason, RelaySource, Report, ReportType, REPORT_TYPE_LABELS, RiskLevel, Vote } from "./types";

export type CreateResult = "cree" | "fusionne" | "deja_signale";
export type RelayResult = "relaye" | "existe_deja";
export type VoteResult = "confirme" | "en_baisse" | "resolu" | "deja_vote";
export type FlagResult = "enregistre" | "deja_signale" | "masque";

export interface VoteOutcome {
  resultat: VoteResult;
  confirmations: number;
  infirmations: number;
  expiresAt: string;
  resolu: boolean;
}

export interface ZoneStats {
  total: number;
  actifs: number;
  parType: Partial<Record<ReportType, number>>;
  parMois: { mois: string; total: number; inondations: number }[];
  recents: {
    id: string;
    type: ReportType;
    lieu: string | null;
    createdAt: string;
    confirmations: number;
    actif: boolean;
  }[];
}

const ERROR_MESSAGES: Record<string, string> = {
  rate_limit:
    "Un signalement vient d'être envoyé depuis ce téléphone — patiente une minute avant le suivant.",
  position_hors_nc:
    "Cette position semble hors de Nouvelle-Calédonie : le signalement n'a pas été envoyé.",
  propre_signalement:
    "C'est ton propre signalement : tu peux seulement le déclarer terminé.",
  signalement_termine: "Ce signalement est déjà terminé ou a expiré.",
  signalement_introuvable: "Ce signalement n'existe plus.",
  photo_invalide: "La photo n'a pas pu être rattachée au signalement.",
  description_trop_longue: "La description est trop longue (200 caractères maximum).",
  niveau_invalide: "Niveau de risque non reconnu.",
  type_invalide: "Ce type d'événement ne peut pas être relayé.",
  source_invalide: "Indique où tu as vu l'info.",
  appareil_invalide: "Identifiant du téléphone invalide — recharge la page.",
  vote_invalide: "Vote non reconnu.",
  motif_invalide: "Choisis ce qui pose problème.",
  code_invalide: "Code de modération incorrect.",
  source_manquante: "Indique la source (ex. Mairie du Mont-Dore).",
  action_invalide: "Action non reconnue.",
  mode_demo: "Cette fonction n'est disponible qu'avec la base en direct.",
  abonnement_invalide: "Ce téléphone n'a pas pu être inscrit aux alertes. Réessaie.",
  rayon_invalide: "Choisis une distance : 3, 5 ou 10 km.",
  permission_refusee:
    "Notifications refusées : autorise-les pour ce site dans les réglages du navigateur, puis réessaie.",
  trop_de_signalements:
    "Beaucoup de contenus signalés depuis ce téléphone : réessaie dans une heure ou écris-nous.",
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

// Ligne renvoyée par signalements_proches() et signalement_detail()
export interface ReportRow {
  id: string;
  type: ReportType;
  lat: number;
  lng: number;
  photo_url: string | null;
  description: string | null;
  niveau_risque: RiskLevel | null;
  lieu: string | null;
  source_officielle: string | null;
  relais_source?: RelaySource | null;
  confirmations: number;
  infirmations: number;
  created_at: string;
  expires_at: string;
  last_confirmed_at: string | null;
  distance_m: number | null;
  est_auteur: boolean;
  mon_vote: Vote | null;
  actif: boolean;
}

export function mapRow(row: ReportRow): Report {
  return {
    id: row.id,
    type: row.type,
    label: REPORT_TYPE_LABELS[row.type] ?? "Signalement",
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
    description: row.description,
    riskLevel: row.niveau_risque,
    place: row.lieu,
    officialSource: row.source_officielle,
    relaySource: row.relais_source ?? null,
    active: row.actif,
  };
}

/** Signalements actifs dans le rayon (ou partout si `center` est nul). */
export async function fetchNearby(center: LatLng | null, radiusM: number): Promise<Report[]> {
  const deviceId = getDeviceId();
  if (!supabase) return demoNearby(center, radiusM, deviceId).map(mapRow);

  const { data, error } = await supabase.rpc("signalements_proches_v2", {
    p_lat: center?.lat ?? null,
    p_lng: center?.lng ?? null,
    p_rayon_m: Math.round(radiusM),
    p_device_id: deviceId,
  });
  if (error) throw new ReportsApiError(codeFromMessage(error.message));
  return ((data ?? []) as ReportRow[]).map(mapRow);
}

/** Un signalement précis (lien partagé), même terminé. */
export async function fetchReport(id: string): Promise<Report | null> {
  const deviceId = getDeviceId();
  if (!supabase) {
    const row = demoDetail(id, deviceId);
    return row ? mapRow(row) : null;
  }
  const { data, error } = await supabase.rpc("signalement_detail_v2", {
    p_id: id,
    p_device_id: deviceId,
  });
  if (error) throw new ReportsApiError(codeFromMessage(error.message));
  const rows = (data ?? []) as ReportRow[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export interface NewReport {
  type: ReportType;
  lat: number;
  lng: number;
  photoUrl?: string | null;
  description?: string | null;
  riskLevel?: RiskLevel | null;
  place?: string | null;
}

/**
 * Crée un signalement. Si le même événement est déjà signalé à proximité,
 * le serveur le compte comme une confirmation (« fusionne »).
 */
export async function createReport(input: NewReport): Promise<{ id: string; resultat: CreateResult }> {
  const deviceId = getDeviceId();

  if (!supabase) {
    try {
      const r = demoCreate({ ...input, deviceId });
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
    p_photo_url: input.photoUrl ?? null,
    p_description: input.description ?? null,
    p_niveau_risque: input.riskLevel ?? null,
    p_lieu: input.place ?? null,
  });
  if (error) throw new ReportsApiError(codeFromMessage(error.message));
  const result = data as { id: string; resultat: CreateResult };
  return { id: result.id, resultat: result.resultat };
}

/**
 * Relaie une info vue ailleurs (Facebook, radio, SMS…). Seul le fait est
 * envoyé : type, position, nom du lieu et provenance. Jamais le texte copié.
 */
export async function relayReport(input: {
  type: Exclude<ReportType, "sos">;
  lat: number;
  lng: number;
  source: RelaySource;
  place?: string | null;
}): Promise<{ id: string; resultat: RelayResult }> {
  const deviceId = getDeviceId();

  if (!supabase) {
    try {
      const r = demoRelay({ ...input, deviceId });
      return { id: r.id, resultat: r.resultat as RelayResult };
    } catch (e) {
      throw new ReportsApiError(e instanceof Error ? e.message : "inconnu");
    }
  }

  const { data, error } = await supabase.rpc("relayer_signalement", {
    p_type: input.type,
    p_lat: input.lat,
    p_lng: input.lng,
    p_device_id: deviceId,
    p_source: input.source,
    p_lieu: input.place ?? null,
  });
  if (error) throw new ReportsApiError(codeFromMessage(error.message));
  const result = data as { id: string; resultat: RelayResult };
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
 * Signale une photo ou un texte qui pose problème. Après plusieurs
 * signalements (FLAG_HIDE_THRESHOLD), le serveur masque le contenu.
 */
export async function flagReport(
  reportId: string,
  reason: FlagReason,
): Promise<{ resultat: FlagResult; masque: boolean }> {
  const deviceId = getDeviceId();

  if (!supabase) {
    try {
      return demoFlag(reportId, deviceId, reason) as { resultat: FlagResult; masque: boolean };
    } catch (e) {
      throw new ReportsApiError(e instanceof Error ? e.message : "inconnu");
    }
  }

  const { data, error } = await supabase.rpc("signaler_contenu", {
    p_report_id: reportId,
    p_device_id: deviceId,
    p_motif: reason,
  });
  if (error) throw new ReportsApiError(codeFromMessage(error.message));
  return data as { resultat: FlagResult; masque: boolean };
}

interface RawStats {
  total: number;
  actifs: number;
  par_type: Partial<Record<ReportType, number>>;
  par_mois: { mois: string; total: number; inondations: number }[];
  recents: {
    id: string;
    type: ReportType;
    lieu: string | null;
    created_at: string;
    confirmations: number;
    actif: boolean;
  }[];
}

/** Mémoire du territoire : 12 derniers mois autour d'une position. */
export async function fetchZoneStats(center: LatLng | null, radiusM: number): Promise<ZoneStats> {
  let raw: RawStats;
  if (!supabase) {
    raw = demoStats(center, radiusM) as RawStats;
  } else {
    const { data, error } = await supabase.rpc("statistiques_zone", {
      p_lat: center?.lat ?? null,
      p_lng: center?.lng ?? null,
      p_rayon_m: Math.round(radiusM),
    });
    if (error) throw new ReportsApiError(codeFromMessage(error.message));
    raw = data as RawStats;
  }
  return {
    total: raw.total ?? 0,
    actifs: raw.actifs ?? 0,
    parType: raw.par_type ?? {},
    parMois: raw.par_mois ?? [],
    recents: (raw.recents ?? []).map((r) => ({
      id: r.id,
      type: r.type,
      lieu: r.lieu,
      createdAt: r.created_at,
      confirmations: r.confirmations,
      actif: r.actif,
    })),
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

// ---------------------------------------------------------------------
// Modération (écran /moderation) — chaque appel envoie le code personnel
// du modérateur ; le serveur le vérifie (voir moderation_* dans le SQL).
// ---------------------------------------------------------------------

export type ModFilter = "signales" | "recents";
export type ModAction = "masquer" | "retablir" | "ignorer" | "retirer" | "verifier" | "deverifier";

export interface ModItem {
  id: string;
  type: ReportType;
  lieu: string | null;
  createdAt: string;
  actif: boolean;
  description: string | null;
  photoUrl: string | null;
  masqueAt: string | null;
  descriptionMasquee: string | null;
  photoMasquee: string | null;
  sourceOfficielle: string | null;
  relaisSource: RelaySource | null;
  confirmations: number;
  infirmations: number;
  nbSignalements: number;
  motifs: Partial<Record<FlagReason, number>>;
}

interface ModRow {
  id: string;
  type: ReportType;
  lieu: string | null;
  created_at: string;
  actif: boolean;
  description: string | null;
  photo_url: string | null;
  masque_at: string | null;
  description_masquee: string | null;
  photo_masquee: string | null;
  source_officielle: string | null;
  relais_source: RelaySource | null;
  confirmations: number;
  infirmations: number;
  nb_signalements: number;
  motifs: Partial<Record<FlagReason, number>> | null;
}

// Appel direct à la base (modération, alertes) : pas de mode démo.
async function liveRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new ReportsApiError("mode_demo");
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new ReportsApiError(codeFromMessage(error.message));
  return data as T;
}

/** Vérifie un code de modération ; renvoie le nom du modérateur. */
export async function modVerify(code: string): Promise<string> {
  const out = await liveRpc<{ nom: string }>("moderation_verifier", { p_code: code });
  return out.nom;
}

export async function modList(code: string, filter: ModFilter): Promise<ModItem[]> {
  const rows = await liveRpc<ModRow[]>("moderation_liste", { p_code: code, p_filtre: filter });
  return (rows ?? []).map((r) => ({
    id: r.id,
    type: r.type,
    lieu: r.lieu,
    createdAt: r.created_at,
    actif: r.actif,
    description: r.description,
    photoUrl: r.photo_url,
    masqueAt: r.masque_at,
    descriptionMasquee: r.description_masquee,
    photoMasquee: r.photo_masquee,
    sourceOfficielle: r.source_officielle,
    relaisSource: r.relais_source,
    confirmations: r.confirmations,
    infirmations: r.infirmations,
    nbSignalements: r.nb_signalements,
    motifs: r.motifs ?? {},
  }));
}

export async function modAct(code: string, reportId: string, action: ModAction, valeur?: string): Promise<void> {
  await liveRpc("moderation_action", {
    p_code: code,
    p_report_id: reportId,
    p_action: action,
    p_valeur: valeur ?? null,
  });
}

/** Alarme de sécurité (liste des modérateurs modifiée) active sur ce téléphone ? */
export async function modAlarmState(code: string, endpoint: string): Promise<boolean> {
  const out = await liveRpc<{ active: boolean }>("moderation_alertes_etat", { p_code: code, p_endpoint: endpoint });
  return Boolean(out?.active);
}

export async function modAlarmEnable(code: string, keys: PushKeys): Promise<void> {
  await liveRpc("moderation_alertes_activer", {
    p_code: code,
    p_endpoint: keys.endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
  });
}

export async function modAlarmDisable(code: string, endpoint: string): Promise<void> {
  await liveRpc("moderation_alertes_desactiver", { p_code: code, p_endpoint: endpoint });
}

// ---------------------------------------------------------------------
// Alertes sur le téléphone (notifications) : un lieu arrondi à ~1 km,
// une distance (3, 5 ou 10 km) et un nom facultatif (« Maison »).
// L'adresse d'envoi vient du navigateur (Google, Apple, Mozilla…).
// ---------------------------------------------------------------------

export type AlertRadiusKm = 3 | 5 | 10;
export const ALERT_RADII_KM: AlertRadiusKm[] = [3, 5, 10];

export interface AlertZone {
  lat: number;
  lng: number;
  rayonKm: AlertRadiusKm;
  nom: string | null;
}

export interface PushKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Zone d'alerte enregistrée pour ce téléphone (null si aucune). */
export async function notifGetZone(endpoint: string): Promise<AlertZone | null> {
  const out = await liveRpc<{ lat: number; lng: number; rayon_km: number; nom: string | null } | null>(
    "notif_mon_abonnement",
    { p_endpoint: endpoint },
  );
  if (!out) return null;
  const rayon = ALERT_RADII_KM.includes(out.rayon_km as AlertRadiusKm) ? (out.rayon_km as AlertRadiusKm) : 5;
  return { lat: out.lat, lng: out.lng, rayonKm: rayon, nom: out.nom };
}

/** Enregistre (ou met à jour) la zone d'alerte de ce téléphone. */
export async function notifSaveZone(keys: PushKeys, zone: AlertZone): Promise<void> {
  await liveRpc("notif_abonner", {
    p_endpoint: keys.endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
    p_lat: zone.lat,
    p_lng: zone.lng,
    p_rayon_km: zone.rayonKm,
    p_nom: zone.nom?.trim() || null,
  });
}

/** Supprime la zone d'alerte de ce téléphone. */
export async function notifRemove(endpoint: string): Promise<void> {
  await liveRpc("notif_desabonner", { p_endpoint: endpoint });
}

/** Les alertes ont besoin de la base en direct (pas de mode démo). */
export const notifAvailable = Boolean(supabase);
