"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { subscribeDemo } from "./demo-store";
import { errorMessage, fetchNearby } from "./reports-api";
import { LatLng } from "./geo";
import { Report } from "./types";

// Filet de sécurité en plus du temps réel : fait disparaître les
// signalements expirés et rattrape une connexion temps réel coupée.
const REFRESH_EVERY_MS = 60_000;

export type LiveStatus = "loading" | "ready" | "error";

/**
 * Signalements actifs autour de `center`, tenus à jour en direct
 * (Supabase Realtime) sans recharger la page.
 */
export function useLiveReports(center: LatLng | null, radiusM: number) {
  const [reports, setReports] = useState<Report[]>([]);
  const [status, setStatus] = useState<LiveStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const data = await fetchNearby(center, radiusM);
      if (id !== requestId.current) return; // réponse périmée
      setReports(data);
      setStatus("ready");
      setError(null);
    } catch (e) {
      if (id !== requestId.current) return;
      setError(errorMessage(e, "Impossible de charger les signalements — vérifie ta connexion."));
      setStatus((s) => (s === "loading" ? "error" : s));
    }
  }, [center, radiusM]);

  // Toujours appeler la version la plus récente depuis les abonnements.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => refreshRef.current(), 400);
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
        .channel("vigie-reports")
        .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, scheduleRefresh)
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

  return { reports, status, error, refresh, patchReport };
}
