"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { GRAND_NOUMEA, distanceM, LatLng } from "@/lib/geo";
import { getReliability } from "@/lib/reliability";
import { CATEGORY_HEX, Report, REPORT_TYPE_CATEGORY, REPORT_TYPE_ICON } from "@/lib/types";

const RECENT_THRESHOLD_MIN = 15;

interface Props {
  reports: Report[];
  position: (LatLng & { accuracy: number }) | null;
  radiusM: number;
  selectedId: string | null;
  follow: boolean;
  onSelect: (id: string) => void;
  onFollowChange: (follow: boolean) => void;
}

/**
 * Carte Leaflet créée une seule fois ; les marqueurs, la position et le
 * cercle de zone sont mis à jour sur place (pas de clignotement quand un
 * signalement arrive en temps réel).
 */
export function LiveMap({
  reports,
  position,
  radiusM,
  selectedId,
  follow,
  onSelect,
  onFollowChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markersRef = useRef<Leaflet.LayerGroup | null>(null);
  const userMarkerRef = useRef<Leaflet.Marker | null>(null);
  const circleRef = useRef<Leaflet.Circle | null>(null);
  const lastFitRef = useRef<{ lat: number; lng: number; radiusM: number } | null>(null);
  const [ready, setReady] = useState(false);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onFollowChangeRef = useRef(onFollowChange);
  onFollowChangeRef.current = onFollowChange;

  // 1. Création de la carte (une seule fois)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Leaflet touche à `window` : chargé uniquement dans le navigateur.
      // Selon le bundler, le module arrive avec ou sans export `default`.
      const mod = await import("leaflet");
      const L = ((mod as unknown as { default?: typeof Leaflet }).default ??
        mod) as typeof Leaflet;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: true,
      }).setView([GRAND_NOUMEA.lat, GRAND_NOUMEA.lng], 11);

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        maxZoom: 19,
        subdomains: "abcd",
      }).addTo(map);

      // Dès que l'utilisateur déplace la carte à la main, on arrête de la
      // recentrer automatiquement sur lui.
      map.on("dragstart", () => onFollowChangeRef.current(false));

      leafletRef.current = L;
      mapRef.current = map;
      markersRef.current = L.layerGroup().addTo(map);
      setReady(true);
      setTimeout(() => map.invalidateSize(), 250);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = null;
      userMarkerRef.current = null;
      circleRef.current = null;
      lastFitRef.current = null;
      setReady(false);
    };
  }, []);

  // 2. Marqueurs des signalements
  useEffect(() => {
    const L = leafletRef.current;
    const group = markersRef.current;
    if (!ready || !L || !group) return;

    group.clearLayers();
    const now = Date.now();

    for (const r of reports) {
      const color = CATEGORY_HEX[REPORT_TYPE_CATEGORY[r.type]];
      const ageMin = (now - new Date(r.createdAt).getTime()) / 60_000;
      const isSos = r.type === "sos";
      const pulse = isSos || ageMin <= RECENT_THRESHOLD_MIN;
      const rel = getReliability(r);
      const classes = [
        "vigie-marker",
        rel.level === "signalement" || rel.contested ? "is-faint" : "",
        r.id === selectedId ? "is-selected" : "",
      ].join(" ");

      const icon = L.divIcon({
        className: "",
        html: `<div class="${classes}">${
          pulse
            ? `<span class="ring" style="background:${color}22;border:1px solid ${color}"></span>`
            : ""
        }<span class="core" style="background:${color}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${
          REPORT_TYPE_ICON[r.type]
        }</svg></span></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      L.marker([r.lat, r.lng], {
        icon,
        keyboard: true,
        title: r.label,
        zIndexOffset: r.id === selectedId ? 1000 : isSos ? 500 : 0,
      })
        .on("click", () => onSelectRef.current(r.id))
        .addTo(group);
    }
  }, [ready, reports, selectedId]);

  // 3. Position de l'utilisateur + cercle de la zone surveillée
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;

    if (!position) {
      userMarkerRef.current?.remove();
      circleRef.current?.remove();
      userMarkerRef.current = null;
      circleRef.current = null;
      return;
    }

    const latlng: [number, number] = [position.lat, position.lng];

    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker(latlng, {
        icon: L.divIcon({
          className: "",
          html: '<div class="user-dot"></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
        interactive: false,
        zIndexOffset: 2000,
      }).addTo(map);
    } else {
      userMarkerRef.current.setLatLng(latlng);
    }

    if (!circleRef.current) {
      circleRef.current = L.circle(latlng, {
        radius: radiusM,
        color: "#22B8B0",
        weight: 1,
        opacity: 0.55,
        dashArray: "4 6",
        fillColor: "#22B8B0",
        fillOpacity: 0.05,
        interactive: false,
      }).addTo(map);
    } else {
      circleRef.current.setLatLng(latlng);
      circleRef.current.setRadius(radiusM);
    }
  }, [ready, position, radiusM]);

  // 4. Suivi : cadrer la carte sur la zone surveillée
  const prevFollowRef = useRef(follow);
  useEffect(() => {
    const justResumed = follow && !prevFollowRef.current;
    prevFollowRef.current = follow;

    const map = mapRef.current;
    const circle = circleRef.current;
    if (!ready || !map || !follow || !position || !circle) return;

    const last = lastFitRef.current;
    if (!justResumed && last && last.radiusM === radiusM && distanceM(last, position) < 75) {
      return; // petit déplacement : on ne bouge pas la carte pour rien
    }

    map.fitBounds(circle.getBounds(), { padding: [12, 12], animate: Boolean(last) });
    lastFitRef.current = { lat: position.lat, lng: position.lng, radiusM };
  }, [ready, follow, position, radiusM]);

  // 5. Centrer sur un signalement choisi dans la liste
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !selectedId) return;
    const r = reports.find((x) => x.id === selectedId);
    if (r) map.panTo([r.lat, r.lng], { animate: true });
    // Volontairement sans `reports` : on ne recentre pas à chaque
    // rafraîchissement temps réel, seulement quand la sélection change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selectedId]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 isolate"
      role="application"
      aria-label="Carte des signalements"
    />
  );
}
