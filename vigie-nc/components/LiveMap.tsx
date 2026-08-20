"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import { Report } from "@/lib/types";
import { REPORT_TYPE_SEVERITY } from "@/lib/types";

const SEVERITY_HEX: Record<string, string> = {
  rust: "#E8622F",
  ochre: "#E8A33D",
  lagoon: "#22B8B0",
};

const RECENT_THRESHOLD_MIN = 15;

export function LiveMap({ reports }: { reports: Report[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: true,
      }).setView([-22.225, 166.47], 11);
      mapRef.current = map;

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
          attribution: "&copy; OpenStreetMap &copy; CARTO",
          maxZoom: 19,
          subdomains: "abcd",
        },
      ).addTo(map);

      const now = Date.now();

      const icon = (color: string, pulse: boolean) =>
        L.divIcon({
          className: "",
          html: `<div class="pulse-marker">${
            pulse
              ? `<span class="ring" style="background:${color}22;border:1px solid ${color}"></span>`
              : ""
          }<span class="core" style="background:${color}"></span></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });

      reports.forEach((r) => {
        const color = SEVERITY_HEX[REPORT_TYPE_SEVERITY[r.type]];
        const ageMin = (now - new Date(r.createdAt).getTime()) / 60_000;
        const isSos = r.type === "sos";
        L.marker([r.lat, r.lng], {
          icon: icon(color, isSos || ageMin <= RECENT_THRESHOLD_MIN),
        })
          .addTo(map)
          .bindPopup(
            `<strong>${r.zoneName ?? (isSos ? "SOS" : "Position signalée")}</strong><br/>${r.label}`,
          );
      });

      setTimeout(() => map.invalidateSize(), 250);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [reports]);

  return <div ref={containerRef} className="flex-1 relative" />;
}
