"use client";

import type { Ref } from "react";
import { Category, CATEGORY_HEX, CATEGORY_LABELS } from "@/lib/types";
import { Logo } from "./ui";

const CATEGORIES: Category[] = ["danger", "perturbation", "meteo"];

/**
 * Accueil sur ordinateur, panneau de gauche replié : il ne reste que ce
 * petit bandeau sur la carte (logo, chiffres en cours, bouton pour rouvrir
 * la liste et le menu). Vue d'ensemble pour une mairie ou la DITTT.
 */
export function BandeauPanneauReplie({
  counts,
  onOuvrir,
  boutonRef,
}: {
  counts: Record<Category, number>;
  onOuvrir: () => void;
  boutonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <div className="hidden lg:flex items-center gap-3 rounded-2xl border border-line bg-void/95 backdrop-blur py-1.5 pl-3 pr-1.5 shadow-[0_10px_24px_-12px_rgba(0,0,0,0.8)]">
      <Logo />
      <span className="w-px h-6 bg-line" aria-hidden="true" />
      <span className="flex items-center gap-3 text-[13.5px] text-mist-dim">
        {CATEGORIES.map((c) => (
          <span key={c}>
            <b className="font-display font-bold text-[16px]" style={{ color: CATEGORY_HEX[c] }}>
              {counts[c]}
            </b>{" "}
            {(counts[c] > 1 ? CATEGORY_LABELS[c].many : CATEGORY_LABELS[c].one).toLowerCase()}
          </span>
        ))}
      </span>
      <button
        ref={boutonRef}
        type="button"
        onClick={onOuvrir}
        aria-expanded={false}
        aria-controls="panneau-accueil"
        className="flex items-center gap-1.5 min-h-[40px] rounded-xl bg-primary hover:bg-primary-strong px-3 text-[13.5px] font-semibold text-white"
      >
        Liste et menu
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}
