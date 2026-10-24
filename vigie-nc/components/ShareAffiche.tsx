"use client";

import { useState } from "react";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const LINK = `${SITE_URL}/affiche`;
const TEXT = "Découvre Vigie NC : l'état des routes en Nouvelle-Calédonie, en direct. Gratuit et sans compte.";

/** Partager le lien de l'affiche (menu du téléphone, sinon WhatsApp). */
export function ShareAffiche() {
  const [copied, setCopied] = useState(false);

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: SITE_NAME, text: TEXT, url: LINK });
        return;
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return; // partage annulé
    }
    // Pas de menu de partage (ordinateur…) : WhatsApp, sinon lien copié
    try {
      await navigator.clipboard.writeText(LINK);
      setCopied(true);
    } catch {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${TEXT} ${LINK}`)}`, "_blank", "noopener");
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="rounded-xl border border-line bg-panel-2 py-3 text-center text-[15px] font-semibold"
    >
      {copied ? "Lien copié ✓" : "Partager le lien"}
    </button>
  );
}
