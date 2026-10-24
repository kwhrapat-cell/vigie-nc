"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GeoPosition } from "./useGeolocation";

export type WatchStatus = "pending" | "active" | "denied" | "unavailable" | "unsupported";

/**
 * Suit la position du téléphone tant que la carte est ouverte (utile en
 * voiture : la zone surveillée avance avec toi). S'arrête dès que la page
 * est quittée — aucun suivi en arrière-plan.
 */
export function useWatchPosition() {
  const [status, setStatus] = useState<WatchStatus>("pending");
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const watchId = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchId.current !== null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(watchId.current);
    }
    watchId.current = null;
  }, []);

  const start = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }
    stop();
    setStatus((s) => (s === "active" ? s : "pending"));
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
        });
        setStatus("active");
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          stop();
          setStatus("denied");
        } else {
          // Signal GPS perdu (tunnel, intérieur) : on garde la dernière
          // position connue et on continue d'écouter.
          setStatus((s) => (s === "active" ? s : "unavailable"));
        }
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
  }, [stop]);

  useEffect(() => {
    start();
    return stop;
  }, [start, stop]);

  return { status, position, retry: start };
}
