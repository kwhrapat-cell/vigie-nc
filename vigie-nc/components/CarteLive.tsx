"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LiveMap } from "./LiveMap";
import { HomeSheet } from "./HomeSheet";
import { ReportDetail } from "./ReportDetail";
import { BottomNav } from "./BottomNav";
import { Logo } from "./ui";
import { RadiusKm, RadiusSelector, RecenterButton } from "./MapControls";
import { isSupabaseConfigured } from "@/lib/supabase";
import { distanceM, LatLng } from "@/lib/geo";
import { readRadiusKm, saveRadiusKm } from "@/lib/preferences";
import { fetchReport } from "@/lib/reports-api";
import { useWatchPosition } from "@/lib/useWatchPosition";
import { useLiveReports } from "@/lib/useLiveReports";
import { Category, Report, REPORT_TYPE_CATEGORY } from "@/lib/types";

// On ne relance la recherche que si l'on s'est déplacé d'au moins 250 m.
const REQUERY_DISTANCE_M = 250;

export function CarteLive() {
  const { status: geoStatus, position, retry } = useWatchPosition();
  const [radiusKm, setRadiusKm] = useState<RadiusKm>(5);
  const [follow, setFollow] = useState(true);
  const [queryCenter, setQueryCenter] = useState<LatLng | null>(null);
  const [filter, setFilter] = useState<Category | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [linkedReport, setLinkedReport] = useState<Report | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const selectedSnapshot = useRef<Report | null>(null);

  useEffect(() => setRadiusKm(readRadiusKm()), []);
  const changeRadius = useCallback((km: RadiusKm) => {
    setRadiusKm(km);
    setFollow(true);
    saveRadiusKm(km);
  }, []);

  // Lien partagé (?signalement=<id>) : ouvre directement la fiche.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("signalement");
    if (params.get("ajoute") === "1") {
      setBanner("Ton signalement est sur la carte. Merci !");
      setTimeout(() => setBanner(null), 5000);
    }
    if (!id) return;
    window.history.replaceState(null, "", window.location.pathname);
    setSelectedId(id);
    setFollow(false);
    fetchReport(id)
      .then((r) => {
        if (r) setLinkedReport(r);
        else setBanner("Ce signalement n'existe plus.");
      })
      .catch(() => setBanner("Impossible d'ouvrir ce signalement."));
  }, []);

  // Centre de recherche : suit la position, sans relancer une requête à
  // chaque petit mouvement du GPS.
  useEffect(() => {
    if (!position) return;
    setQueryCenter((current) =>
      current && distanceM(current, position) < REQUERY_DISTANCE_M
        ? current
        : { lat: position.lat, lng: position.lng },
    );
  }, [position]);

  const radiusM = radiusKm * 1000;
  const { reports, status, error, updatedAt, patchReport } = useLiveReports(queryCenter, radiusM);

  const visible = useMemo(
    () => (filter ? reports.filter((r) => REPORT_TYPE_CATEGORY[r.type] === filter) : reports),
    [reports, filter],
  );

  // Le signalement ouvert reste affiché même s'il disparaît de la liste
  // pendant qu'on le consulte (expiré entre-temps, hors rayon, lien partagé…).
  const selectedReport = useMemo(() => {
    if (!selectedId) return null;
    const found =
      reports.find((r) => r.id === selectedId) ??
      (linkedReport?.id === selectedId ? linkedReport : null);
    if (found) selectedSnapshot.current = found;
    return found ?? (selectedSnapshot.current?.id === selectedId ? selectedSnapshot.current : null);
  }, [reports, selectedId, linkedReport]);

  // Pour la carte : ajoute le signalement ouvert par lien s'il est hors zone.
  const mapReports = useMemo(() => {
    if (selectedReport && selectedReport.active !== false && !visible.some((r) => r.id === selectedReport.id)) {
      return [...visible, selectedReport];
    }
    return visible;
  }, [visible, selectedReport]);

  const selectFromList = useCallback((id: string) => {
    setSelectedId(id);
    setFollow(false);
  }, []);

  const closeDetail = useCallback(() => setSelectedId(null), []);

  const recenter = useCallback(() => {
    if (position) setFollow(true);
    else retry();
  }, [position, retry]);

  return (
    <div className="h-[100dvh] flex flex-col pb-nav">
      <header className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <Logo />
        <div className="flex items-center gap-2">
          {isSupabaseConfigured ? (
            <span className="flex items-center gap-1.5 font-mono text-[9.5px] tracking-wider text-lagoon-dim bg-lagoon/10 border border-lagoon/30 px-2 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-lagoon animate-blink" />
              EN DIRECT
            </span>
          ) : (
            <span
              className="font-mono text-[9.5px] tracking-wider text-ochre bg-ochre/10 border border-ochre/30 px-2 py-1 rounded-full"
              title="Base de données non branchée : données de démonstration, rien n'est enregistré"
            >
              MODE DÉMO
            </span>
          )}
          <Link href="/alertes" aria-label="Alertes" className="w-10 h-10 flex items-center justify-center text-mist">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-[22px] h-[22px]">
              <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" strokeLinejoin="round" />
              <path d="M10 20.5a2.2 2.2 0 0 0 4 0" strokeLinecap="round" />
            </svg>
          </Link>
        </div>
      </header>

      {banner && (
        <div role="status" className="mx-4 mb-2 rounded-xl border border-lagoon/30 bg-lagoon/10 px-3 py-2 text-[12px] text-mist">
          {banner}
        </div>
      )}

      <div className="relative flex-1 min-h-[180px]">
        <LiveMap
          reports={mapReports}
          position={position}
          radiusM={radiusM}
          selectedId={selectedId}
          follow={follow}
          onSelect={setSelectedId}
          onFollowChange={setFollow}
        />
        <div className="absolute top-2.5 left-3 right-3 z-10 flex items-start justify-between gap-2 pointer-events-none">
          <div className="pointer-events-auto">
            <RadiusSelector value={radiusKm} onChange={changeRadius} disabled={!position} />
          </div>
          <div className="pointer-events-auto">
            <RecenterButton
              active={follow && Boolean(position)}
              onClick={recenter}
              label={position ? "Recentrer sur ma position" : "Activer ma position"}
            />
          </div>
        </div>
        <Link
          href="/sos"
          aria-label="SOS — je suis en danger"
          className="absolute left-3 bottom-7 z-10 w-[52px] h-[52px] rounded-full flex items-center justify-center font-display font-bold text-[13px] text-white border-[3px] border-void shadow-[0_8px_20px_-6px_rgba(229,72,77,0.8)]"
          style={{ background: "radial-gradient(circle at 35% 30%, #F26A6E, #D3343A)" }}
        >
          SOS
        </Link>
      </div>

      <HomeSheet
        allReports={reports}
        reports={visible}
        status={status}
        error={error}
        updatedAt={updatedAt}
        geoStatus={geoStatus}
        radiusKm={radiusKm}
        hasCenter={Boolean(queryCenter)}
        filter={filter}
        onFilter={setFilter}
        onSelect={selectFromList}
        onEnableLocation={retry}
      />

      <BottomNav />

      {selectedReport && (
        <ReportDetail
          key={selectedReport.id}
          report={selectedReport}
          onClose={closeDetail}
          onUpdated={(patch) => {
            patchReport(selectedReport.id, patch);
            setLinkedReport((r) => (r && r.id === selectedReport.id ? { ...r, ...patch } : r));
          }}
          onRemoved={() => {
            patchReport(selectedReport.id, null);
            setSelectedId(null);
          }}
        />
      )}
    </div>
  );
}
