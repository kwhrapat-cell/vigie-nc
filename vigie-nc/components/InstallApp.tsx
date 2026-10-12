"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  canPromptInstall,
  detectPlatform,
  isInstalled,
  onInstallChange,
  promptInstall,
  type Platform,
} from "@/lib/pwa";
import { PrimaryButton } from "./ui";

function Steps({ children }: { children: ReactNode }) {
  return <ol className="mt-2.5 flex flex-col gap-2 text-[12.5px] leading-snug">{children}</ol>;
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-panel-2 font-mono text-[11px] text-lagoon">
        {n}
      </span>
      <span className="pt-px">{children}</span>
    </li>
  );
}

/** Icône « Partager » d'iPhone (carré avec une flèche vers le haut). */
function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="inline w-4 h-4 -mt-0.5 text-lagoon" aria-label="Partager">
      <path d="M12 3v12M8 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-1" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Aide pour mettre Vigie NC sur l'écran d'accueil : bouton « Installer » quand
 * le navigateur le permet (Android), sinon les gestes à faire.
 */
export function InstallApp() {
  const [ready, setReady] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [platform, setPlatform] = useState<Platform>("autre");

  useEffect(() => {
    const sync = () => {
      setInstalled(isInstalled());
      setCanPrompt(canPromptInstall());
    };
    setPlatform(detectPlatform());
    sync();
    setReady(true);
    return onInstallChange(sync);
  }, []);

  if (!ready) return null;

  if (installed) {
    return (
      <p className="flex items-start gap-2 text-[12.5px] leading-snug">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="w-4 h-4 mt-0.5 shrink-0 text-ok" aria-hidden>
          <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>
          Vigie NC est sur ton écran d&apos;accueil. Ouvre-la depuis son icône : elle s&apos;affiche en plein écran,
          comme une vraie appli.
        </span>
      </p>
    );
  }

  return (
    <div>
      <p className="text-[11.5px] text-mist-dim leading-relaxed">
        Ajoute l&apos;appli sur ton écran d&apos;accueil : elle s&apos;ouvre d&apos;un geste, en plein écran. Rien à
        télécharger sur un store, et elle se met à jour toute seule.
      </p>

      {platform === "inapp" ? (
        <p className="mt-2.5 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-[12px] leading-snug">
          Tu es dans Facebook ou Messenger, qui ne permet pas d&apos;installer. Touche <b>⋯</b> en haut de l&apos;écran,
          puis <b>« Ouvrir dans le navigateur »</b>, et reviens ici.
        </p>
      ) : canPrompt ? (
        <PrimaryButton className="mt-3" onClick={() => void promptInstall()}>
          Installer Vigie NC
        </PrimaryButton>
      ) : platform === "ios" ? (
        <Steps>
          <Step n={1}>
            Dans Safari, touche le bouton <b>Partager</b> <ShareIcon /> en bas de l&apos;écran.
          </Step>
          <Step n={2}>
            Choisis <b>« Sur l&apos;écran d&apos;accueil »</b> (fais défiler la liste si besoin).
          </Step>
          <Step n={3}>
            Touche <b>« Ajouter »</b>.
          </Step>
        </Steps>
      ) : (
        <Steps>
          <Step n={1}>
            Ouvre le menu du navigateur (<b>⋮</b> ou <b>☰</b>).
          </Step>
          <Step n={2}>
            Choisis <b>« Installer l&apos;application »</b> ou <b>« Ajouter à l&apos;écran d&apos;accueil »</b>.
          </Step>
          <Step n={3}>Confirme : l&apos;icône Vigie NC apparaît avec tes autres applis.</Step>
        </Steps>
      )}
    </div>
  );
}
