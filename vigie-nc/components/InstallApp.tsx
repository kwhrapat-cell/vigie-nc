"use client";

import { useEffect, useState } from "react";

// Événement propre à Chrome / Edge / Samsung Internet sur Android : il
// permet d'ouvrir la fenêtre « Installer l'application » depuis un bouton.
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios" | "android" | "autre";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  // Les iPad récents se présentent comme un Mac avec écran tactile.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "autre";
}

function isInstalled(): boolean {
  return (
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Ajouter Vigie NC à l'écran d'accueil, comme une appli. */
export function InstallApp() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [installed, setInstalled] = useState(false);
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(isInstalled());

    const onPrompt = (e: Event) => {
      e.preventDefault(); // on garde la fenêtre pour notre bouton
      setPromptEvent(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!platform) return null;

  if (installed) {
    return <p className="text-[12px] text-ok">Vigie NC est installée sur ce téléphone.</p>;
  }

  async function install() {
    if (!promptEvent) {
      setShowSteps(true);
      return;
    }
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setPromptEvent(null);
  }

  return (
    <div>
      <button
        type="button"
        onClick={install}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-[13px] font-semibold text-white"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]" aria-hidden="true">
          <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
          <path d="M12 7.5v7M9 11.5l3 3 3-3" />
        </svg>
        {promptEvent ? "Installer Vigie NC" : "Ajouter à l'écran d'accueil"}
      </button>

      {showSteps && (
        <ol className="mt-2.5 flex flex-col gap-1.5 list-decimal pl-5 text-[12px] text-mist-dim leading-relaxed">
          {platform === "ios" ? (
            <>
              <li>
                Dans <strong className="text-mist">Safari</strong>, touche le bouton{" "}
                <strong className="text-mist">Partager</strong> (carré avec une flèche vers le haut ; parfois dans
                le menu « ••• »).
              </li>
              <li>
                Choisis <strong className="text-mist">« Sur l&apos;écran d&apos;accueil »</strong>, puis{" "}
                <strong className="text-mist">Ajouter</strong>.
              </li>
            </>
          ) : (
            <>
              <li>
                Ouvre Vigie NC dans <strong className="text-mist">Chrome</strong> et touche le menu{" "}
                <strong className="text-mist">⋮</strong>.
              </li>
              <li>
                Choisis <strong className="text-mist">« Installer l&apos;application »</strong> (ou « Ajouter à
                l&apos;écran d&apos;accueil »), puis confirme.
              </li>
              <li>
                Autre navigateur (DuckDuckGo, Samsung…) : cherche « Ajouter à l&apos;écran d&apos;accueil » dans son
                menu.
              </li>
            </>
          )}
        </ol>
      )}
    </div>
  );
}
