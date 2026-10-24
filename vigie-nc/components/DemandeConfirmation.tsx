"use client";

import { useEffect, useState } from "react";
import { Cagou } from "./Cagou";
import { distanceM, formatDistance } from "@/lib/geo";
import type { GeoPosition } from "@/lib/useGeolocation";
import { errorMessage, voteOnReport, VoteResult } from "@/lib/reports-api";
import { idsBadges, nouveauxBadges, texteNouveauxBadges } from "@/lib/impact";
import { Report, Vote } from "@/lib/types";

// « Tu passes par là ? » : quand on est arrêté tout près d'un signalement
// (300 m) qu'on n'a ni publié ni confirmé, l'appli demande d'un geste s'il
// est toujours là. C'est ce qui garde la carte juste. Jamais en conduite
// (le composant n'est pas affiché) ni en roulant (vitesse), une demande
// par signalement, une toutes les 10 min au plus. La liste des demandes
// faites reste sur le téléphone.

const CLE = "vigie-nc:demandes-confirmation";
const DISTANCE_MAX_M = 300;
const PRECISION_MAX_M = 100;
const VITESSE_MAX_MS = 3; // ~11 km/h : au-delà, on roule
const INTERVALLE_MS = 10 * 60_000;
const MEMOIRE_MAX = 60;

const MERCI: Record<VoteResult, string> = {
  confirme: "Merci ! Ta réponse garde l'info à jour pour tout le monde.",
  en_baisse: "Merci ! S'il n'est plus là, il disparaîtra bientôt de la carte.",
  conteste: "Merci ! Pour un danger, il faut l'avis de 2 personnes pour le retirer.",
  verifie: "Merci ! Celui-ci est vérifié par une source officielle : la modération est prévenue.",
  resolu: "Merci ! Le signalement est retiré de la carte.",
  deja_vote: "Ta réponse était déjà prise en compte. Merci !",
};

interface Memoire {
  ids: string[];
  derniere: number;
}

function lireMemoire(): Memoire {
  try {
    const m = JSON.parse(window.localStorage.getItem(CLE) ?? "null") as Memoire | null;
    if (m && Array.isArray(m.ids)) return m;
  } catch {
    // illisible : on repart de zéro
  }
  return { ids: [], derniere: 0 };
}

function noterDemande(id: string) {
  const m = lireMemoire();
  const memoire: Memoire = { ids: [id, ...m.ids.filter((x) => x !== id)].slice(0, MEMOIRE_MAX), derniere: Date.now() };
  try {
    window.localStorage.setItem(CLE, JSON.stringify(memoire));
  } catch {
    // stockage indisponible : la demande pourra revenir
  }
}

export function DemandeConfirmation({
  reports,
  position,
  onVoted,
}: {
  reports: Report[];
  position: GeoPosition | null;
  onVoted: (id: string, patch: Partial<Report> | null) => void;
}) {
  const [demande, setDemande] = useState<Report | null>(null);
  const [busy, setBusy] = useState<Vote | null>(null);
  const [merci, setMerci] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  // Cherche un signalement à faire confirmer (une seule demande à la fois).
  useEffect(() => {
    if (demande || merci || !position) return;
    if (position.accuracy > PRECISION_MAX_M) return;
    if (position.speed != null && position.speed > VITESSE_MAX_MS) return;
    const m = lireMemoire();
    if (Date.now() - m.derniere < INTERVALLE_MS) return;
    const proche = reports
      .filter(
        (r) =>
          r.type !== "sos" &&
          r.active !== false &&
          !r.isMine &&
          !r.myVote &&
          new Date(r.expiresAt).getTime() > Date.now() &&
          !m.ids.includes(r.id),
      )
      .map((r) => ({ r, d: distanceM(position, r) }))
      .filter((x) => x.d <= DISTANCE_MAX_M)
      .sort((a, b) => a.d - b.d)[0];
    if (!proche) return;
    noterDemande(proche.r.id);
    setDemande({ ...proche.r, distanceM: proche.d });
  }, [reports, position, demande, merci]);

  // Le merci s'efface tout seul.
  useEffect(() => {
    if (!merci) return;
    const t = window.setTimeout(() => setMerci(null), 6_000);
    return () => window.clearTimeout(t);
  }, [merci]);

  async function repondre(v: Vote) {
    if (!demande || busy) return;
    setBusy(v);
    setErreur(null);
    const avant = idsBadges();
    try {
      const out = await voteOnReport(demande.id, v, position);
      const badges = texteNouveauxBadges(nouveauxBadges(avant));
      setMerci(`${MERCI[out.resultat]}${badges ? ` ${badges}` : ""}`);
      onVoted(
        demande.id,
        out.resolu
          ? null
          : { confirmations: out.confirmations, infirmations: out.infirmations, expiresAt: out.expiresAt, myVote: v },
      );
      setDemande(null);
    } catch (e) {
      setErreur(errorMessage(e, "La réponse n'a pas pu être envoyée — vérifie ta connexion."));
    } finally {
      setBusy(null);
    }
  }

  if (merci) {
    return (
      <div role="status" className="mx-4 mb-2 flex items-center gap-3 rounded-2xl border border-ok/40 bg-ok/10 px-3 py-2.5">
        <Cagou size={40} />
        <p className="flex-1 text-[14px] leading-snug">{merci}</p>
      </div>
    );
  }
  if (!demande) return null;

  const ou = [demande.place, formatDistance(demande.distanceM)].filter(Boolean).join(" · ");
  return (
    <section
      aria-label="Tu passes par là ?"
      className="mx-4 mb-2 rounded-2xl border border-lagoon/40 bg-panel px-3 py-3 animate-pop-in"
    >
      <div className="flex items-start gap-3">
        <Cagou size={44} />
        <div className="flex-1 min-w-0">
          <p className="font-display font-semibold text-[16px]">Tu passes par là ?</p>
          <p className="text-[14px] text-mist-dim truncate">
            {demande.label}
            {ou ? ` · ${ou}` : ""}
          </p>
          <p className="mt-0.5 text-[14px]">C&apos;est toujours là ?</p>
        </div>
        <button
          type="button"
          onClick={() => setDemande(null)}
          aria-label="Je ne sais pas"
          className="w-11 h-11 -mr-2 -mt-2 flex items-center justify-center text-mist-dim"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => repondre("present")}
          className="min-h-[48px] rounded-xl bg-primary text-[15px] font-semibold text-white disabled:opacity-50"
        >
          {busy === "present" ? "Envoi…" : "Toujours là"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => repondre("termine")}
          className="min-h-[48px] rounded-xl border border-line bg-panel-2 text-[15px] font-semibold text-mist disabled:opacity-50"
        >
          {busy === "termine" ? "Envoi…" : "C'est terminé"}
        </button>
      </div>
      {erreur && (
        <p className="mt-2 text-[13px] text-danger" role="alert">
          {erreur}
        </p>
      )}
    </section>
  );
}
