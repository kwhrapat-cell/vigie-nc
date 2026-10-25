"use client";

import { useEffect, useState } from "react";
import { Cagou } from "./Cagou";
import { fetchReport } from "@/lib/reports-api";
import { avatarSvg } from "@/lib/avatar";
import { badgesManquants, Niveau, NIVEAUX, noterRang } from "@/lib/niveaux";
import {
  aVerifier,
  idsBadges,
  IMPACT_EVENT,
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

export function ImpactBanner({
  onOpen,
  masque = false,
  onPresence,
}: {
  onOpen: (id: string) => void;
  /** Un bandeau plus important est affiché : le merci attend (lib/bandeaux.ts). */
  masque?: boolean;
  onPresence?: (present: boolean) => void;
}) {
  const [nouvelle, setNouvelle] = useState<{ id: string; texte: string; badges: string } | null>(null);
  // Ton cagou vient de monter de niveau (lib/niveaux.ts) : on le fête.
  const [promotion, setPromotion] = useState<{ niveau: Niveau; rang: number; manque: number | null } | null>(null);

  useEffect(() => {
    const verifier = () => {
      const nb = idsBadges().length;
      const n = noterRang(nb);
      if (!n || n.id === "poussin") return;
      const rang = NIVEAUX.findIndex((x) => x.id === n.id);
      setPromotion({ niveau: n, rang, manque: badgesManquants(rang, nb) });
    };
    verifier();
    window.addEventListener(IMPACT_EVENT, verifier);
    return () => window.removeEventListener(IMPACT_EVENT, verifier);
  }, []);

  const present = nouvelle != null || promotion != null;
  useEffect(() => {
    onPresence?.(present);
  }, [present, onPresence]);
  useEffect(() => () => onPresence?.(false), [onPresence]);

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

  // S'efface tout seul après 20 s… d'affichage (pas pendant qu'il attend).
  useEffect(() => {
    if (!nouvelle || promotion || masque) return;
    const t = window.setTimeout(() => setNouvelle(null), DUREE_MS);
    return () => window.clearTimeout(t);
  }, [nouvelle, promotion, masque]);
  useEffect(() => {
    if (!promotion || masque) return;
    const t = window.setTimeout(() => setPromotion(null), DUREE_MS);
    return () => window.clearTimeout(t);
  }, [promotion, masque]);

  if (masque) return null;

  if (promotion) {
    const suivant = NIVEAUX[promotion.rang + 1];
    return (
      <div
        role="status"
        className="mx-4 mb-2 flex items-center gap-3 rounded-2xl border border-ochre/50 bg-ochre/10 px-3 py-2.5 animate-pop-in"
      >
        <span
          className="shrink-0"
          // Dessin fixe de lib/avatar.ts (aucune donnée saisie).
          dangerouslySetInnerHTML={{ __html: avatarSvg(promotion.rang, 44) }}
        />
        <div className="flex-1 min-w-0">
          <p className="font-display font-semibold text-[16px] text-mist">
            Ton cagou devient {promotion.niveau.nom} !
          </p>
          <p className="text-[14px] leading-snug text-mist-dim">
            {suivant && promotion.manque != null
              ? `Il te suit sur la carte. Prochain niveau : ${suivant.nom}, encore ${promotion.manque} badge${
                  promotion.manque > 1 ? "s" : ""
                }.`
              : "Le plus haut niveau. Merci pour la route !"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPromotion(null)}
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
