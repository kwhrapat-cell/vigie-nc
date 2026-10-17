"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { clusterByDistance } from "@/lib/cluster";
import { distanceM, LatLng } from "@/lib/geo";
import { BACKUP_PLAN_LAYER, MAP_STYLES, NC_BOUNDS } from "@/lib/map-styles";
import type { MapStyle } from "@/lib/preferences";
import { getReliability } from "@/lib/reliability";
import {
  Category,
  CATEGORY_HEX,
  Report,
  REPORT_TYPE_CATEGORY,
  REPORT_TYPE_ICON,
} from "@/lib/types";

const RECENT_THRESHOLD_MIN = 15;
// Au-delà de ce zoom (≈ échelle d'un quartier), chaque signalement est
// affiché seul ; en dessous, les signalements proches sont regroupés.
const CLUSTER_MAX_ZOOM = 13;
const CLUSTER_RADIUS_PX = 46;
const CATEGORY_PRIORITY: Category[] = ["danger", "meteo", "perturbation"];

export type MapScope = "zone" | "nc";

interface Props {
  reports: Report[];
  position: (LatLng & { accuracy: number }) | null;
  scope: MapScope;
  radiusM: number;
  mapStyle: MapStyle;
  selectedId: string | null;
  follow: boolean;
  onSelect: (id: string) => void;
  onFollowChange: (follow: boolean) => void;
}

function dominantColor(items: Report[]): string {
  const counts: Record<Category, number> = { danger: 0, perturbation: 0, meteo: 0 };
  for (const r of items) counts[REPORT_TYPE_CATEGORY[r.type]]++;
  const best = CATEGORY_PRIORITY.reduce((a, b) => (counts[b] > counts[a] ? b : a));
  return CATEGORY_HEX[best];
}

/**
 * Carte Leaflet créée une seule fois ; fond, marqueurs, position et cercle
 * de zone sont mis à jour sur place (pas de clignotement quand un
 * signalement arrive en temps réel).
 */
