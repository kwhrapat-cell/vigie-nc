"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { ScreenHeader, TypeTile } from "@/components/ui";
import { LatLng } from "@/lib/geo";
import { readRadiusKm } from "@/lib/preferences";
import { errorMessage, fetchZoneStats, ZoneStats } from "@/lib/reports-api";
import { REPORT_TYPE_LABELS, ReportType } from "@/lib/types";
import { useGeolocation } from "@/lib/useGeolocation";

type Tab = "resume" | "evenements";
type Scope = "zone" | "tout";

const MONTHS = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];

function monthShort(mois: string) {
  const m = Number(mois.slice(5, 7)) - 1;
  return MONTHS[m]?.slice(0, 1) ?? "?";
}
function monthLong(mois: string) {
  const m = Number(mois.slice(5, 7)) - 1;
  return `${MONTHS[m] ?? ""} ${mois.slice(0, 4)}`;
}

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-3 py-3">
      <span className="block font-display font-bold text-[26px] leading-none" style={{ color }}>
        {value}
      </span>
      <span className="block mt-1.5 text-[13px] text-mist-dim">{label}</span>
    </div>
  );
}

/** Mémoire du territoire : ce qui revient, mois après mois. */
export default function HistoriquePage() {
  const { locate, status: geoStatus } = useGeolocation();
  const [tab, setTab] = useState<Tab>("resume");
  const [scope, setScope] = useState<Scope>("zone");
  const [radiusKm, setRadiusKm] = useState(5);
  const [center, setCenter] = useState<LatLng | null>(null);
  const [stats, setStats] = useState<ZoneStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRadiusKm(readRadiusKm());
    locate()
      .then((p) => setCenter({ lat: p.lat, lng: p.lng }))
      .catch(() => setScope("tout"));
  }, [locate]);

  const noPosition = geoStatus === "error" || geoStatus === "unsupported";
  const effectiveScope: Scope = noPosition ? "tout" : scope;
  const query = effectiveScope === "zone" ? center : null;
  const waiting = effectiveScope === "zone" && !center;

  useEffect(() => {
    if (waiting) return;
    let cancelled = false;
    setLoading(true);
    fetchZoneStats(query, radiusKm * 1000)
      .then((s) => {
        if (!cancelled) {
          setStats(s);
          setError(null);
        }
      })
      .catch((e) => !cancelled && setError(errorMessage(e, "Impossible de charger l'historique.")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query, radiusKm, waiting]);

  const max = useMemo(() => Math.max(1, ...(stats?.parMois.map((m) => m.total) ?? [1])), [stats]);
  const topType = useMemo(() => {
    const entries = Object.entries(stats?.parType ?? {}) as [ReportType, number][];
    return entries.sort((a, b) => b[1] - a[1])[0] ?? null;
  }, [stats]);
  const peakIndexes = useMemo(() => {
    const list = stats?.parMois ?? [];
    return new Set(
      list
        .map((m, i) => [m.total, i] as const)
        .filter(([v]) => v > 0)
        .sort((a, b) => b[0] - a[0])
        .slice(0, 2)
        .map(([, i]) => i),
    );
  }, [stats]);

  const t = stats?.parType ?? {};
  const inondations = (t.inondation ?? 0) + (t.meteo ?? 0);

  return (
    <main className="min-h-[100dvh] pb-nav">
      <ScreenHeader title="Historique" subtitle="Mémoire du territoire · 12 derniers mois" />

      <div className="mx-4 mb-2 grid grid-cols-2 gap-1 rounded-xl border border-line bg-panel p-1" role="tablist" aria-label="Zone">
        {(
          [
            ["zone", `Autour de moi (${radiusKm} km)`],
            ["tout", "Toute la Calédonie"],
          ] as [Scope, string][]
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={effectiveScope === v}
            disabled={v === "zone" && noPosition}
            onClick={() => setScope(v)}
            className={`rounded-lg py-2 text-[14px] font-medium disabled:opacity-40 ${
              effectiveScope === v ? "bg-primary text-white" : "text-mist-dim"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mx-4 mb-4 flex gap-4 border-b border-line" role="tablist" aria-label="Vue">
        {(
          [
            ["resume", "Résumé"],
            ["evenements", "Événements"],
          ] as [Tab, string][]
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={tab === v}
            onClick={() => setTab(v)}
            className={`pb-2 text-[15px] font-medium border-b-2 -mb-px ${
              tab === v ? "border-lagoon text-mist" : "border-transparent text-mist-dim"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mx-4 mb-3 text-[14px] text-danger" role="alert">
          {error}
        </p>
      )}
      {(loading || waiting) && !stats && <p className="mx-4 text-[14.5px] text-mist-dim">Chargement…</p>}

      {stats && tab === "resume" && (
        <section className="mx-4">
          <div className="grid grid-cols-2 gap-2">
            <StatCard value={stats.total} label="Signalements" color="#22B8B0" />
            <StatCard value={inondations} label="Inondations & météo" color="#3B82F6" />
            <StatCard value={t.accident ?? 0} label="Accidents" color="#E5484D" />
            <StatCard value={t.route_coupee ?? 0} label="Routes coupées" color="#F0912E" />
          </div>

          <h2 className="mt-5 mb-2 text-[15px] font-medium">Évolution mensuelle</h2>
          <div className="rounded-xl border border-line bg-panel px-3 pt-3 pb-2">
            <div className="flex items-end gap-1.5 h-[120px]" role="list" aria-label="Signalements par mois">
              {stats.parMois.map((m, i) => (
                <div
                  key={m.mois}
                  role="listitem"
                  aria-label={`${monthLong(m.mois)} : ${m.total} signalement${m.total > 1 ? "s" : ""}`}
                  className="flex-1 h-full flex flex-col items-center justify-end gap-1"
                >
                  {m.total > 0 && <span className="font-mono text-[12px] leading-none text-mist-dim">{m.total}</span>}
                  <div
                    className={`w-full rounded-t-[3px] ${peakIndexes.has(i) ? "bg-danger" : "bg-primary"}`}
                    style={{ height: `${Math.max((m.total / max) * 100, m.total > 0 ? 6 : 2)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-1.5 mt-1">
              {stats.parMois.map((m) => (
                <span key={m.mois} className="flex-1 text-center font-mono text-[12px] text-mist-dim">
                  {monthShort(m.mois)}
                </span>
              ))}
            </div>
          </div>

          {topType && topType[1] > 0 && (
            <p className="mt-3 text-[14px] text-mist-dim">
              Le plus fréquent {effectiveScope === "zone" ? "ici" : "en Calédonie"} :{" "}
              <span className="text-mist font-medium">{REPORT_TYPE_LABELS[topType[0]]}</span> ({topType[1]}).
              {peakIndexes.size > 0 && " Les mois en rouge sont les plus chargés."}
            </p>
          )}
          {stats.total === 0 && (
            <p className="mt-3 text-[14px] text-mist-dim">
              Rien n&apos;a encore été signalé ici. L&apos;historique se construit avec les signalements de chacun.
            </p>
          )}
        </section>
      )}

      {stats && tab === "evenements" && (
        <ul className="mx-4 flex flex-col gap-2">
          {stats.recents.length === 0 && <li className="text-[14.5px] text-mist-dim">Aucun événement sur la période.</li>}
          {stats.recents.map((e) => (
            <li key={e.id}>
              <Link href={`/?signalement=${e.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2.5">
                <TypeTile type={e.type} size={36} />
                <span className="flex-1 min-w-0">
                  <b className="block font-semibold text-[15px] truncate">{REPORT_TYPE_LABELS[e.type] ?? "Signalement"}</b>
                  <span className="block text-[13px] text-mist-dim truncate">
                    {[e.lieu, new Date(e.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] ${
                    e.actif ? "bg-ok/15 text-ok" : "bg-white/[0.06] text-mist-dim"
                  }`}
                >
                  {e.actif ? "En cours" : "Terminé"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <BottomNav />
    </main>
  );
}
