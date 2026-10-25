"use client";

import { useEffect, useRef, useState } from "react";
import type { LatLng } from "./geo";
import { fetchVigiesAutour, type VigiesAutour } from "./reports-api";

// Rafraîchi toutes les 2 minutes tant que l'appli est affichée (la base
// n'écrit qu'une fois par minute au plus).
const INTERVALLE_MS = 2 * 60_000;

/** « 12 vigies actives autour de toi » (null tant qu'on ne sait pas, ou rien à montrer). */
export function useVigiesAutour(position: LatLng | null): VigiesAutour | null {
  const [vigies, setVigies] = useState<VigiesAutour | null>(null);
  const positionRef = useRef(position);
  positionRef.current = position;
  const aPosition = position != null;

  useEffect(() => {
    if (!aPosition) return;
    let annule = false;
    const demander = () => {
      const p = positionRef.current;
      if (!p || document.visibilityState !== "visible") return;
      fetchVigiesAutour({ lat: p.lat, lng: p.lng })
        .then((v) => {
          if (!annule) setVigies(v);
        })
        .catch(() => {
          // pas de réseau ou de session : on garde le dernier chiffre
        });
    };
    demander();
    const t = window.setInterval(demander, INTERVALLE_MS);
    const auRetour = () => {
      if (document.visibilityState === "visible") demander();
    };
    document.addEventListener("visibilitychange", auRetour);
    return () => {
      annule = true;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", auRetour);
    };
  }, [aPosition]);

  return vigies;
}
