"use client";

import { useEffect } from "react";
import { demoActive } from "@/lib/demo";
import {
  AireCarte,
  ChoixCarte,
  lireAires,
  lireFiche,
  majAutoActive,
  planifier,
  telecharger,
} from "@/lib/carte-hors-ligne";
import { lireTrajet } from "@/lib/trajet";

// Mise à jour toute seule de la carte sans réseau (réglage « Mettre à jour
// toute seule une fois par mois, en Wi-Fi », coché par défaut) : une minute
// après l'ouverture, au plus une vérification par jour, seulement si le
// téléphone dit être en Wi-Fi (Android ; sur iPhone, l'écran Carte sans
// réseau propose « Mettre à jour » quand elle a plus d'un mois).
const VERIF_CLE = "vigie-nc:carte-verif";
const VERIF_JOUR_MS = 24 * 3_600_000;
const APRES_MS = 60_000;
/** Une carte plus récente que ça n'est pas remplacée. */
const AGE_MIN_MS = 25 * 24 * 3_600_000;

function enWifi(): boolean {
  const c = (navigator as Navigator & { connection?: { type?: string; saveData?: boolean } }).connection;
  return !c?.saveData && (c?.type === "wifi" || c?.type === "ethernet");
}

function choixDe(a: AireCarte): ChoixCarte | null {
  if (a.id === "nc") return { id: "nc" };
  if (a.id === "zone") return a.centre ? { id: "zone", centre: a.centre, lieu: a.lieu ?? null } : null;
  const t = lireTrajet();
  return t ? { id: "trajet", points: t.points } : null;
}

async function verifier(): Promise<void> {
  if (demoActive() || !navigator.onLine || !majAutoActive() || !enWifi()) return;
  const aMettreAJour = lireAires().filter((a) => a.fini && Date.now() - a.at > AGE_MIN_MS);
  if (aMettreAJour.length === 0) return;
  try {
    const derniere = Number(window.localStorage.getItem(VERIF_CLE) ?? 0);
    if (Date.now() - derniere < VERIF_JOUR_MS) return;
    window.localStorage.setItem(VERIF_CLE, String(Date.now()));
  } catch {
    return;
  }
  const fiche = await lireFiche();
  for (const a of aMettreAJour) {
    if (a.fichier === fiche.fichier) continue;
    const choix = choixDe(a);
    if (!choix) continue;
    await telecharger(await planifier(choix));
  }
}

/** Dans le layout, rien à l'écran. */
export function MajCarteHorsLigne() {
  useEffect(() => {
    const t = window.setTimeout(() => {
      void verifier().catch(() => undefined);
    }, APRES_MS);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
