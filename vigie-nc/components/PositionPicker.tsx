"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { LatLng } from "@/lib/geo";
import { MAP_STYLES, EMPRISE_TERRITOIRE } from "@/lib/map-styles";
import { readMapStyle } from "@/lib/preferences";

const PIN_SVG = `<svg class="pick-pin" viewBox="0 0 34 44" aria-hidden="true">
  <path d="M17 1.5A15.5 15.5 0 0 1 32.5 17c0 11-15.5 25.5-15.5 25.5S1.5 28 1.5 17A15.5 15.5 0 0 1 17 1.5z" fill="#E5484D" stroke="#081317" stroke-width="2"/>
  <circle cx="17" cy="17" r="5.5" fill="#fff"/>
</svg>`;

/**
 * Petite carte de l'étape « Localisation » : repère rouge déplaçable
 * (glisser, ou toucher la carte) et point bleu de la position GPS.
 * Avec `radiusM` (écran Alertes), un cercle montre la zone couverte.
 */
export function PositionPicker({
  value,
  gps,
  onChange,
  radiusM,
  label = "Position du signalement",
}: {
  value: LatLng | null;
  gps: (LatLng & { accuracy: number }) | null;
  onChange: (p: LatLng) => void;
  radiusM?: number;
  label?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const pinRef = useRef<Leaflet.Marker | null>(null);
  const gpsRef = useRef<Leaflet.Marker | null>(null);
  const accuracyRef = useRef<Leaflet.Circle | null>(null);
  const zoneRef = useRef<Leaflet.Circle | null>(null);
  const centeredOnce = useRef(false);
  const [ready, setReady] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await import("leaflet");
      const L = ((mod as unknown as { default?: typeof Leaflet }).default ?? mod) as typeof Leaflet;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, { zoomControl: false, minZoom: 6 });
      map.fitBounds(EMPRISE_TERRITOIRE, { padding: [8, 8] });
      // Même fond que celui choisi sur la carte d'accueil
      const style = readMapStyle();
      containerRef.current.setAttribute("data-fond", style);
      for (const spec of MAP_STYLES[style].layers) {
        L.tileLayer(spec.url, spec.options).addTo(map);
      }
      map.on("click", (e: Leaflet.LeafletMouseEvent) =>
        onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }),
      );

      leafletRef.current = L;
      mapRef.current = map;
      setReady(true);
      setTimeout(() => map.invalidateSize(), 200);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      pinRef.current = null;
      gpsRef.current = null;
      accuracyRef.current = null;
      zoneRef.current = null;
      centeredOnce.current = false;
      setReady(false);
    };
  }, []);

  // Point bleu + cercle de précision du GPS
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map || !gps) return;
    const ll: [number, number] = [gps.lat, gps.lng];
    if (!gpsRef.current) {
      gpsRef.current = L.marker(ll, {
        icon: L.divIcon({ className: "", html: '<div class="user-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
        interactive: false,
      }).addTo(map);
      accuracyRef.current = L.circle(ll, {
        radius: gps.accuracy,
        color: "#3B82F6",
        weight: 1,
        opacity: 0.4,
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(map);
    } else {
      gpsRef.current.setLatLng(ll);
      accuracyRef.current?.setLatLng(ll).setRadius(gps.accuracy);
    }
  }, [ready, gps]);

  // Repère rouge déplaçable
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map || !value) return;
    const ll: [number, number] = [value.lat, value.lng];
    if (!pinRef.current) {
      pinRef.current = L.marker(ll, {
        draggable: true,
        autoPan: true,
        icon: L.divIcon({ className: "", html: PIN_SVG, iconSize: [34, 44], iconAnchor: [17, 42] }),
        keyboard: true,
        title: `${label} (déplaçable)`,
      })
        .on("dragend", () => {
          const p = pinRef.current?.getLatLng();
          if (p) onChangeRef.current({ lat: p.lat, lng: p.lng });
        })
        .addTo(map);
    } else {
      pinRef.current.setLatLng(ll);
    }

    // Cercle de la zone couverte (écran Alertes)
    if (radiusM) {
      if (!zoneRef.current) {
        zoneRef.current = L.circle(ll, {
          radius: radiusM,
          color: "#22B8B0",
          weight: 1.5,
          opacity: 0.8,
          fillOpacity: 0.1,
          interactive: false,
        }).addTo(map);
      } else {
        zoneRef.current.setLatLng(ll).setRadius(radiusM);
      }
    } else if (zoneRef.current) {
      zoneRef.current.remove();
      zoneRef.current = null;
    }

    if (!centeredOnce.current) {
      if (zoneRef.current) map.fitBounds(zoneRef.current.getBounds(), { padding: [12, 12] });
      else map.setView(ll, 16);
      centeredOnce.current = true;
    } else if (!map.getBounds().contains(ll)) {
      map.panTo(ll);
    }
  }, [ready, value, radiusM, label]);

  // Nouveau rayon : la carte s'ajuste pour montrer tout le cercle.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !zoneRef.current) return;
    map.fitBounds(zoneRef.current.getBounds(), { padding: [12, 12] });
  }, [ready, radiusM]);

  return <div ref={containerRef} className="absolute inset-0 isolate" aria-label={`Carte : ${label.toLowerCase()}`} />;
}
