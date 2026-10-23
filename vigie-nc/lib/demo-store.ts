"use client";

// Mode démo : utilisé quand Supabase n'est pas configuré (pas de
// .env.local). Reproduit en mémoire les mêmes règles que les fonctions SQL
// (regroupement des doublons, votes, expiration) pour pouvoir essayer
// l'appli sur un téléphone sans base de données. Tout est perdu au
// rechargement de la page.

import { ajouterJours, aujourdhuiNoumea } from "./chantier";
import { distanceM, GRAND_NOUMEA, LatLng, offsetKm } from "./geo";
import type { ReportRow } from "./reports-api";
import {
  ALERT_TYPES,
  FlagReason,
  FLAG_HIDE_THRESHOLD,
  RelaySource,
  ReportType,
  REPORT_TYPE_LIFETIME_MIN,
  REPORT_TYPE_MERGE_RADIUS_M,
  RiskLevel,
  Vote,
} from "./types";

interface DemoReport {
  id: string;
  type: ReportType;
  lat: number;
  lng: number;
  photoUrl: string | null;
  description: string | null;
  riskLevel: RiskLevel | null;
  place: string | null;
  officialSource: string | null;
  relaySource: RelaySource | null;
  createdAt: number;
  expiresAt: number;
  resolvedAt: number | null;
  lastConfirmedAt: number | null;
  author: string | null; // id appareil
  votes: Map<string, Vote>;
  flags: Map<string, FlagReason>; // signalements de contenu, par appareil
  contentHiddenAt: number | null; // photo + texte masqués par la modération
  endDate?: string | null; // chantier : date de fin annoncée (AAAA-MM-JJ)
}

const MIN = 60_000;
const RISK_RANK: Record<string, number> = { faible: 1, moyen: 2, eleve: 3 };
const store: DemoReport[] = [];
const lastReportByDevice = new Map<string, number>();
const listeners = new Set<() => void>();
let seeded = false;
// Les signalements de démo sont d'abord posés autour de Nouméa, puis
// déplacés autour de l'utilisateur dès que sa position est connue.
let anchoredOnUser = false;
let seedCenter: LatLng = GRAND_NOUMEA;

