"use client";

// Point d'accès unique aux signalements. Avec Supabase configuré, tout
// passe par les fonctions SQL (RPC) de supabase/schema.sql, avec la
// session anonyme du téléphone (lib/session.ts) ; sinon, par le mode démo
// en mémoire (lib/demo-store.ts).

import { supabase } from "./supabase";
import { getDeviceId } from "./device-id";
import { ensureSession } from "./session";
import { noterSignalement, noterVote } from "./impact";
import { demoCreate, demoDetail, demoFlag, demoNearby, demoRelay, demoStats, demoVote } from "./demo-store";
import { LatLng } from "./geo";
import { PHRASES } from "./territoire";
import {
  Annonce,
  AnnonceNiveau,
  FlagReason,
  RelaySource,
  Report,
  ReportType,
  REPORT_TYPE_LABELS,
  RiskLevel,
  Vote,
} from "./types";

export type CreateResult = "cree" | "fusionne" | "deja_signale";
export type RelayResult = "relaye" | "existe_deja";
export type VoteResult = "confirme" | "en_baisse" | "conteste" | "verifie" | "resolu" | "deja_vote";
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
  rate_limit_jour:
    "Beaucoup de signalements depuis ce téléphone aujourd'hui : réessaie demain ou écris-nous.",
  connexion_requise:
    "Ce téléphone n'a pas pu être vérifié pour l'instant — vérifie ta connexion, puis réessaie.",
  position_requise:
    "Active ta position : seules les personnes à moins de 5 km peuvent confirmer ou déclarer terminé.",
  trop_loin: "Tu es à plus de 5 km : seules les personnes sur place peuvent confirmer ou déclarer terminé.",
  position_hors_nc:
    `Cette position semble ${PHRASES.horsDuNom} : le signalement n'a pas été envoyé.`,
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
  annonce_niveau_invalide: "Choisis le niveau de l'annonce : info, vigilance ou urgence.",
  annonce_trop_courte: "Le message est trop court (10 caractères au moins).",
  annonce_trop_longue: "Le message est trop long (280 caractères au plus).",
  annonce_duree_invalide: "Choisis une durée entre 1 h et 72 h.",
  annonce_notif_info: "Une simple info ne part pas en notification : choisis « Vigilance » ou « Urgence ».",
  trop_d_annonces: "10 annonces publiées ces dernières 24 h : c'est le maximum.",
  trop_de_notifications:
    "3 annonces sont déjà parties en notification ces dernières 24 h : publie celle-ci sans notification.",
  annonce_introuvable: "Cette annonce n'existe plus.",
  chantier_type_invalide: "Seuls les travaux peuvent avoir une date de fin.",
  chantier_date_invalide: "Choisis une date de fin entre aujourd'hui et dans 6 mois.",
  ia_non_configuree:
    "L'IA n'est pas encore branchée : ajoute la clé ANTHROPIC_API_KEY dans les variables Vercel, puis redéploie.",
  ia_quota: "Limite d'appels à l'IA atteinte pour cette heure : réessaie un peu plus tard.",
  ia_coupee: "L'IA est coupée (réglage ia_resume = non dans vigie_config).",
  temoignages_invalides: "Écris de 2 à 8 témoignages, de 200 caractères au plus chacun.",
  base_non_configuree: "Cette fonction n'est disponible qu'avec la base en direct.",
};

export class ReportsApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

// Les codes les plus longs d'abord : « rate_limit_jour » ne doit pas être
// lu comme « rate_limit ».
const KNOWN_CODES = Object.keys(ERROR_MESSAGES).sort((a, b) => b.length - a.length);

function codeFromMessage(message: string | undefined): string {
  if (!message) return "inconnu";
  const known = KNOWN_CODES.find((k) => message.includes(k));
  return known ?? "inconnu";
}

