"use client";

import { useEffect, useRef, useState } from "react";
import { TypeTile } from "./ui";
import { aujourdhuiLocal, estChantier, libelleFinChantier } from "@/lib/chantier";
import { distanceM, formatAge, formatDistance, LatLng } from "@/lib/geo";
import { fetchNearby } from "@/lib/reports-api";
import { Report, TRAVAUX_BANDEAU_RAYON_M, TRAVAUX_BANDEAU_REOUVERTURE_MS } from "@/lib/types";

// Bandeau de l'accueil : les travaux en cours près de toi, montrés à
// l'ouverture de l'appli (juste avant de prendre la route). Il regarde
// autour de ta position au moment où tu ouvres, jusqu'à 10 km, quelle que
// soit la zone choisie sur la carte. Il ne suit pas un trajet : l'appli ne
// connaît pas ta route. Fermé, il ne revient qu'à la prochaine ouverture.
// Rien de nouveau n'est envoyé : la même recherche que la carte, plus large.
// Des travaux déjà montrés aujourd'hui ne reviennent pas avant demain (un
// chantier qui dure ne doit pas lasser ceux qui passent devant chaque
// jour) : la liste des travaux vus reste sur ce téléphone.

const VUS_KEY = "vigie-nc:travaux-vus";
// Un travaux compte comme « vu » après ce temps à l'écran.
const TRAVAUX_VU_APRES_MS = 2_000;
const VUS_MAX = 50;

/** Travaux déjà montrés : identifiant → jour (AAAA-MM-JJ, heure de Nouméa). */
function lireVus(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(VUS_KEY);
    const o = raw ? (JSON.parse(raw) as unknown) : {};
    return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function noterVu(id: string): void {
  try {
    const jour = aujourdhuiLocal();
    // On ne garde que les travaux vus aujourd'hui : demain, ils reviennent.
    const garde = Object.entries(lireVus())
      .filter(([cle, j]) => j === jour && cle !== id)
      .slice(-(VUS_MAX - 1));
    window.localStorage.setItem(VUS_KEY, JSON.stringify(Object.fromEntries([...garde, [id, jour]])));
  } catch {
    // stockage indisponible : le bandeau reviendra à chaque ouverture
  }
}

export function TravauxBanner({
  position,
  onOpen,
  masque = false,
  onPresence,
}: {
  position: LatLng | null;
  onOpen: (report: Report) => void;
  /** Un bandeau plus important est affiché : on attend (lib/bandeaux.ts). */
  masque?: boolean;
  onPresence?: (present: boolean) => void;
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
        const vus = lireVus();
        const jour = aujourdhuiLocal();
        const found = list
          .filter((r) => r.type === "travaux" && r.active !== false && new Date(r.expiresAt).getTime() > now)
          .filter((r) => vus[r.id] !== jour)
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

  const present = !closed && travaux.length > 0;
  useEffect(() => {
    onPresence?.(present);
  }, [present, onPresence]);
  useEffect(() => () => onPresence?.(false), [onPresence]);

  // Travaux affiché à l'écran : noté comme vu pour aujourd'hui, après
  // 2 secondes à l'écran (pas s'il n'a fait que passer avant qu'un bandeau
  // plus important prenne sa place), ou tout de suite si on le touche.
  const i = Math.min(index, Math.max(0, travaux.length - 1));
  const shownId = present && !masque ? travaux[i].id : null;
  useEffect(() => {
    if (!shownId) return;
    const t = window.setTimeout(() => noterVu(shownId), TRAVAUX_VU_APRES_MS);
    return () => window.clearTimeout(t);
  }, [shownId]);

  if (!present || masque) return null;

  const t = travaux[i];
  const chantier = estChantier(t) && t.endDate ? t.endDate : null;
  // Chantier : la date de fin d'abord, c'est l'info utile pour la route.
  const detail = (chantier ? [libelleFinChantier(chantier), t.place] : [t.place, `signalé ${formatAge(t.createdAt)}`])
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-4 mb-2">
      <section
        aria-label="Travaux près de toi"
        className="flex items-center gap-1 rounded-xl border border-ochre/40 bg-ochre/10 pl-2.5"
      >
        <button
          type="button"
          onClick={() => {
            noterVu(t.id);
            onOpen(t);
          }}
          className="flex flex-1 min-w-0 min-h-[48px] items-center gap-2.5 py-1.5 text-left"
        >
          <TypeTile type="travaux" size={30} />
          <span className="flex-1 min-w-0">
            <span className="block truncate text-[15px] font-semibold text-mist">
              {chantier ? "Chantier" : "Travaux"} {formatDistance(t.distanceM) ?? "près de toi"}
            </span>
            <span className="block truncate text-[13px] text-mist-dim">{detail}</span>
          </span>
        </button>
        {travaux.length > 1 && (
          <button
            type="button"
            onClick={() => {
              noterVu(t.id);
              setIndex((i + 1) % travaux.length);
            }}
            aria-label="Travaux suivants"
            className="min-h-[44px] px-1.5 text-[13px] font-medium text-ochre"
          >
            {i + 1}/{travaux.length} ›
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            noterVu(t.id);
            setClosed(true);
          }}
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