export class DemoError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribeDemo(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function counts(r: DemoReport) {
  let confirmations = 0;
  let infirmations = 0;
  r.votes.forEach((v) => (v === "present" ? confirmations++ : infirmations++));
  return { confirmations, infirmations };
}

function fakeVotes(present: number, termine: number): Map<string, Vote> {
  const m = new Map<string, Vote>();
  for (let i = 0; i < present; i++) m.set(`demo-p-${i}`, "present");
  for (let i = 0; i < termine; i++) m.set(`demo-t-${i}`, "termine");
  return m;
}

// Signalements de démonstration placés autour de la première position
// connue, pour que la démo ait du sens où que l'on soit.
function seed(center: LatLng | null) {
  if (seeded) {
    if (center && !anchoredOnUser) reanchor(center);
    return;
  }
  seeded = true;
  if (center) anchoredOnUser = true;
  seedCenter = center ?? GRAND_NOUMEA;
  const origin = seedCenter;
  const now = Date.now();
  const add = (
    type: ReportType,
    northKm: number,
    eastKm: number,
    ageMin: number,
    present: number,
    extra: Partial<DemoReport> = {},
  ) => {
    const p = offsetKm(origin, northKm, eastKm);
    store.push({
      id: `demo-${store.length + 1}`,
      type,
      lat: p.lat,
      lng: p.lng,
      photoUrl: null,
      description: null,
      riskLevel: null,
      place: null,
      officialSource: null,
      relaySource: null,
      createdAt: now - ageMin * MIN,
      expiresAt: now + (REPORT_TYPE_LIFETIME_MIN[type] - ageMin) * MIN,
      resolvedAt: null,
      lastConfirmedAt: present > 0 ? now - Math.min(ageMin, 5) * MIN : null,
      author: "demo-auteur",
      votes: fakeVotes(present, 0),
      flags: new Map(),
      contentHiddenAt: null,
      ...extra,
    });
  };
  add("inondation", 0.9, 0.2, 5, 3, {
    description: "Route partiellement inondée. Attention dans les deux sens.",
    riskLevel: "moyen",
    officialSource: "Mairie",
  });
  add("accident", 0.3, 2.1, 12, 6, { riskLevel: "eleve" });
  add("route_coupee", -2.4, -2.3, 25, 1, {
    description: "Arbre en travers de la route.",
    flags: new Map<string, FlagReason>([["demo-f-0", "hors_sujet"]]),
  });
  add("travaux", -3.9, 0.6, 60, 0, { riskLevel: "faible" });
  // Chantier de longue durée : vérifié, avec une date de fin annoncée
  const finChantier = ajouterJours(aujourdhuiNoumea(), 45);
  add("travaux", 2.6, -1.4, 9 * 24 * 60, 2, {
    description: "Réfection de la chaussée, circulation alternée.",
    place: "Chantier (démo)",
    officialSource: "Province Sud",
    endDate: finChantier,
    expiresAt: now + 45 * 24 * 60 * MIN,
  });
  add("meteo", 3.2, -3.5, 40, 2, { description: "Fortes pluies, visibilité réduite." });
  add("trafic_dense", 1.8, 1.4, 8, 0);
  add("route_coupee", 4.6, 3.2, 15, 0, { relaySource: "facebook", place: "Info relayée (démo)" });
}

function reanchor(center: LatLng) {
  anchoredOnUser = true;
  const dLat = center.lat - seedCenter.lat;
  const dLng = center.lng - seedCenter.lng;
  for (const r of store) {
    if (r.author === "demo-auteur") {
      r.lat += dLat;
      r.lng += dLng;
    }
  }
  seedCenter = center;
}

function isActive(r: DemoReport, now: number) {
  return r.resolvedAt === null && r.expiresAt > now;
}

function toRow(r: DemoReport, deviceId: string, center: LatLng | null): ReportRow {
  const { confirmations, infirmations } = counts(r);
  return {
    id: r.id,
    type: r.type,
    lat: r.lat,
    lng: r.lng,
    photo_url: r.photoUrl,
    description: r.description,
    niveau_risque: r.riskLevel,
    lieu: r.place,
    source_officielle: r.officialSource,
    relais_source: r.relaySource,
    confirmations,
    infirmations,
    created_at: new Date(r.createdAt).toISOString(),
    expires_at: new Date(r.expiresAt).toISOString(),
    last_confirmed_at: r.lastConfirmedAt ? new Date(r.lastConfirmedAt).toISOString() : null,
    distance_m: center ? distanceM(center, r) : null,
    est_auteur: r.author === deviceId,
    mon_vote: r.votes.get(deviceId) ?? null,
    actif: isActive(r, Date.now()),
    fin_annoncee: r.endDate ?? null,
  };
}

export function demoNearby(center: LatLng | null, radiusM: number, deviceId: string): ReportRow[] {
  seed(center);
  const now = Date.now();
  const radius = Math.min(Math.max(radiusM, 500), 20_000);
  return store
    .filter((r) => isActive(r, now))
    .map((r) => toRow(r, deviceId, center))
    .filter((r) => r.distance_m == null || r.distance_m <= radius)
    .sort((a, b) =>
      a.distance_m != null && b.distance_m != null
        ? a.distance_m - b.distance_m
        : b.created_at.localeCompare(a.created_at),
    );
}

export function demoDetail(id: string, deviceId: string): ReportRow | null {
  const r = store.find((x) => x.id === id && x.type !== "sos");
  return r ? toRow(r, deviceId, null) : null;
}

function applyVote(r: DemoReport, deviceId: string, vote: Vote): string {
  const now = Date.now();
  if (!isActive(r, now)) throw new DemoError("signalement_termine");

  if (r.author === deviceId) {
    if (vote === "present") throw new DemoError("propre_signalement");
    if (r.officialSource) return "verifie";
    r.resolvedAt = now;
    r.expiresAt = now;
    return "resolu";
  }

  if (r.votes.get(deviceId) === vote) return "deja_vote";
  r.votes.set(deviceId, vote);
  const { confirmations, infirmations } = counts(r);

  if (vote === "present") {
    r.expiresAt = Math.max(r.expiresAt, now + REPORT_TYPE_LIFETIME_MIN[r.type] * MIN);
    r.lastConfirmedAt = now;
    return "confirme";
  }
  // Mêmes règles que vigie_appliquer_vote() : un signalement vérifié ne se
  // retire que par la modération ; un danger, avec 2 « terminé » au moins.
  if (r.officialSource) return "verifie";
  if (ALERT_TYPES.includes(r.type)) {
    if (infirmations >= 2 && infirmations > confirmations) {
      r.resolvedAt = now;
      r.expiresAt = now;
      return "resolu";
    }
    return "conteste";
  }
  if (infirmations > confirmations) {
    r.resolvedAt = now;
    r.expiresAt = now;
    return "resolu";
  }
  r.expiresAt = Math.min(r.expiresAt, now + 30 * MIN);
  return "en_baisse";
}

export function demoCreate(input: {
  type: ReportType;
  lat: number;
  lng: number;
  photoUrl?: string | null;
  description?: string | null;
  riskLevel?: RiskLevel | null;
  place?: string | null;
  deviceId: string;
}): { id: string; resultat: string } {
  const now = Date.now();
  seed({ lat: input.lat, lng: input.lng });
  const description = input.description?.trim() || null;
  if (description && description.length > 200) throw new DemoError("description_trop_longue");
  // Le SOS ne publie rien (voir creer_signalement_v3)
  if (input.type === "sos") throw new DemoError("type_invalide");

  const last = lastReportByDevice.get(input.deviceId);
  if (last && now - last < 60_000) throw new DemoError("rate_limit");

  const radius = REPORT_TYPE_MERGE_RADIUS_M[input.type];
  if (radius > 0) {
    const existing = store
      .filter((r) => r.type === input.type && isActive(r, now))
      .map((r) => ({ r, d: distanceM(r, input) }))
      .filter(({ d }) => d <= radius)
      .sort((a, b) => a.d - b.d)[0]?.r;

    if (existing) {
      if (existing.author === input.deviceId) {
        return { id: existing.id, resultat: "deja_signale" };
      }
      applyVote(existing, input.deviceId, "present");
      if (existing.contentHiddenAt === null) {
        existing.photoUrl ??= input.photoUrl ?? null;
        existing.description ??= description;
      }
      existing.place ??= input.place ?? null;
      if (input.riskLevel && (RISK_RANK[input.riskLevel] ?? 0) > (RISK_RANK[existing.riskLevel ?? ""] ?? 0)) {
        existing.riskLevel = input.riskLevel;
      }
      notify();
      return { id: existing.id, resultat: "fusionne" };
    }
  }

  const id = `demo-${store.length + 1}-${now}`;
  store.push({
    id,
    type: input.type,
    lat: input.lat,
    lng: input.lng,
    photoUrl: input.photoUrl ?? null,
    description,
    riskLevel: input.riskLevel ?? null,
    place: input.place ?? null,
    officialSource: null,
    relaySource: null,
    createdAt: now,
    expiresAt: now + REPORT_TYPE_LIFETIME_MIN[input.type] * MIN,
    resolvedAt: null,
    lastConfirmedAt: null,
    author: input.deviceId,
    votes: new Map(),
    flags: new Map(),
    contentHiddenAt: null,
  });
  lastReportByDevice.set(input.deviceId, now);
  notify();
  return { id, resultat: "cree" };
}

export function demoRelay(input: {
  type: ReportType;
  lat: number;
  lng: number;
  source: RelaySource;
  place?: string | null;
  deviceId: string;
}): { id: string; resultat: string } {
  const now = Date.now();
  seed({ lat: input.lat, lng: input.lng });
  if (input.type === "sos") throw new DemoError("type_invalide");
  const last = lastReportByDevice.get(input.deviceId);
  if (last && now - last < 60_000) throw new DemoError("rate_limit");

  const radius = REPORT_TYPE_MERGE_RADIUS_M[input.type];
  if (radius > 0) {
    const existing = store.find(
      (r) => r.type === input.type && isActive(r, now) && distanceM(r, input) <= radius,
    );
    if (existing) return { id: existing.id, resultat: "existe_deja" };
  }

  const id = `demo-relais-${store.length + 1}-${now}`;
  store.push({
    id,
    type: input.type,
    lat: input.lat,
    lng: input.lng,
    photoUrl: null,
    description: null,
    riskLevel: null,
    place: input.place ?? null,
    officialSource: null,
    relaySource: input.source,
    createdAt: now,
    expiresAt: now + REPORT_TYPE_LIFETIME_MIN[input.type] * MIN,
    resolvedAt: null,
    lastConfirmedAt: null,
    author: input.deviceId,
    votes: new Map(),
    flags: new Map(),
    contentHiddenAt: null,
  });
  lastReportByDevice.set(input.deviceId, now);
  notify();
  return { id, resultat: "relaye" };
}

export function demoVote(reportId: string, deviceId: string, vote: Vote) {
  const r = store.find((x) => x.id === reportId);
  if (!r) throw new DemoError("signalement_introuvable");
  const resultat = applyVote(r, deviceId, vote);
  notify();
  const { confirmations, infirmations } = counts(r);
  return {
    resultat,
    confirmations,
    infirmations,
    expires_at: new Date(r.expiresAt).toISOString(),
    resolu: r.resolvedAt !== null,
  };
}

// Statistiques fictives mais cohérentes (saison des pluies plus chargée),
// complétées par les signalements de la démo.
export function demoStats(center: LatLng | null, radiusM: number) {
  seed(center);
  const factor = center ? Math.min(1, radiusM / 5000) : 4;
  const seasonal = [9, 11, 8, 5, 3, 2, 2, 2, 3, 4, 6, 8]; // janv. → déc.
  const now = new Date();
  const parMois: { mois: string; total: number; inondations: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const base = Math.round(seasonal[d.getMonth()] * 1.6 * factor);
    parMois.push({
      mois: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      total: base,
      inondations: Math.round(base * 0.4),
    });
  }
  const recentsAll = store.filter((r) => r.type !== "sos");
  const live = recentsAll.length;
  parMois[11].total += live;
  const total = parMois.reduce((s, m) => s + m.total, 0);
  const inond = parMois.reduce((s, m) => s + m.inondations, 0);
  return {
    total,
    actifs: recentsAll.filter((r) => isActive(r, Date.now())).length,
    par_type: {
      inondation: inond,
      accident: Math.round(total * 0.27),
      route_coupee: Math.round(total * 0.18),
      travaux: Math.round(total * 0.1),
      trafic_dense: Math.round(total * 0.08),
    },
    par_mois: parMois,
    recents: recentsAll
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({
        id: r.id,
        type: r.type,
        lieu: r.place,
        created_at: new Date(r.createdAt).toISOString(),
        confirmations: counts(r).confirmations,
        actif: isActive(r, Date.now()),
      })),
  };
}

// Même règles que signaler_contenu() dans supabase/schema.sql.
export function demoFlag(reportId: string, deviceId: string, reason: FlagReason) {
  const r = store.find((x) => x.id === reportId);
  if (!r) throw new DemoError("signalement_introuvable");
  if (r.type === "sos") throw new DemoError("type_invalide");
  if (r.author === deviceId) throw new DemoError("propre_signalement");

  if (r.flags.has(deviceId)) {
    return { resultat: "deja_signale", masque: r.contentHiddenAt !== null };
  }
  r.flags.set(deviceId, reason);

  if (r.contentHiddenAt === null && r.flags.size >= FLAG_HIDE_THRESHOLD) {
    r.photoUrl = null;
    r.description = null;
    r.contentHiddenAt = Date.now();
    notify();
    return { resultat: "masque", masque: true };
  }
  return { resultat: "enregistre", masque: r.contentHiddenAt !== null };
}
