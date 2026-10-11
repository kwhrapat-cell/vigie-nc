"use client";

import { formatAgeShort, formatDistance } from "@/lib/geo";
import { getReliability, RELIABILITY_BADGE } from "@/lib/reliability";
import { Report, REPORT_TYPE_SEVERITY } from "@/lib/types";
import type { LiveStatus } from "@/lib/useLiveReports";
import type { WatchStatus } from "@/lib/useWatchPosition";

const SEVERITY_BG: Record<string, string> = {
  rust: "bg-rust-bright",
  ochre: "bg-ochre",
  lagoon: "bg-lagoon",
};

function plural(n: number, word: string) {
  return `${n} ${word}${n > 1 ? "s" : ""}`;
}

export function ReportsSheet({
  reports,
  status,
  error,
  geoStatus,
  radiusKm,
  hasCenter,
  onSelect,
  onEnableLocation,
}: {
  reports: Report[];
  status: LiveStatus;
  error: string | null;
  geoStatus: WatchStatus;
  radiusKm: number;
  hasCenter: boolean;
  onSelect: (id: string) => void;
  onEnableLocation: () => void;
}) {
  const n = reports.length;
  const heading =
    status === "loading"
      ? "Chargement des signalements…"
      : hasCenter
        ? `${plural(n, "signalement")} ${n > 1 ? "actifs" : "actif"} à moins de ${radiusKm} km`
        : `${plural(n, "signalement")} ${n > 1 ? "actifs" : "actif"} en Calédonie`;

  return (
    <div className="bg-panel-2 rounded-t-[22px] px-3.5 pt-2.5 pb-4 relative z-[12]">
      <div className="w-9 h-1 rounded-full bg-white/15 mx-auto mb-3" />
      <div className="font-body text-[12.5px] text-mist-dim mb-2">{heading}</div>

      {!hasCenter && (geoStatus === "denied" || geoStatus === "unsupported" || geoStatus === "unavailable") && (
        <div className="flex items-center gap-2 mb-2 rounded-xl border border-ochre/30 bg-ochre/10 px-3 py-2 text-[11.5px] text-mist">
          <span className="flex-1">
            {geoStatus === "denied"
              ? "Position refusée : tu vois toute la Calédonie. Autorise la localisation pour ne voir que ta zone."
              : geoStatus === "unsupported"
                ? "Ce téléphone ne donne pas sa position : tu vois toute la Calédonie."
                : "Position introuvable pour l'instant : tu vois toute la Calédonie."}
          </span>
          {geoStatus !== "unsupported" && (
            <button
              type="button"
              onClick={onEnableLocation}
              className="shrink-0 rounded-lg border border-ochre/40 px-2.5 py-1.5 text-[11px] font-medium text-ochre"
            >
              Réessayer
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="mb-2 text-[11.5px] text-rust-bright" role="alert">
          {error}
        </p>
      )}

      {status === "ready" && n === 0 && (
        <div className="py-3 text-[12px] text-mist-dim leading-relaxed">
          Aucun signalement {hasCenter ? "dans ce rayon" : ""} pour l&apos;instant.
          <span className="block text-[10.5px] opacity-70 mt-1">
            L&apos;absence de signalement ne garantit pas que la route est dégagée.
          </span>
        </div>
      )}

      <ul className="flex flex-col divide-y divide-white/[0.06] max-h-[32vh] overflow-y-auto -mx-1 px-1">
        {reports.map((r) => {
          const rel = getReliability(r);
          const dist = formatDistance(r.distanceM);
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                className="w-full flex items-center gap-2.5 py-2.5 text-left text-[12.5px]"
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${SEVERITY_BG[REPORT_TYPE_SEVERITY[r.type]]} ${
                    r.type === "sos" ? "animate-blink" : ""
                  }`}
                />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <b className="font-medium truncate">{r.type === "sos" ? "SOS" : r.label}</b>
                    {r.type !== "sos" && (
                      <span
                        className={`shrink-0 rounded-full border px-1.5 py-px text-[9.5px] ${RELIABILITY_BADGE[rel.level]}`}
                      >
                        {rel.label}
                      </span>
                    )}
                  </span>
                  {dist && <span className="block text-[11px] text-mist-dim">{dist}</span>}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-mist-dim opacity-70">
                  {formatAgeShort(r.createdAt)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
