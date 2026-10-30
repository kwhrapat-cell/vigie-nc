"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { couleurSur } from "@/lib/contraste";
import { MAP_STYLES, NC_BOUNDS } from "@/lib/map-styles";
import { readMapStyle } from "@/lib/preferences";
import type { Point } from "@/lib/trajet";

function repere(L: typeof Leaflet, lettre: string, fond: string): Leaflet.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:28px;height:28px;border-radius:9999px;background:${fond};border:3px solid #081317;color:${couleurSur(fond)};font:600 13px/22px Inter,sans-serif;text-align:center;box-shadow:0 4px 10px -3px rgba(0,0,0,.6)">${lettre}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

/**
 * Aperçu du trajet calculé (écran « Mon trajet ») : tracé complet, départ
 * (D) et arrivée (A). La partie surveillée (`surveille`) est en couleur
 * pleine, les extrémités gardées sur le téléphone en pointillés.
 */
export function TrajetApercu({ trace, surveille }: { trace: Point[]; surveille?: Point[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const groupeRef = useRef<Leaflet.LayerGroup | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await import("leaflet");
      const L = ((mod as unknown as { default?: typeof Leaflet }).default ?? mod) as typeof Leaflet;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, { zoomControl: false, minZoom: 6 });
      map.fitBounds(NC_BOUNDS, { padding: [8, 8] });
      const style = readMapStyle();
      containerRef.current.setAttribute("data-fond", style);
      for (const spec of MAP_STYLES[style].layers) L.tileLayer(spec.url, spec.options).addTo(map);
      leafletRef.current = L;
      mapRef.current = map;
      groupeRef.current = L.layerGroup().addTo(map);
      setReady(true);
      setTimeout(() => map.invalidateSize(), 200);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      groupeRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const groupe = groupeRef.current;
    if (!ready || !L || !map || !groupe || trace.length < 2) return;
    groupe.clearLayers();
    const plein = surveille && surveille.length >= 2 ? surveille : trace;
    L.polyline(trace, { color: "#22B8B0", weight: 4, opacity: 0.7, dashArray: "4 8", interactive: false }).addTo(groupe);
    L.polyline(plein, { color: "#081317", weight: 9, opacity: 0.55, interactive: false, lineCap: "round" }).addTo(groupe);
    L.polyline(plein, { color: "#22B8B0", weight: 5, opacity: 0.95, interactive: false, lineCap: "round" }).addTo(groupe);
    L.marker(trace[0], { icon: repere(L, "D", "#167F78"), interactive: false, keyboard: false }).addTo(groupe);
    L.marker(trace[trace.length - 1], { icon: repere(L, "A", "#C1440E"), interactive: false, keyboard: false }).addTo(groupe);
    map.fitBounds(L.latLngBounds(trace), { padding: [24, 24] });
  }, [ready, trace, surveille]);

  return <div ref={containerRef} className="absolute inset-0 isolate" aria-label="Carte : ton trajet" />;
}
