"use client";

import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { estChantier, libelleFinChantier } from "@/lib/chantier";
import { formatAgeShort, formatDistance } from "@/lib/geo";
import { readListeRepliee, saveListeRepliee, sensGlisseListe, suiviGlisseListe } from "@/lib/preferences";
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
import { PartagePointRoute } from "./PartagePointRoute";

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
  trajet,
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
  /** Point sur le trajet favori (components/TrajetResume), visible même liste repliée. */
  trajet?: ReactNode;
}) {
  const counts = CATEGORIES.reduce(
    (acc, c) => ({ ...acc, [c]: allReports.filter((r) => REPORT_TYPE_CATEGORY[r.type] === c).length }),
    {} as Record<Category, number>,
  );
  const time = timeLabel(updatedAt);

  // Liste repliée : seuls le titre et les compteurs restent, la carte
  // prend la place. Toucher la barre du haut, ou la tirer avec le doigt :
  // la liste suit le doigt (la carte grandit en direct), puis se range.
  const [repliee, setRepliee] = useState(false);
  useEffect(() => setRepliee(readListeRepliee()), []);
  const changerRepliee = (v: boolean) => {
    setRepliee(v);
    saveListeRepliee(v);
  };
  const listeRef = useRef<HTMLDivElement>(null);
  const toucher = useRef<{ x: number; y: number } | null>(null);
  const [suivi, setSuivi] = useState(0);
  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    toucher.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    const debut = toucher.current;
    const t = e.touches[0];
    if (!debut || !t) return;
    const dx = t.clientX - debut.x;
    const dy = t.clientY - debut.y;
    if (Math.abs(dy) < Math.abs(dx)) return;
    const max = repliee ? 160 : (listeRef.current?.offsetHeight ?? 0) + 12;
    setSuivi(suiviGlisseListe(dy, repliee, max));
  };
  const onTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    const debut = toucher.current;
    const t = e.changedTouches[0];
    toucher.current = null;
    setSuivi(0);
    if (!debut || !t) return;
    const sens = sensGlisseListe(t.clientX - debut.x, t.clientY - debut.y);
    if (sens === "replier" && !repliee) changerRepliee(true);
    else if (sens === "deplier" && repliee) changerRepliee(false);
  };
  const onTouchCancel = () => {
    toucher.current = null;
    setSuivi(0);
  };

  // pb-7 : place pour le bouton « + » qui dépasse de la barre du bas.
  // Pendant le glissement vers le bas, la marge négative rend la place à la
  // carte au fur et à mesure ; vers le haut, la liste remonte par-dessus.
  return (
    <section
      className="relative z-[12] -mt-4 rounded-t-[22px] bg-panel border-t border-line px-4 pb-7"
      style={suivi > 0 ? { marginBottom: -suivi } : suivi < 0 ? { transform: `translateY(${suivi}px)` } : undefined}
    >
      {/* touch-none : le téléphone ne prend pas ce geste pour lui (défilement,
          « tirer pour actualiser »), la liste reçoit tout le mouvement. */}
      <div
        className="touch-none select-none"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
      >
      {/* Barre du haut : replie / déplie la liste (zone de toucher de 44 px) */}
      <button
        type="button"
        onClick={() => changerRepliee(!repliee)}
        aria-expanded={!repliee}
        aria-controls="liste-proximite"
        aria-label={repliee ? "Déplier la liste" : "Replier la liste pour agrandir la carte"}
        className="-mx-4 w-[calc(100%_+_2rem)] h-11 flex items-center justify-center"
      >
        <span className="w-10 h-1.5 rounded-full bg-white/25" />
      </button>

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
      </div>

      {trajet}

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
              className="shrink-0 min-h-[44px] rounded-lg border border-warn/40 px-3 text-[14px] font-medium text-warn"
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

      <div id="liste-proximite" ref={listeRef} hidden={repliee}>
      <div className="mt-3 mb-1 flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-medium text-mist-dim">
          {scope === "nc"
            ? filter
              ? `${CATEGORY_LABELS[filter].many} en cours`
              : "En cours, du plus proche au plus loin"
            : filter
              ? `${CATEGORY_LABELS[filter].many} à proximité`
              : "À proximité"}
        </h3>
        {/* Point route de la zone en image, à envoyer à la famille ou au quartier */}
        {status === "ready" && (
          <PartagePointRoute reports={allReports} toutLeTerritoire={scope === "nc" || !hasCenter} rayonKm={radiusKm} />
        )}
      </div>

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
      </div>
    </section>
  );
}
