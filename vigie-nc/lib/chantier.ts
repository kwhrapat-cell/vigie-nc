// Chantiers de longue durée : des travaux avec une date de fin annoncée par
// une source officielle (mairie, Province…), fixée depuis /moderation
// (moderation_chantier dans supabase/schema.sql). Ils restent sur la carte
// jusqu'au soir de ce jour, heure du territoire (Nouméa en Calédonie).

import { TERRITOIRE } from "./territoire";
import type { Report } from "./types";

// ⚠️ Doit rester aligné sur vigie_chantier_jours_max() dans supabase/schema.sql.
export const CHANTIER_JOURS_MAX = 183;

const TZ = TERRITOIRE.fuseau;
const jourIso = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
// Les dates « AAAA-MM-JJ » sont lues à midi UTC puis écrites en UTC : le
// jour affiché ne dépend pas du fuseau du téléphone.
const jourCourt = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "short" });
const jourAnnee = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

function lire(d: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)) : null;
}

/** Aujourd'hui dans le territoire (heure de Nouméa en Calédonie), au format AAAA-MM-JJ. */
export function aujourdhuiLocal(now: Date = new Date()): string {
  return jourIso.format(now);
}

/** AAAA-MM-JJ + n jours. */
export function ajouterJours(d: string, n: number): string {
  const x = lire(d);
  if (!x) return d;
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

/** « 15 déc. », ou « 15 déc. 2027 » si ce n'est pas l'année en cours. */
export function formatJour(d: string, now: Date = new Date()): string {
  const x = lire(d);
  if (!x) return d;
  return d.slice(0, 4) === aujourdhuiLocal(now).slice(0, 4) ? jourCourt.format(x) : jourAnnee.format(x);
}

/** Un chantier : des travaux avec une date de fin annoncée. */
export function estChantier(r: Pick<Report, "type" | "endDate">): boolean {
  return r.type === "travaux" && Boolean(r.endDate);
}

/** « jusqu'au 15 déc. », ou « fin annoncée le 15 déc., dépassée ». */
export function libelleFinChantier(fin: string, now: Date = new Date()): string {
  return fin < aujourdhuiLocal(now)
    ? `fin annoncée le ${formatJour(fin, now)}, dépassée`
    : `jusqu'au ${formatJour(fin, now)}`;
}
