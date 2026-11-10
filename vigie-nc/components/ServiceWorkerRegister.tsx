"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/push";
import { demoActive } from "@/lib/demo";

// Préparation de l'ouverture sans réseau (public/sw.js, message
// « prechauffer ») : une fois par version du site, et une fois par jour au
// plus, quelques secondes après l'ouverture pour ne pas ralentir la carte.
const PREPARATION_CLE = "vigie-nc:prechauffe";
const PREPARATION_JOUR_MS = 24 * 3_600_000;
const PREPARATION_APRES_MS = 15_000;

/** Empreinte de la version du site : la liste des fichiers de la page. */
function versionDuSite(): string {
  const srcs = Array.from(document.scripts)
    .map((s) => s.src)
    .filter((src) => src.includes("/_next/static/"))
    .sort()
    .join("|");
  let h = 0;
  for (let i = 0; i < srcs.length; i++) h = (h * 31 + srcs.charCodeAt(i)) | 0;
  return String(h);
}

async function preparerHorsLigne(): Promise<void> {
  if (demoActive() || !navigator.onLine) return;
  // « Économie de données » demandée par le téléphone : on n'ajoute rien.
  const connexion = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connexion?.saveData) return;
  const version = versionDuSite();
  try {
    const raw = window.localStorage.getItem(PREPARATION_CLE);
    const avant = raw ? (JSON.parse(raw) as { version?: string; at?: number }) : null;
    if (avant && avant.version === version && typeof avant.at === "number" && Date.now() - avant.at < PREPARATION_JOUR_MS) {
      return;
    }
  } catch {
    // relecture impossible : on prépare
  }
  const reg = await navigator.serviceWorker.ready;
  if (!reg.active) return;
  reg.active.postMessage({ type: "prechauffer" });
  try {
    window.localStorage.setItem(PREPARATION_CLE, JSON.stringify({ version, at: Date.now() }));
  } catch {
    // sans stockage, on préparera à la prochaine ouverture : sans conséquence
  }
}

/**
 * Installe le service worker (notifications, ouverture sans réseau) dès
 * l'ouverture de l'appli, puis prépare l'accueil, Signaler et SOS pour
 * qu'ils s'ouvrent sans réseau.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    let minuteur: number | undefined;
    void registerServiceWorker().then((reg) => {
      if (!reg) return;
      minuteur = window.setTimeout(() => {
        void preparerHorsLigne().catch(() => undefined);
      }, PREPARATION_APRES_MS);
    });
    return () => window.clearTimeout(minuteur);
  }, []);
  return null;
}