/** Session anonyme obligatoire pour écrire (signaler, voter, photo…). */
async function requireSession(): Promise<void> {
  try {
    if (await ensureSession()) return;
  } catch {
    // message lisible ci-dessous
  }
  throw new ReportsApiError("connexion_requise");
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
  fin_annoncee?: string | null;
  resume_ia?: string | null;
  resume_ia_nb?: number | null;
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
    endDate: row.fin_annoncee ?? null,
    aiSummary: row.resume_ia ?? null,
    aiSummaryCount: row.resume_ia_nb ?? null,
  };
}

/** Signalements actifs dans le rayon (ou partout si `center` est nul). */
export async function fetchNearby(center: LatLng | null, radiusM: number): Promise<Report[]> {
  if (!supabase) return demoNearby(center, radiusM, getDeviceId()).map(mapRow);

  const { data, error } = await supabase.rpc("signalements_proches_v3", {
    p_lat: center?.lat ?? null,
    p_lng: center?.lng ?? null,
    p_rayon_m: Math.round(radiusM),
  });
  if (error) throw new ReportsApiError(codeFromMessage(error.message));
  return ((data ?? []) as ReportRow[]).map(mapRow);
}

/**
 * Point route du mode conduite écrit par l'IA (/api/point-route), à partir
 * des signalements choisis devant soi : identifiant et distance seulement,
 * jamais la position. `null` en cas de souci (pas de réseau, IA pas
 * branchée, trop tôt…) : le téléphone dit alors le point route sans l'IA.
 */
