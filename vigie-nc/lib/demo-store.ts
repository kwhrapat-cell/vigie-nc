"use client";

// Mode démo : utilisé quand Supabase n'est pas configuré (pas de
// .env.local). Reproduit en mémoire les mêmes règles que les fonctions SQL
// (regroupement des doublons, votes, expiration) pour pouvoir essayer
// l'appli sur un téléphone sans base de données. Tout est perdu au
// rechargement de la page.

import { distanceM, GRAND_NOUMEA, LatLng, offsetKm } from "./geo";
import {
  Report,
  ReportType,
  REPORT_TYPE_LABELS,
  REPORT_TYPE_LIFETIME_MIN,
  REPORT_TYPE_MERGE_RADIUS_M,
  Vote,
} from "./types";

interface DemoReport {
  id: string;
  type: ReportType;
  lat: number;
  lng: number;
  photoUrl: string | null;
  createdAt: number;
  expiresAt: number;
  resolvedAt: number | null;
  lastConfirmedAt: number | null;
  author: string | null; // id appareil
  votes: Map<string, Vote>;
}

const MIN = 60_000;
const store: DemoReport[] = [];
const lastReportByDevice = new Map<string, number>();
const listeners = new Set<() => void>();
let seeded = false;

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
function seed(center: LatLng) {
  if (seeded) return;
  seeded = true;
  const now = Date.now();
  const add = (
    type: ReportType,
    northKm: number,
    eastKm: number,
    ageMin: number,
    present: number,
    termine: number,
  ) => {
    const p = offsetKm(center, northKm, eastKm);
    store.push({
      id: `demo-${store.length + 1}`,
      type,
      lat: p.lat,
      lng: p.lng,
      photoUrl: null,
      createdAt: now - ageMin * MIN,
      expiresAt: now + (REPORT_TYPE_LIFETIME_MIN[type] - ageMin) * MIN,
      resolvedAt: null,
      lastConfirmedAt: present > 0 ? now - Math.min(ageMin, 5) * MIN : null,
      author: "demo-auteur",
      votes: fakeVotes(present, termine),
    });
  };
  add("route_coupee", 0.9, 0.2, 6, 4, 0);
  add("trafic_dense", 0.3, 2.1, 18, 1, 0);
  add("inondation", -2.4, -2.3, 40, 0, 0);
  add("accident", -4.3, 0.6, 25, 1, 1);
  add("chaussee_degradee", 0.4, -4.4, 60 * 30, 0, 0);
}

function isActive(r: DemoReport, now: number) {
  return r.resolvedAt === null && r.expiresAt > now;
}

function toReport(r: DemoReport, deviceId: string, center: LatLng | null): Report {
  const { confirmations, infirmations } = counts(r);
  return {
    id: r.id,
    type: r.type,
    label: REPORT_TYPE_LABELS[r.type],
    lat: r.lat,
    lng: r.lng,
    createdAt: new Date(r.createdAt).toISOString(),
    expiresAt: new Date(r.expiresAt).toISOString(),
    confirmations,
    infirmations,
    lastConfirmedAt: r.lastConfirmedAt ? new Date(r.lastConfirmedAt).toISOString() : null,
    distanceM: center ? distanceM(center, r) : null,
    isMine: r.author === deviceId,
    myVote: r.votes.get(deviceId) ?? null,
    photoUrl: r.photoUrl,
  };
}

export function demoNearby(
  center: LatLng | null,
  radiusM: number,
  deviceId: string,
): Report[] {
  seed(center ?? GRAND_NOUMEA);
  const now = Date.now();
  const radius = Math.min(Math.max(radiusM, 500), 20_000);
  return store
    .filter((r) => isActive(r, now))
    .map((r) => toReport(r, deviceId, center))
    .filter((r) => r.distanceM == null || r.distanceM <= radius)
    .sort((a, b) =>
      a.distanceM != null && b.distanceM != null
        ? a.distanceM - b.distanceM
        : b.createdAt.localeCompare(a.createdAt),
    );
}

function applyVote(r: DemoReport, deviceId: string, vote: Vote): string {
  const now = Date.now();
  if (!isActive(r, now)) throw new DemoError("signalement_termine");

  if (r.author === deviceId) {
    if (vote === "present") throw new DemoError("propre_signalement");
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
  photoUrl: string | null;
  deviceId: string;
}): { id: string; resultat: string } {
  const now = Date.now();
  seed({ lat: input.lat, lng: input.lng });

  if (input.type !== "sos") {
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
        if (input.photoUrl && !existing.photoUrl) existing.photoUrl = input.photoUrl;
        notify();
        return { id: existing.id, resultat: "fusionne" };
      }
    }
  }

  const id = `demo-${store.length + 1}-${now}`;
  store.push({
    id,
    type: input.type,
    lat: input.lat,
    lng: input.lng,
    photoUrl: input.photoUrl,
    createdAt: now,
    expiresAt: now + REPORT_TYPE_LIFETIME_MIN[input.type] * MIN,
    resolvedAt: null,
    lastConfirmedAt: null,
    author: input.deviceId,
    votes: new Map(),
  });
  lastReportByDevice.set(input.deviceId, now);
  notify();
  return { id, resultat: "cree" };
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
