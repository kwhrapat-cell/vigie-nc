"use client";

import { estChantier, libelleFinChantier } from "@/lib/chantier";
import { formatAgeShort, formatDistance } from "@/lib/geo";
import { getReliability } from "@/lib/reliability";
import {
  Category,
  CATEGORY_HEX,
  CATEGORY_LABELS,
  Report,
  REPORT_TYPE_CATEGORY,
} from "@/lib/types";
import type { LiveStatus } from "@/lib/useLiveReports";
import type { WatchStatus } from "@/lib/useWatchPosition";
import { ReliabilityBadge, TypeTile } from "./ui";
import { Cagou } from "./Cagou";

const CATEGORIES: Category[] = ["danger", "perturbation", "meteo"];

function timeLabel(d: Date | null) {
  if (!d) return null;
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/** Panneau du bas de l'accueil : compteurs + liste « À proximité ». */
export function HomeSheet({
  allReports,
  reports,
  status,
  error,
  updatedAt,
  geoStatus,
  radiusKm,
  scope,
  hasCenter,
  filter,
  onFilter,
  onSelect,
  onEnableLocation,
}: {
  allReports: Report[];
  reports: Report[]; // après filtre de catégorie
  status: LiveStatus;
  error: string | null;
  updatedAt: Date | null;
  geoStatus: WatchStatus;
  radiusKm: number;
  scope: "zone" | "nc";
  hasCenter: boolean;
  filter: Category | null;
  onFilter: (c: Category | null) => void;
  onSelect: (id: string) => void;
  onEnableLocation: () => void;
}) {
  const counts = CATEGORIES.reduce(
    (acc, c) => ({ ...acc, [c]: allReports.filter((r) => REPORT_TYPE_CATEGORY[r.type] === c).length }),
    {} as Record<Category, number>,
  );
  const time = timeLabel(updatedAt);

  return (
    <section className="relative z-[12] -mt-4 rounded-t-[22px] bg-panel border-t border-line px-4 pt-2.5 pb-7">
      <div className="w-9 h-1 rounded-full bg-white/15 mx-auto mb-2.5" />

      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display font-semibold text-[16px]">
          {scope === "nc" ? "Toute la Calédonie" : hasCenter ? "Autour de moi" : "En Calédonie"}
          {hasCenter && <span className="text-mist-dim font-normal text-[14px]"> · {radiusKm} km</span>}
        </h2>
        <span className="font-mono text-[12px] text-mist-dim">
          {status === "loading" ? "Chargement…" : time ? `Mis à jour à ${time}` : ""}
        </span>
      </div>

      {/* Compteurs Dangers / Perturbations / Infos météo — servent aussi de filtre */}
      <div className="mt-2.5 grid grid-cols-3 gap-2" role="group" aria-label="Filtrer par catégorie">
        {CATEGORIES.map((c) => {
          const active = filter === c;
          const n = counts[c];
          return (
            <button
              key={c}
              type="button"
              aria-pressed={active}
              onClick={() => onFilter(active ? null : c)}
              className={`rounded-xl border px-2 py-2 text-center transition-colors ${
                active ? "bg-panel-2" : "bg-void/40"
              }`}
              style={{ borderColor: active ? CATEGORY_HEX[c] : "#1E363D" }}
            >
              <span className="block font-display font-bold text-[22px] leading-none" style={{ color: CATEGORY_HEX[c] }}>
                {n}
              </span>
              <span className="block mt-1 text-[12.5px] text-mist-dim">
                {n > 1 ? CATEGORY_LABELS[c].many : CATEGORY_LABELS[c].one}
              </span>
            </button>
          );
        })}
      </div>

      {!hasCenter && scope === "zone" && (geoStatus === "denied" || geoStatus === "unsupported" || geoStatus === "unavailable") && (
        <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-[13.5px] text-mist">
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
              className="shrink-0 rounded-lg border border-warn/40 px-2.5 py-1.5 text-[13px] font-medium text-warn"
            >
              Réessayer
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 text-[13.5px] text-danger" role="alert">
          {error}
        </p>
      )}

      <h3 className="mt-3 mb-1 text-[14px] font-medium text-mist-dim">
        {scope === "nc"
          ? filter
            ? `${CATEGORY_LABELS[filter].many} en cours`
            : "En cours, du plus proche au plus loin"
          : filter
            ? `${CATEGORY_LABELS[filter].many} à proximité`
            : "À proximité"}
      </h3>

      {status === "ready" && reports.length === 0 && (
        <div className="py-2 flex items-center gap-3">
          <Cagou size={52} />
          <div className="text-[14px] text-mist-dim leading-relaxed">
            <span className="block text-mist font-medium">
              {`Rien de signalé ${filter ? "de ce type " : ""}${hasCenter ? "dans ce rayon " : ""}pour l'instant. Bonne route !`}
            </span>
            <span className="block text-[12.5px] opacity-80 mt-0.5">
              Ça ne garantit pas que la route est dégagée : reste prudent.
            </span>
          </div>
        </div>
      )}

      <ul className="flex flex-col gap-1.5 max-h-[26vh] overflow-y-auto -mx-1 px-1 pb-1">
        {reports.map((r) => {
          const rel = getReliability(r);
          const dist = formatDistance(r.distanceM);
          const where = r.place ?? (dist ? dist.replace(/^à /, "À ") : null);
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                className="w-full flex items-center gap-3 rounded-xl bg-panel-2/70 border border-line px-2.5 py-2 text-left"
              >
                <TypeTile type={r.type} size={38} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <b className="font-semibold text-[15px] truncate">{r.type === "sos" ? "SOS — urgence" : r.label}</b>
                    {r.type !== "sos" && <ReliabilityBadge report={r} />}
                  </span>
                  <span className="block text-[13px] text-mist-dim truncate">
                    {[where, r.place && dist ? dist : null].filter(Boolean).join(" · ")}
                  </span>
                  <span className="block font-mono text-[12px] text-mist-dim opacity-70">
                    {estChantier(r) && r.endDate
                      ? `chantier ${libelleFinChantier(r.endDate)}`
                      : `il y a ${formatAgeShort(r.createdAt)}`}
                  </span>
                </span>
                {r.type !== "sos" && rel.people > 0 && (
                  <span
                    className="shrink-0 flex items-center gap-1 text-[13px] text-mist-dim"
                    aria-label={`${rel.people} personne${rel.people > 1 ? "s" : ""}`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5">
                      <circle cx="12" cy="8" r="3.5" />
                      <path d="M5 20a7 7 0 0 1 14 0" />
                    </svg>
                    {rel.people}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