export async function fetchPointRouteIa(
  evenements: { id: string; distanceM: number }[],
  avecCap: boolean,
): Promise<string | null> {
  if (!supabase || evenements.length === 0) return null;
  const controle = new AbortController();
  const minuteur = setTimeout(() => controle.abort(), 8_000);
  try {
    await requireSession();
    const { data } = await supabase.auth.getSession();
    const jeton = data.session?.access_token;
    if (!jeton) return null;
    const res = await fetch("/api/point-route", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${jeton}` },
      body: JSON.stringify({ evenements, avecCap }),
      signal: controle.signal,
    });
    if (!res.ok) return null;
    const out = (await res.json()) as { texte?: unknown };
    return typeof out.texte === "string" && out.texte.trim() ? out.texte : null;
  } catch {
    return null;
  } finally {
    clearTimeout(minuteur);
  }
}

/** Un signalement précis (lien partagé), même terminé. */
export async function fetchReport(id: string): Promise<Report | null> {
  if (!supabase) {
    const row = demoDetail(id, getDeviceId());
    return row ? mapRow(row) : null;
  }
  const { data, error } = await supabase.rpc("signalement_detail_v3", { p_id: id });
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
  const res = await creerSignalement(input);
  // « Mon impact » (gardé sur le téléphone) : pour dire plus tard s'il a servi.
  if (res.resultat !== "deja_signale") {
    noterSignalement(res.id, input.type, input.place, res.resultat === "fusionne");
  }
  return res;
}

async function creerSignalement(input: NewReport): Promise<{ id: string; resultat: CreateResult }> {
  if (!supabase) {
    try {
      const r = demoCreate({ ...input, deviceId: getDeviceId() });
      return { id: r.id, resultat: r.resultat as CreateResult };
    } catch (e) {
      throw new ReportsApiError(e instanceof Error ? e.message : "inconnu");
    }
  }

  await requireSession();
  const { data, error } = await supabase.rpc("creer_signalement_v3", {
    p_type: input.type,
    p_lat: input.lat,
    p_lng: input.lng,
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
  const res = await relayerSignalement(input);
  // Déjà sur la carte : le relais n'ajoute rien, il ne compte pas.
  if (res.resultat === "relaye") noterSignalement(res.id, input.type, input.place, false);
  return res;
}

async function relayerSignalement(input: {
  type: Exclude<ReportType, "sos">;
  lat: number;
  lng: number;
  source: RelaySource;
  place?: string | null;
}): Promise<{ id: string; resultat: RelayResult }> {
  if (!supabase) {
    try {
      const r = demoRelay({ ...input, deviceId: getDeviceId() });
      return { id: r.id, resultat: r.resultat as RelayResult };
    } catch (e) {
      throw new ReportsApiError(e instanceof Error ? e.message : "inconnu");
    }
  }

  await requireSession();
  const { data, error } = await supabase.rpc("relayer_signalement_v3", {
    p_type: input.type,
    p_lat: input.lat,
    p_lng: input.lng,
    p_source: input.source,
    p_lieu: input.place ?? null,
  });
  if (error) throw new ReportsApiError(codeFromMessage(error.message));
  const result = data as { id: string; resultat: RelayResult };
  return { id: result.id, resultat: result.resultat };
}

/**
 * « Toujours là » (present) ou « C'est terminé » (termine). `position` =
 * position actuelle du téléphone (l'écran ne propose le vote qu'à moins de
 * 5 km ; le serveur le vérifiera aussi avec l'identité anonyme).
 */
export async function voteOnReport(
  reportId: string,
  vote: Vote,
  position?: LatLng | null,
): Promise<VoteOutcome> {
  let raw: {
    resultat: VoteResult;
    confirmations: number;
    infirmations: number;
    expires_at: string;
    resolu: boolean;
  };

  if (!supabase) {
    try {
      raw = demoVote(reportId, getDeviceId(), vote) as typeof raw;
    } catch (e) {
      throw new ReportsApiError(e instanceof Error ? e.message : "inconnu");
    }
  } else {
    await requireSession();
    const { data, error } = await supabase.rpc("voter_signalement_v3", {
      p_report_id: reportId,
      p_vote: vote,
      p_lat: position?.lat ?? null,
      p_lng: position?.lng ?? null,
    });
    if (error) throw new ReportsApiError(codeFromMessage(error.message));
    raw = data as typeof raw;
  }

  noterVote(vote, raw.resultat, raw.resolu);
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
  if (!supabase) {
    try {
      return demoFlag(reportId, getDeviceId(), reason) as { resultat: FlagResult; masque: boolean };
    } catch (e) {
      throw new ReportsApiError(e instanceof Error ? e.message : "inconnu");
    }
  }

  await requireSession();
  const { data, error } = await supabase.rpc("signaler_contenu_v3", {
    p_report_id: reportId,
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

  // Dépôt réservé aux sessions (5 photos par heure au plus, voir schema.sql)
  await requireSession();
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

export type ModFilter = "signales" | "recents" | "travaux";
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
  finAnnoncee: string | null;
  resumeIa: string | null;
  resumeIaNb: number | null;
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
  fin_annoncee: string | null;
  resume_ia?: string | null;
  resume_ia_nb?: number | null;
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
    finAnnoncee: r.fin_annoncee ?? null,
    resumeIa: r.resume_ia ?? null,
    resumeIaNb: r.resume_ia_nb ?? null,
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

/**
 * Essai de l'IA (onglet « IA » de /moderation) : le résumé que l'IA ferait de
 * ces témoignages inventés (du plus ancien au plus récent). Rien n'est
 * enregistré. `null` = l'IA n'y a rien trouvé d'utile pour la route.
 */
export async function modIaEssai(
  code: string,
  input: { type: ReportType; lieu: string; temoignages: string[] },
): Promise<string | null> {
  if (!supabase) throw new ReportsApiError("mode_demo");
  let res: Response;
  try {
    res = await fetch("/api/resumer/essai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, ...input }),
    });
  } catch {
    throw new ReportsApiError("inconnu");
  }
  const data = (await res.json().catch(() => ({}))) as { resume?: string | null; erreur?: string };
  if (!res.ok) throw new ReportsApiError(codeFromMessage(data.erreur));
  return data.resume ?? null;
}

/**
 * Chantier de longue durée (travaux seulement) : source officielle et date
 * de fin annoncée (AAAA-MM-JJ, 6 mois au plus). Rappeler change la date.
 */
export async function modChantier(code: string, reportId: string, source: string, fin: string): Promise<void> {
  await liveRpc("moderation_chantier", {
    p_code: code,
    p_report_id: reportId,
    p_source: source,
    p_fin: fin,
  });
}

// ---------------------------------------------------------------------
// Chiffres d'utilisation (onglet « Chiffres » de /moderation)
// Comptage anonyme : voir vigie_presence() et moderation_statistiques()
// dans supabase/schema.sql. Uniquement des totaux.
// ---------------------------------------------------------------------

export interface ModStats {
  maintenant: number;
  aujourdhui: number;
  semaine: number;
  mois: number;
  nouveauxMois: number;
  visiteursTotal: number;
  debut: string | null;
  record: { nombre: number; jour: string } | null;
  fidelite: { base: number; revenus: number };
  signalements: {
    aujourdhui: number;
    semaine: number;
    mois: number;
    confirmesMois: number;
    delaiConfirmationMin: number | null;
    votesMois: number;
  };
  abonnesAlertes: number;
  sources: { source: string; nouveaux: number }[];
  courbe: { jour: string; actifs: number; signalements: number; maxSimultanes: number }[];
}

interface ModStatsRow {
  maintenant: number;
  aujourdhui: number;
  semaine: number;
  mois: number;
  nouveaux_mois: number;
  visiteurs_total: number;
  debut: string | null;
  record: { nombre: number; jour: string } | null;
  fidelite: { base: number; revenus: number } | null;
  signalements: {
    aujourdhui: number;
    semaine: number;
    mois: number;
    confirmes_mois: number;
    delai_confirmation_min: number | null;
    votes_mois: number;
  };
  abonnes_alertes: number;
  sources: { source: string; nouveaux: number }[] | null;
  courbe: { jour: string; actifs: number; signalements: number; max_simultanes: number }[] | null;
}

export async function modStats(code: string): Promise<ModStats> {
  const r = await liveRpc<ModStatsRow>("moderation_statistiques", { p_code: code });
  return {
    maintenant: r.maintenant,
    aujourdhui: r.aujourdhui,
    semaine: r.semaine,
    mois: r.mois,
    nouveauxMois: r.nouveaux_mois,
    visiteursTotal: r.visiteurs_total,
    debut: r.debut,
    record: r.record,
    fidelite: r.fidelite ?? { base: 0, revenus: 0 },
    signalements: {
      aujourdhui: r.signalements.aujourdhui,
      semaine: r.signalements.semaine,
      mois: r.signalements.mois,
      confirmesMois: r.signalements.confirmes_mois,
      delaiConfirmationMin: r.signalements.delai_confirmation_min,
      votesMois: r.signalements.votes_mois,
    },
    abonnesAlertes: r.abonnes_alertes,
    sources: r.sources ?? [],
    courbe: (r.courbe ?? []).map((c) => ({
      jour: c.jour,
      actifs: c.actifs,
      signalements: c.signalements,
      maxSimultanes: c.max_simultanes,
    })),
  };
}

/**
 * « Ce téléphone utilise l'appli » : compté une fois par minute au plus,
 * sous l'empreinte de la session anonyme (jamais l'adresse IP ni la
 * position). `source` = provenance du lien (?src=affiche…), utile
 * seulement pour un nouveau visiteur. Ne bloque jamais l'appli.
 */
export async function notePresence(source: string | null): Promise<void> {
  if (!supabase) return; // mode démo : rien à compter
  try {
    if (!(await ensureSession())) return;
    await supabase.rpc("vigie_presence", { p_source: source });
  } catch {
    // pas de réseau ou session impossible : on réessaiera plus tard
  }
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

// ---------------------------------------------------------------------
// Annonces générales : vues par tout le monde, dans toute la Calédonie.
// Lecture sans session (annonces_actives) ; publication et retrait avec le
// code d'un modérateur. Pas de mode démo : sans base, aucune annonce.
// ---------------------------------------------------------------------

interface AnnonceRow {
  id: string;
  niveau: AnnonceNiveau;
  texte: string;
  source: string | null;
  created_at: string;
  expires_at: string;
}

function mapAnnonce(r: AnnonceRow): Annonce {
  return {
    id: r.id,
    niveau: r.niveau,
    texte: r.texte,
    source: r.source,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  };
}

/** Annonces en cours, les plus graves d'abord. */
export async function fetchAnnonces(): Promise<Annonce[]> {
  if (!supabase) return [];
  const rows = await liveRpc<AnnonceRow[]>("annonces_actives", {});
  return (rows ?? []).map(mapAnnonce);
}

export interface ModAnnonce extends Annonce {
  retireeAt: string | null;
  actif: boolean;
  notifier: boolean;
  envoyee: boolean;
  auteur: string | null;
}

export interface ModAnnonces {
  annonces: ModAnnonce[];
  abonnes: number;
  notifiees24h: number;
  publiees24h: number;
}

interface ModAnnonceRow extends AnnonceRow {
  retiree_at: string | null;
  actif: boolean;
  notifier: boolean;
  envoyee: boolean;
  auteur: string | null;
}

export async function modAnnonces(code: string): Promise<ModAnnonces> {
  const out = await liveRpc<{
    annonces: ModAnnonceRow[] | null;
    abonnes: number;
    notifiees_24h: number;
    publiees_24h: number;
  }>("moderation_annonces", { p_code: code });
  return {
    annonces: (out.annonces ?? []).map((r) => ({
      ...mapAnnonce(r),
      retireeAt: r.retiree_at,
      actif: r.actif,
      notifier: r.notifier,
      envoyee: r.envoyee,
      auteur: r.auteur,
    })),
    abonnes: out.abonnes ?? 0,
    notifiees24h: out.notifiees_24h ?? 0,
    publiees24h: out.publiees_24h ?? 0,
  };
}

export interface NewAnnonce {
  niveau: AnnonceNiveau;
  texte: string;
  source: string | null;
  dureeH: number;
  notifier: boolean;
}

/** Publie une annonce pour toute la Calédonie ; `notifiee` : notification partie. */
export async function modAnnoncePublier(code: string, a: NewAnnonce): Promise<{ id: string; notifiee: boolean }> {
  const out = await liveRpc<{ id: string; notifiee: boolean }>("moderation_annonce_publier", {
    p_code: code,
    p_niveau: a.niveau,
    p_texte: a.texte,
    p_source: a.source?.trim() || null,
    p_duree_h: a.dureeH,
    p_notifier: a.notifier,
  });
  return { id: out.id, notifiee: Boolean(out.notifiee) };
}

export async function modAnnonceRetirer(code: string, annonceId: string): Promise<void> {
  await liveRpc("moderation_annonce_retirer", { p_code: code, p_annonce_id: annonceId });
}

// ---------------------------------------------------------------------
// Erreurs des téléphones : voir vigie_erreur_signaler() et
// moderation_erreurs() dans supabase/schema.sql (anonyme, 14 jours).
// ---------------------------------------------------------------------

/** Envoie une erreur (déjà nettoyée par lib/erreurs.ts). Ne lève jamais d'erreur. */
export async function envoyerErreur(message: string, ecran: string, navigateur: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.rpc("vigie_erreur_signaler", {
      p_message: message,
      p_ecran: ecran,
      p_navigateur: navigateur,
    });
  } catch {
    // pas de réseau : tant pis, on ne réessaie pas
  }
}

export interface ErreurTelephone {
  message: string;
  ecran: string | null;
  navigateur: string | null;
  nombre: number;
  jours: number;
  derniere: string;
}

/** Les erreurs des 14 derniers jours (onglet Chiffres de /moderation). */
export async function modErreurs(code: string): Promise<ErreurTelephone[]> {
  return (await liveRpc<ErreurTelephone[] | null>("moderation_erreurs", { p_code: code })) ?? [];
}
