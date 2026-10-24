"use client";

import { useEffect, useState } from "react";
import { Cagou } from "./Cagou";
import { fetchReport } from "@/lib/reports-api";
import {
  aVerifier,
  idsBadges,
  noterNouvelles,
  noterOuverture,
  nouveauxBadges,
  NouvelleConfirmation,
  texteNouveauxBadges,
} from "@/lib/impact";
import { REPORT_TYPE_LABELS } from "@/lib/types";

// Bandeau « Ton signalement a servi » sur l'accueil : à l'ouverture (au
// plus toutes les 10 min), on relit quelques-uns de MES derniers
// signalements (gardés sur le téléphone, lib/impact.ts) par la même
// lecture publique que la fiche d'un signalement. Si d'autres personnes
// les ont confirmés, on le dit, avec un merci du cagou.

const DUREE_MS = 20_000;

export function texteConfirmation(n: NouvelleConfirmation): string {
  const quoi = `ton signalement « ${REPORT_TYPE_LABELS[n.signalement.type]} »${
    n.signalement.lieu ? ` (${n.signalement.lieu})` : ""
  }`;
  return n.total > 1
    ? `${n.total} personnes ont confirmé ${quoi}. Merci, tu aides tout le monde sur la route !`
    : `Quelqu'un a confirmé ${quoi}. Merci, tu aides tout le monde sur la route !`;
}

export function ImpactBanner({ onOpen }: { onOpen: (id: string) => void }) {
  const [nouvelle, setNouvelle] = useState<{ id: string; texte: string; badges: string } | null>(null);

  useEffect(() => {
    noterOuverture();
    const liste = aVerifier();
    if (!liste || liste.length === 0) return;
    let annule = false;
    (async () => {
      const avant = idsBadges();
      let meilleure: NouvelleConfirmation | null = null;
      for (const s of liste) {
        try {
          const r = await fetchReport(s.id);
          if (annule) return;
          if (!r) {
            noterNouvelles(s.id, s.confirmationsVues ?? 0, false);
            continue;
          }
          const n = noterNouvelles(r.id, r.confirmations, r.active !== false);
          if (n && (!meilleure || n.total > meilleure.total)) meilleure = n;
        } catch {
          return; // pas de réseau : on réessaiera à la prochaine ouverture
        }
      }
      if (annule || !meilleure) return;
      setNouvelle({
        id: meilleure.signalement.id,
        texte: texteConfirmation(meilleure),
        badges: texteNouveauxBadges(nouveauxBadges(avant)),
      });
    })();
    return () => {
      annule = true;
    };
  }, []);

  useEffect(() => {
    if (!nouvelle) return;
    const t = window.setTimeout(() => setNouvelle(null), DUREE_MS);
    return () => window.clearTimeout(t);
  }, [nouvelle]);

  if (!nouvelle) return null;
  return (
    <div
      role="status"
      className="mx-4 mb-2 flex items-center gap-3 rounded-2xl border border-lagoon/40 bg-lagoon/10 px-3 py-2.5 animate-pop-in"
    >
      <Cagou size={48} />
      <div className="flex-1 min-w-0">
        <p className="text-[14px] leading-snug text-mist">{nouvelle.texte}</p>
        {nouvelle.badges && <p className="mt-1 text-[13px] font-semibold text-lagoon">{nouvelle.badges}</p>}
        <button
          type="button"
          onClick={() => {
            onOpen(nouvelle.id);
            setNouvelle(null);
          }}
          className="mt-1 min-h-[36px] text-[14px] font-semibold text-lagoon underline"
        >
          Voir le signalement
        </button>
      </div>
      <button
        type="button"
        onClick={() => setNouvelle(null)}
        aria-label="Fermer"
        className="self-start w-11 h-11 -mr-2 -mt-1 flex items-center justify-center text-mist-dim"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
