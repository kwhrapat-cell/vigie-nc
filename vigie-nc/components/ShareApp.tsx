"use client";

import { useState } from "react";
import { SHARE_TEXT, SITE_NAME, SITE_URL } from "@/lib/site";

const WHATSAPP_URL = `https://wa.me/?text=${encodeURIComponent(`${SHARE_TEXT} ${SITE_URL}`)}`;

/**
 * Inviter quelqu'un à utiliser Vigie NC : WhatsApp directement, ou le menu
 * de partage du téléphone (Messenger, SMS, Facebook…). L'aperçu du lien
 * (logo + texte) vient de app/opengraph-image.png.
 */
export function ShareApp() {
  const [message, setMessage] = useState<string | null>(null);

  async function shareOther() {
    setMessage(null);
    try {
      if (navigator.share) {
        await navigator.share({ title: SITE_NAME, text: SHARE_TEXT, url: SITE_URL });
        return;
      }
      await navigator.clipboard.writeText(`${SHARE_TEXT} ${SITE_URL}`);
      setMessage("Lien copié : colle-le dans le message de ton choix.");
    } catch (e) {
      // Partage annulé : rien à signaler. Sinon, on donne le lien à recopier.
      if (e instanceof Error && e.name === "AbortError") return;
      setMessage(`Copie ce lien : ${SITE_URL}`);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-lg bg-[#25D366] py-3 text-[13px] font-semibold text-void"
        >
          {/* Bulle de discussion générique (pas le logo de la marque) */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinejoin="round" className="w-[18px] h-[18px]" aria-hidden="true">
            <path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5z" />
            <path d="M8.5 10.5h7M8.5 13.5h4.5" strokeLinecap="round" />
          </svg>
          WhatsApp
        </a>
        <button
          type="button"
          onClick={shareOther}
          className="flex items-center justify-center gap-2 rounded-lg border border-line bg-panel-2 py-3 text-[13px] font-semibold"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]" aria-hidden="true">
            <path d="M12 15V3.5M7.5 8L12 3.5 16.5 8" />
            <path d="M5 12.5v6A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-6" />
          </svg>
          Autre appli
        </button>
      </div>
      {message && (
        <p className="mt-2 text-[11.5px] text-lagoon break-all" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
