"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo, PrimaryButton } from "./ui";

// Changer la version si le texte change de façon importante : l'écran
// sera montré à nouveau à tout le monde.
const STORAGE_KEY = "vigie-nc:avertissement-v1";

function alreadySeen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // stockage indisponible : l'écran reviendra à la prochaine visite
  }
}

// D'abord ce que l'appli apporte, puis les trois règles, une ligne chacune.
const REGLES = [
  { texte: "Info des usagers : elle peut se tromper, vérifie sur place.", urgent: false },
  { texte: "Au volant, pas de téléphone en main : le mode conduite parle pour toi.", urgent: false },
  { texte: "Urgence : Vigie NC ne prévient pas les secours, appelle le 15, le 17 ou le 18.", urgent: true },
];

/** Écran d'accueil montré une seule fois : ce qu'est (et n'est pas) Vigie NC. */
export function WelcomeNotice() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!alreadySeen()) setOpen(true);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-void/75">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        className="w-full max-w-md rounded-t-[22px] bg-panel border-t border-line px-5 pt-5 max-h-[92dvh] overflow-y-auto"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
      >
        <Logo withTagline />
        <h2 id="welcome-title" className="mt-4 font-display font-bold text-[24px] leading-tight">
          Sache ce qui t&apos;attend sur la route
        </h2>
        <p className="mt-2 text-[16px] text-mist leading-relaxed">
          Accidents, inondations, routes coupées, travaux : signalés en direct par les Calédoniens. Gratuit et
          sans compte.
        </p>

        <ul className="mt-4 flex flex-col gap-2.5" aria-label="Les règles">
          {REGLES.map((r) => (
            <li key={r.texte} className="flex items-start gap-2.5 text-[15px] leading-snug">
              <span
                className={`mt-[7px] w-2 h-2 shrink-0 rounded-full ${r.urgent ? "bg-danger" : "bg-lagoon"}`}
                aria-hidden="true"
              />
              <span className={r.urgent ? "text-mist" : "text-mist-dim"}>{r.texte}</span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[13px] text-mist-dim leading-relaxed">
          En continuant, tu acceptes les{" "}
          <Link href="/conditions" className="text-lagoon underline">
            conditions d&apos;utilisation
          </Link>{" "}
          et la{" "}
          <Link href="/confidentialite" className="text-lagoon underline">
            politique de confidentialité
          </Link>
          .
        </p>

        <PrimaryButton
          className="mt-4"
          onClick={() => {
            markSeen();
            setOpen(false);
          }}
        >
          C&apos;est parti
        </PrimaryButton>
      </div>
    </div>
  );
}