export function LiveMap({
  reports,
  position,
  scope,
  radiusM,
  mapStyle,
  selectedId,
  follow,
  onSelect,
  onFollowChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const tilesRef = useRef<Leaflet.Layer[]>([]);
  const markersRef = useRef<Leaflet.LayerGroup | null>(null);
  const userMarkerRef = useRef<Leaflet.Marker | null>(null);
  const circleRef = useRef<Leaflet.Circle | null>(null);
  const lastFitRef = useRef<{ lat: number; lng: number; radiusM: number } | null>(null);
  const [ready, setReady] = useState(false);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onFollowChangeRef = useRef(onFollowChange);
  onFollowChangeRef.current = onFollowChange;

  // Données courantes lues par le dessin des marqueurs (appelé aussi au zoom)
  const dataRef = useRef({ reports, selectedId });
  dataRef.current = { reports, selectedId };
  const drawRef = useRef<() => void>(() => undefined);

  // Cadrage voulu, lu quand la taille de la carte change (voir plus bas)
  const frameRef = useRef({ follow, scope, hasPosition: Boolean(position) });
  frameRef.current = { follow, scope, hasPosition: Boolean(position) };

  // 1. Création de la carte (une seule fois) — cadrée sur toute la Calédonie
  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let frame = 0;

    (async () => {
      // Leaflet touche à `window` : chargé uniquement dans le navigateur.
      const mod = await import("leaflet");
      const L = ((mod as unknown as { default?: typeof Leaflet }).default ?? mod) as typeof Leaflet;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: true,
        minZoom: 6,
      });
      map.fitBounds(NC_BOUNDS, { padding: [8, 8] });

      // Dès que l'utilisateur déplace la carte à la main, on arrête de la
      // recentrer automatiquement sur lui.
      map.on("dragstart", () => onFollowChangeRef.current(false));
      map.on("zoomend", () => drawRef.current());

      leafletRef.current = L;
      mapRef.current = map;
      markersRef.current = L.layerGroup().addTo(map);
      setReady(true);
      setTimeout(() => map.invalidateSize(), 250);

      // La hauteur de la carte change sans que la fenêtre change : bandeau
      // « Position refusée », liste qui se remplit, barre de Safari… Sans
      // ça, Leaflet garde l'ancien cadrage et on ne voit plus que le haut
      // de l'ancienne vue (ex. le nord du Vanuatu au lieu de la Calédonie).
      if (typeof ResizeObserver !== "undefined" && containerRef.current) {
        observer = new ResizeObserver(() => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            const m = mapRef.current;
            if (!m) return;
            const { follow: suivi, scope: vue, hasPosition } = frameRef.current;
            // Garde le même centre ; si la carte a été déplacée à la main,
            // on s'arrête là, sinon on recadre sur la vue voulue.
            m.invalidateSize();
            if (!suivi) return;
            if (vue === "nc" || !hasPosition) {
              m.fitBounds(NC_BOUNDS, { padding: [8, 8], animate: false });
            } else if (circleRef.current) {
              m.fitBounds(circleRef.current.getBounds(), { padding: [12, 12], animate: false });
            }
          });
        });
        observer.observe(containerRef.current);
      }
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      cancelAnimationFrame(frame);
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = null;
      userMarkerRef.current = null;
      circleRef.current = null;
      tilesRef.current = [];
      lastFitRef.current = null;
      setReady(false);
    };
  }, []);

  // 2. Fond de carte (Plan / Nuit / Satellite)
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    tilesRef.current.forEach((t) => t.remove());
    const layers = MAP_STYLES[mapStyle].layers.map((spec) => L.tileLayer(spec.url, spec.options).addTo(map));
    tilesRef.current = layers;
    containerRef.current?.setAttribute("data-fond", mapStyle);

    // Plan de secours : si les tuiles du plan n'arrivent plus alors que le
    // téléphone a du réseau (serveur bloqué ou saturé), on bascule.
    const main = layers[0];
    if (mapStyle !== "satellite" && main) {
      let errors: number[] = [];
      main.on("tileerror", () => {
        if (typeof navigator !== "undefined" && !navigator.onLine) return;
        const now = Date.now();
        errors = errors.filter((t) => now - t < 20_000);
        errors.push(now);
        if (errors.length >= 8 && tilesRef.current.includes(main)) {
          main.remove();
          const backup = L.tileLayer(BACKUP_PLAN_LAYER.url, BACKUP_PLAN_LAYER.options).addTo(map);
          tilesRef.current = tilesRef.current.map((t) => (t === main ? backup : t));
        }
      });
    }
  }, [ready, mapStyle]);

  // 3. Marqueurs : signalements seuls ou pastilles chiffrées
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const group = markersRef.current;
    if (!ready || !L || !map || !group) return;

    const draw = () => {
      const { reports: list, selectedId: selId } = dataRef.current;
      group.clearLayers();
      const now = Date.now();
      const zoom = map.getZoom();

      // Le SOS et le signalement ouvert ne sont jamais regroupés.
      const alwaysAlone = list.filter((r) => r.type === "sos" || r.id === selId);
      const groupable = list.filter((r) => r.type !== "sos" && r.id !== selId);
      const clusters =
        zoom > CLUSTER_MAX_ZOOM
          ? groupable.map((r) => ({ items: [r], lat: r.lat, lng: r.lng }))
          : clusterByDistance(groupable, (r) => map.project([r.lat, r.lng], zoom), CLUSTER_RADIUS_PX);

      for (const c of clusters) {
        if (c.items.length === 1) {
          alwaysAlone.push(c.items[0]);
          continue;
        }
        const n = c.items.length;
        const size = n < 10 ? 36 : n < 50 ? 42 : 48;
        const color = dominantColor(c.items);
        L.marker([c.lat, c.lng], {
          icon: L.divIcon({
            className: "",
            html: `<div class="vigie-cluster" style="width:${size}px;height:${size}px;background:${color};box-shadow:0 0 0 5px ${color}40,0 6px 14px -4px rgba(0,0,0,.6)">${n}</div>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          }),
          keyboard: true,
          title: `${n} signalements — toucher pour zoomer`,
          zIndexOffset: 200,
        })
          .on("click", () => {
            onFollowChangeRef.current(false);
            map.fitBounds(
              L.latLngBounds(c.items.map((r) => [r.lat, r.lng] as [number, number])),
              { padding: [60, 60], maxZoom: CLUSTER_MAX_ZOOM + 2 },
            );
          })
          .addTo(group);
      }

      for (const r of alwaysAlone) {
        const color = CATEGORY_HEX[REPORT_TYPE_CATEGORY[r.type]];
        const ageMin = (now - new Date(r.createdAt).getTime()) / 60_000;
        const isSos = r.type === "sos";
        const pulse = isSos || ageMin <= RECENT_THRESHOLD_MIN;
        const rel = getReliability(r);
        const classes = [
          "vigie-marker",
          rel.level === "signalement" || rel.contested ? "is-faint" : "",
          r.id === selId ? "is-selected" : "",
        ].join(" ");

        L.marker([r.lat, r.lng], {
          icon: L.divIcon({
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
          }),
          keyboard: true,
          title: r.label,
          zIndexOffset: r.id === selId ? 1000 : isSos ? 500 : 0,
        })
          .on("click", () => onSelectRef.current(r.id))
          .addTo(group);
      }
    };

    drawRef.current = draw;
    draw();
  }, [ready, reports, selectedId]);

  // 4. Position de l'utilisateur + cercle de la zone surveillée
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;

    if (!position) {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
    } else {
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
    }

    // Pas de cercle en vue « toute la Calédonie »
    if (!position || scope === "nc") {
      circleRef.current?.remove();
      circleRef.current = null;
      return;
    }
    const latlng: [number, number] = [position.lat, position.lng];
    if (!circleRef.current) {
      circleRef.current = L.circle(latlng, {
        radius: radiusM,
        color: "#1C9890",
        weight: 2,
        opacity: 0.8,
        dashArray: "5 7",
        fillColor: "#22B8B0",
        fillOpacity: 0.07,
        interactive: false,
      }).addTo(map);
    } else {
      circleRef.current.setLatLng(latlng);
      circleRef.current.setRadius(radiusM);
    }
  }, [ready, position, radiusM, scope]);

  // 5. Cadrage : toute la Calédonie, ou la zone autour de soi (suivi)
  const prevRef = useRef({ follow, scope });
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { follow, scope };
    const map = mapRef.current;
    if (!ready || !map) return;

    if (scope === "nc") {
      if (prev.scope !== "nc" || (follow && !prev.follow)) {
        map.flyToBounds(NC_BOUNDS, { padding: [8, 8], duration: 0.8 });
      }
      lastFitRef.current = null;
      return;
    }

    const circle = circleRef.current;
    if (!follow || !position || !circle) return;

    const justResumed = (follow && !prev.follow) || prev.scope !== "zone";
    const last = lastFitRef.current;
    if (!justResumed && last && last.radiusM === radiusM && distanceM(last, position) < 75) {
      return; // petit déplacement : on ne bouge pas la carte pour rien
    }

    if (!last) {
      // Premier cadrage : on part de la vue Calédonie et on « plonge » sur
      // la zone, pour garder le repère du territoire.
      map.flyToBounds(circle.getBounds(), { padding: [12, 12], duration: 1.1 });
    } else {
      map.fitBounds(circle.getBounds(), { padding: [12, 12], animate: true });
    }
    lastFitRef.current = { lat: position.lat, lng: position.lng, radiusM };
  }, [ready, follow, position, radiusM, scope]);

  // 6. Centrer sur un signalement choisi dans la liste
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !selectedId) return;
    const r = dataRef.current.reports.find((x) => x.id === selectedId);
    if (r) map.panTo([r.lat, r.lng], { animate: true });
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
