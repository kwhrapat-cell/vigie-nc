// Résumé des chiffres (bouton « Copier le résumé » de l'onglet Chiffres de
// /moderation), à coller dans un message ou un dossier pour une mairie ou
// un financeur. Logique pure, testée dans tests/chiffres-resume.test.ts.
//
// Règles (décisions de Patrice du 06/11/2026) :
//  - jamais « confirmé » au nombre : on dit « signalés plusieurs fois ou
//    vérifiés » et « 2e signalement » ;
//  - 1 utilisateur = 1 appareil : on parle d'appareils, pas de personnes ;
//  - période honnête : si le comptage a commencé il y a moins de 30 jours,
//    on donne sa date de début au lieu de « 30 jours ».

import type { ModStats } from "./reports-api";

const nf = new Intl.NumberFormat("fr-FR");

export function nombre(x: number | null | undefined): string {
  return x == null ? "—" : nf.format(x);
}

/** « 2026-10-20 » → « 20 octobre 2026 » (date calendaire, sans décalage horaire) */
export function jourLong(jour: string): string {
  return new Date(`${jour}T00:00:00Z`).toLocaleDateString("fr-FR", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Délai lisible : « 10 min », « 2,5 h », « 14 h ». */
export function delaiTexte(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${Math.max(1, Math.round(min))} min`;
  const h = min / 60;
  return h < 10 ? `${h.toFixed(1).replace(".", ",")} h` : `${Math.round(h)} h`;
}

/** Jours entre deux dates « AAAA-MM-JJ ». */
function joursEntre(debut: string, fin: string): number {
  return Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / 86_400_000);
}

/**
 * Le comptage a commencé il y a moins de 30 jours : renvoie sa date de
 * début (« AAAA-MM-JJ »), sinon null (la fenêtre de 30 jours est pleine).
 */
export function debutRecent(debut: string | null, aujourdhui: string): string | null {
  if (!debut) return null;
  return joursEntre(debut, aujourdhui) < 29 ? debut : null;
}

/** Part des signalements du mois signalés plusieurs fois (2 et plus) ou vérifiés. */
export function partPlusieurs(s: ModStats): number | null {
  return s.signalements.mois > 0 ? Math.round((100 * s.signalements.confirmesMois) / s.signalements.mois) : null;
}

/**
 * Le résumé à copier. `aujourdhui` = date de Nouméa « AAAA-MM-JJ » (le
 * jour du résumé), `dateAffichee` = la même au format « 06/11/2026 ».
 */
export function resumeChiffres(s: ModStats, aujourdhui: string, dateAffichee: string): string {
  const pct = partPlusieurs(s);
  const debut = debutRecent(s.debut, aujourdhui);
  const periode = debut ? `depuis le ${jourLong(debut)}, début du comptage` : "sur 30 jours";
  const lignes = [
    `Vigie NC — chiffres au ${dateAffichee}`,
    `• ${nombre(s.mois)} utilisateurs actifs ${periode} (${nombre(s.semaine)} sur 7 jours, ${nombre(s.aujourdhui)} aujourd'hui)`,
    s.record
      ? `• Record : ${nombre(s.record.nombre)} appareils connectés en même temps (${jourLong(s.record.jour)})`
      : null,
    `• ${nombre(s.signalements.mois)} signalements en 30 jours${
      pct != null ? `, dont ${pct} % signalés plusieurs fois ou vérifiés` : ""
    }`,
    s.signalements.delaiConfirmationMin != null
      ? `• Délai médian avant un 2e signalement : ${delaiTexte(s.signalements.delaiConfirmationMin)}`
      : null,
    `• ${nombre(s.abonnesAlertes)} téléphones abonnés aux alertes, dont ${nombre(s.abonnesTrajet)} avec un trajet surveillé`,
    s.appareilsEquipe > 0
      ? "Comptage anonyme : 1 utilisateur = 1 téléphone ou navigateur. Appareils de l'équipe non comptés."
      : "Comptage anonyme : 1 utilisateur = 1 téléphone ou navigateur.",
  ];
  return lignes.filter(Boolean).join("\n");
}
