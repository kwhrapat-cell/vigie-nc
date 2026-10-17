"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { subscribeDemo } from "./demo-store";
import { errorMessage, fetchNearby } from "./reports-api";
import { distanceM, LatLng } from "./geo";
import { Report } from "./types";

// Filet de sécurité en plus du temps réel : fait disparaître les
// signalements expirés et rattrape une connexion temps réel coupée.
const REFRESH_EVERY_MS = 60_000;

// Le temps réel ne transporte aucun contenu : seulement une case de ~11 km
// (position arrondie à 0,1°, voir vigie_signal dans schema.sql). On ne
// recharge que si cette case touche la zone affichée : la moitié de la
// diagonale d'une case (~8 km) + une marge.
const CELL_MARGIN_M = 10_000;

// Petit délai au hasard avant de recharger : quand un signalement change
// pendant un cyclone, tous les téléphones ne frappent pas la base à la
// même milliseconde.
const MAX_JITTER_MS = 1_500;

export type LiveStatus = "loading" | "ready" | "error";

/**
 * Signalements actifs autour de `center`, tenus à jour en direct
 * (Supabase Realtime) sans recharger la page.
 */
export function useLiveReports(center: LatLng | null, radiusM: number) {
  const [reports, setReports] = useState<Report[]>([]);
  const [status, setStatus] = useState<LiveStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const data = await fetchNearby(center, radiusM);
      if (id !== requestId.current) return; // réponse périmée
      setReports(data);
      setStatus("ready");
      setError(null);
      setUpdatedAt(new Date());
    } catch (e) {
      if (id !== requestId.current) return;
      setError(errorMessage(e, "Impossible de charger les signalements — vérifie ta connexion."));
      setStatus((s) => (s === "loading" ? "error" : s));
    }
  }, [center, radiusM]);

  // Toujours appeler la version la plus récente depuis les abonnements.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const zoneRef = useRef({ center, radiusM });
  zoneRef.current = { center, radiusM };

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (timer) return; // un rechargement est déjà prévu
      timer = setTimeout(() => {
        timer = null;
        refreshRef.current();
      }, 400 + Math.random() * MAX_JITTER_MS);
    };

    const interval = setInterval(() => refreshRef.current(), REFRESH_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);

    let unsubscribe: () => void;
    if (supabase) {
      const client = supabase;
      const channel = client
        .channel("vigie-signal")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "vigie_signal" },
          (payload) => {
            const { center: c, radiusM: r } = zoneRef.current;
            const row = payload.new as { cellule_lat?: unknown; cellule_lng?: unknown } | undefined;
            const lat = row?.cellule_lat;
            const lng = row?.cellule_lng;
            // Vue « toute la Calédonie », ou case inconnue : on recharge.
            if (!c || typeof lat !== "number" || typeof lng !== "number") {
              scheduleRefresh();
              return;
            }
            if (distanceM(c, { lat, lng }) <= r + CELL_MARGIN_M) scheduleRefresh();
          },
        )
        .subscribe();
      unsubscribe = () => {
        client.removeChannel(channel);
      };
    } else {
      unsubscribe = subscribeDemo(scheduleRefresh);
    }

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe();
    };
  }, []);

  /** Mise à jour immédiate d'un signalement après un vote. */
  const patchReport = useCallback((id: string, patch: Partial<Report> | null) => {
    setReports((list) =>
      patch === null
        ? list.filter((r) => r.id !== id)
        : list.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }, []);

  return { reports, status, error, updatedAt, refresh, patchReport };
}
