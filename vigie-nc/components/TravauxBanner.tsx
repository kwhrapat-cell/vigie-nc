"use client";

import { useEffect, useRef, useState } from "react";
import { TypeTile } from "./ui";
import { distanceM, formatAge, formatDistance, LatLng } from "@/lib/geo";
import { fetchNearby } from "@/lib/reports-api";
import { Report, TRAVAUX_BANDEAU_RAYON_M, TRAVAUX_BANDEAU_REOUVERTURE_MS } from "@/lib/types";

// Bandeau de l'accueil : les travaux en cours près de toi, montrés à
// l'ouverture de l'appli (juste avant de prendre la route). Il regarde
// autour de ta position au moment où tu ouvres, jusqu'à 10 km, quelle que
// soit la zone choisie sur la carte. Il ne suit pas un trajet : l'appli ne
// connaît pas ta route. Fermé, il ne revient qu'à la prochaine ouverture.
// Rien de nouveau n'est envoyé : la même recherche que la carte, plus large.

export function TravauxBanner({
  position,
  onOpen,
}: {
  position: LatLng | null;
  onOpen: (report: Report) => void;
}) {
  const [travaux, setTravaux] = useState<Report[]>([]);
  const [closed, setClosed] = useState(false);
  const [index, setIndex] = useState(0);
  // Numéro de l'ouverture en cours (0 = chargement de la page).
  const [opening, setOpening] = useState(0);
  const searchedFor = useRef(-1);
  const requestId = useRef(0);
  const hiddenAt = useRef<number | null>(null);
  const positionRef = useRef(position);
  positionRef.current = position;

  // Revenir sur l'appli après une longue pause = nouvelle ouverture.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      const since = hiddenAt.current;
      hiddenAt.current = null;
      if (since != null && Date.now() - since >= TRAVAUX_BANDEAU_REOUVERTURE_MS) {
        setOpening((n) => n + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Une seule recherche par ouverture, dès que la position est connue
  // (pas à chaque mouvement du GPS).
  const hasPosition = position != null;
  useEffect(() => {
    const center = positionRef.current;
    if (!center || searchedFor.current === opening) return;
    searchedFor.current = opening;
    const id = ++requestId.current;
    const from = { lat: center.lat, lng: center.lng };

    fetchNearby(from, TRAVAUX_BANDEAU_RAYON_M)
      .then((list) => {
        if (id !== requestId.current) return;
        const now = Date.now();
        const found = list
          .filter((r) => r.type === "travaux" && r.active !== false && new Date(r.expiresAt).getTime() > now)
          .map((r) => ({ ...r, distanceM: r.distanceM ?? distanceM(from, r) }))
          .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
        setTravaux(found);
        setIndex(0);
        setClosed(false);
      })
      .catch(() => {
        // Sans réseau : pas de bandeau, la carte affiche déjà son message.
      });
  }, [hasPosition, opening]);

  if (closed || travaux.length === 0) return null;

  const i = Math.min(index, travaux.length - 1);
  const t = travaux[i];
  const detail = [t.place, `signalé ${formatAge(t.createdAt)}`].filter(Boolean).join(" · ");

  return (
    <div className="mx-4 mb-2">
      <section
        aria-label="Travaux près de toi"
        className="flex items-center gap-1 rounded-xl border border-ochre/40 bg-ochre/10 pl-2.5"
      >
        <button
          type="button"
          onClick={() => onOpen(t)}
          className="flex flex-1 min-w-0 min-h-[48px] items-center gap-2.5 py-1.5 text-left"
        >
          <TypeTile type="travaux" size={30} />
          <span className="flex-1 min-w-0">
            <span className="block truncate text-[13px] font-semibold text-mist">
              Travaux {formatDistance(t.distanceM) ?? "près de toi"}
            </span>
            <span className="block truncate text-[11px] text-mist-dim">{detail}</span>
          </span>
        </button>
        {travaux.length > 1 && (
          <button
            type="button"
            onClick={() => setIndex((i + 1) % travaux.length)}
            aria-label="Travaux suivants"
            className="min-h-[44px] px-1.5 text-[11px] font-medium text-ochre"
          >
            {i + 1}/{travaux.length} ›
          </button>
        )}
        <button
          type="button"
          onClick={() => setClosed(true)}
          aria-label="Fermer le bandeau des travaux"
          className="w-11 h-11 shrink-0 flex items-center justify-center text-mist-dim"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </section>
    </div>
  );
}
