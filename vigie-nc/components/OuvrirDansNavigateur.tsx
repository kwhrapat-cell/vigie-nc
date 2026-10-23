"use client";

import { useState } from "react";
import type { AppliIntegree } from "@/lib/navigateur-integre";

/**
 * Explique comment sortir du navigateur intégré (Facebook, Messenger…)
 * pour installer Vigie NC ou recevoir les alertes, avec un bouton pour
 * copier le lien au cas où le menu ne propose rien.
 */
export function OuvrirDansNavigateur({ appli, pour }: { appli: AppliIntegree; pour: string }) {
  const [copie, setCopie] = useState<"ok" | "echec" | null>(null);
  const iphone = typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);
  const navigateur = iphone ? "Safari" : "Chrome";

  async function copier() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopie("ok");
    } catch {
      setCopie("echec");
    }
  }

  return (
    <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5">
      <p className="text-[12.5px] font-semibold text-mist">Tu es dans {appli}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-mist-dim">
        Pour {pour}, ouvre Vigie NC dans <strong className="text-mist">{navigateur}</strong> : touche les trois points{" "}
        <strong className="text-mist">{iphone ? "•••" : "⋮"}</strong> en haut, puis{" "}
        <strong className="text-mist">« Ouvrir dans le navigateur »</strong>{" "}(ou « Ouvrir dans {navigateur} »).
      </p>
      <button
        type="button"
        onClick={copier}
        className="mt-2 min-h-[44px] w-full rounded-lg border border-line bg-panel text-[13px] font-semibold text-mist"
      >
        Copier le lien
      </button>
      {copie === "ok" && (
        <p className="mt-1.5 text-[11.5px] text-ok">Lien copié : colle-le dans {navigateur}.</p>
      )}
      {copie === "echec" && (
        <p className="mt-1.5 text-[11.5px] text-mist-dim break-all">
          Recopie ce lien dans {navigateur} : {typeof window !== "undefined" ? window.location.href : ""}
        </p>
      )}
    </div>
  );
}
