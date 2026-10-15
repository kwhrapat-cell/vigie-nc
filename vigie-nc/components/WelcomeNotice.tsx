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

const POINTS = [
  {
    title: "Une info citoyenne, à vérifier",
    text: "Les signalements viennent des usagers. Ils peuvent être faux ou dépassés : ils ne remplacent pas les consignes officielles.",
  },
  {
    title: "Pas de téléphone au volant",
    text: "Signale à l'arrêt, en sécurité, ou laisse faire un passager.",
  },
  {
    title: "En cas d'urgence",
    text: "Vigie NC ne prévient pas les secours : appelle le 15, le 17 ou le 18.",
  },
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
        <h2 id="welcome-title" className="mt-4 font-display font-semibold text-[19px] leading-tight">
          Bienvenue sur Vigie NC
        </h2>
        <p className="mt-1 text-[12.5px] text-mist-dim">
          L&apos;état des routes en direct, signalé anonymement par les Calédoniens.
        </p>

        <ul className="mt-4 flex flex-col gap-3">
          {POINTS.map((p, i) => (
            <li key={p.title} className="flex gap-3">
              <span
                className={`mt-0.5 w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[12px] font-semibold ${
                  i === 2 ? "bg-danger/15 text-danger" : "bg-lagoon/15 text-lagoon"
                }`}
              >
                {i + 1}
              </span>
              <span>
                <span className="block text-[13.5px] font-semibold">{p.title}</span>
                <span className="block text-[12px] text-mist-dim leading-relaxed">{p.text}</span>
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[11px] text-mist-dim leading-relaxed">
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
          J&apos;ai compris
        </PrimaryButton>
      </div>
    </div>
  );
}
