"use client";

import { useCallback, useState } from "react";

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy: number;
  speed?: number | null; // m/s, quand le téléphone la donne (suivi continu)
}

export type GeoStatus = "idle" | "locating" | "success" | "error" | "unsupported";

export function useGeolocation() {
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [error, setError] = useState<string | null>(null);

  const locate = useCallback((): Promise<GeoPosition> => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setStatus("unsupported");
      setError("La géolocalisation n'est pas disponible sur cet appareil.");
      return Promise.reject(new Error("unsupported"));
    }

    setStatus("locating");
    setError(null);

    return new Promise<GeoPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const p: GeoPosition = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
          setPosition(p);
          setStatus("success");
          resolve(p);
        },
        (err) => {
          setStatus("error");
          const message =
            err.code === err.PERMISSION_DENIED
              ? "Localisation refusée — autorise l'accès à la position pour continuer."
              : "Impossible d'obtenir ta position pour le moment. Réessaie.";
          setError(message);
          reject(err);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
      );
    });
  }, []);

  return { status, position, error, locate };
}
