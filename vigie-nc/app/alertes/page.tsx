"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { ReliabilityBadge, ScreenHeader, TypeTile } from "@/components/ui";
import { formatAge, formatDistance, LatLng } from "@/lib/geo";
import { readRadiusKm } from "@/lib/preferences";
import { useLiveReports } from "@/lib/useLiveReports";
import { useWatchPosition } from "@/lib/useWatchPosition";

type Scope = "zone" | "tout";

/** Fil des alertes en cours, les plus récentes d'abord. */
export default function AlertesPage() {
  const { position, status: geoStatus } = useWatchPosition();
  const [scope, setScope] = useState<Scope>("zone");
  const [radiusKm, setRadiusKm] = useState(5);
  const [center, setCenter] = useState<LatLng | null>(null);

  useEffect(() => setRadiusKm(readRadiusKm()), []);
  // Position figée à la première mesure : une liste qui bouge sans cesse
  // serait illisible.
  useEffect(() => {
    if (position && !center) setCenter({ lat: position.lat, lng: position.lng });
  }, [position, center]);

  const noPosition = geoStatus === "denied" || geoStatus === "unsupported";
  const effectiveScope: Scope = noPosition ? "tout" : scope;
  const query = effectiveScope === "zone" ? center : null;
  const waitingForPosition = effectiveScope === "zone" && !center;

  const { reports, status, error } = useLiveReports(waitingForPosition ? null : query, radiusKm * 1000);
  const sorted = useMemo(
    () => [...reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [reports],
  );

  return (
    <main className="min-h-[100dvh] pb-nav">
      <ScreenHeader title="Alertes" subtitle="Événements en cours" />

      <div className="mx-4 mb-3 grid grid-cols-2 gap-1 rounded-xl border border-line bg-panel p-1" role="tablist">
        {(
          [
            ["zone", `Ma zone (${radiusKm} km)`],
            ["tout", "Toute la Calédonie"],
          ] as [Scope, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={effectiveScope === value}
            disabled={value === "zone" && noPosition}
            onClick={() => setScope(value)}
            className={`rounded-lg py-2 text-[12.5px] font-medium disabled:opacity-40 ${
              effectiveScope === value ? "bg-primary text-white" : "text-mist-dim"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {noPosition && (
        <p className="mx-4 mb-3 text-[11.5px] text-warn">
          Position indisponible : affichage de toute la Calédonie.
        </p>
      )}
      {error && (
        <p className="mx-4 mb-3 text-[12px] text-danger" role="alert">
          {error}
        </p>
      )}

      {(status === "loading" || waitingForPosition) && (
        <p className="mx-4 text-[12.5px] text-mist-dim">Chargement…</p>
      )}

      {status === "ready" && !waitingForPosition && sorted.length === 0 && (
        <div className="mx-4 rounded-xl border border-line bg-panel px-4 py-5 text-center">
          <p className="text-[13px]">Aucune alerte en cours {effectiveScope === "zone" ? "dans ta zone" : ""}.</p>
          <p className="mt-1 text-[11px] text-mist-dim">
            L&apos;absence de signalement ne garantit pas que la route est dégagée.
          </p>
        </div>
      )}

      {!waitingForPosition && (
        <ul className="mx-4 flex flex-col gap-2">
          {sorted.map((r) => {
            const dist = formatDistance(r.distanceM);
            return (
              <li key={r.id}>
                <Link
                  href={`/?signalement=${r.id}`}
                  className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2.5"
                >
                  <TypeTile type={r.type} size={40} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5">
                      <b className="font-semibold text-[13px] truncate">{r.label}</b>
                      {r.type !== "sos" && <ReliabilityBadge report={r} />}
                    </span>
                    <span className="block text-[11px] text-mist-dim truncate">
                      {[r.place, dist].filter(Boolean).join(" · ") || "Voir sur la carte"}
                    </span>
                    <span className="block font-mono text-[10px] text-mist-dim opacity-70">{formatAge(r.createdAt)}</span>
                  </span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-mist-dim shrink-0">
                    <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mx-4 mt-5 rounded-xl border border-dashed border-line px-4 py-3">
        <p className="text-[12.5px] font-medium">Notifications sur ton téléphone</p>
        <p className="mt-1 text-[11.5px] text-mist-dim leading-relaxed">
          Bientôt : être prévenu des nouveaux événements dans ta zone ou sur tes trajets habituels, même
          l&apos;appli fermée.
        </p>
      </div>

      <BottomNav />
    </main>
  );
}
