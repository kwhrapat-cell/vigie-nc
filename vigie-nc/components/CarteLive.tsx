"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LiveMap } from "./LiveMap";
import { Fab } from "./Fab";
import { SosButton } from "./SosButton";
import { TopBarLive } from "./TopBar";
import { ReportsSheet } from "./ReportsSheet";
import { ReportDetail } from "./ReportDetail";
import { RadiusKm, RadiusSelector, RADIUS_OPTIONS_KM, RecenterButton } from "./MapControls";
import { isSupabaseConfigured } from "@/lib/supabase";
import { distanceM, LatLng } from "@/lib/geo";
import { useWatchPosition } from "@/lib/useWatchPosition";
import { useLiveReports } from "@/lib/useLiveReports";
import { Report } from "@/lib/types";

const RADIUS_STORAGE_KEY = "vigie-nc:rayon-km";
const DEFAULT_RADIUS_KM: RadiusKm = 5;
// On ne relance la recherche que si l'on s'est déplacé d'au moins 250 m.
const REQUERY_DISTANCE_M = 250;

const SENT_MESSAGES: Record<string, string> = {
  cree: "Signalement envoyé — merci !",
  fusionne:
    "Déjà signalé à proximité : ton signalement compte comme une confirmation. Merci !",
  deja_signale: "Tu as déjà signalé cet événement — il est toujours sur la carte.",
};

function readStoredRadius(): RadiusKm {
  try {
    const v = Number(window.localStorage.getItem(RADIUS_STORAGE_KEY));
    return (RADIUS_OPTIONS_KM as readonly number[]).includes(v) ? (v as RadiusKm) : DEFAULT_RADIUS_KM;
  } catch {
    return DEFAULT_RADIUS_KM;
  }
}

export function CarteLive() {
  const { status: geoStatus, position, retry } = useWatchPosition();
  const [radiusKm, setRadiusKm] = useState<RadiusKm>(DEFAULT_RADIUS_KM);
  const [follow, setFollow] = useState(true);
  const [queryCenter, setQueryCenter] = useState<LatLng | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const selectedSnapshot = useRef<Report | null>(null);

  // Rayon mémorisé sur le téléphone
  useEffect(() => setRadiusKm(readStoredRadius()), []);
  const changeRadius = useCallback((km: RadiusKm) => {
    setRadiusKm(km);
    setFollow(true);
    try {
      window.localStorage.setItem(RADIUS_STORAGE_KEY, String(km));
    } catch {
      // stockage indisponible : le choix vaut pour cette visite seulement
    }
  }, []);

  // Message de retour après l'écran Signaler (?envoye=cree|fusionne|deja_signale)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sent = params.get("envoye");
    if (sent && SENT_MESSAGES[sent]) {
      setBanner(SENT_MESSAGES[sent]);
      window.history.replaceState(null, "", window.location.pathname);
      const t = setTimeout(() => setBanner(null), 6000);
      return () => clearTimeout(t);
    }
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
  const { reports, status, error, patchReport } = useLiveReports(queryCenter, radiusM);

  // Le signalement ouvert reste affiché même s'il disparaît de la liste
  // pendant qu'on le consulte (expiré entre-temps, par exemple).
  const selectedReport = useMemo(() => {
    if (!selectedId) return null;
    const found = reports.find((r) => r.id === selectedId) ?? null;
    if (found) selectedSnapshot.current = found;
    return found ?? (selectedSnapshot.current?.id === selectedId ? selectedSnapshot.current : null);
  }, [reports, selectedId]);

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
    <div className="h-[100dvh] flex flex-col">
      <TopBarLive demo={!isSupabaseConfigured} />

      {banner && (
        <div
          role="status"
          className="mx-3.5 mb-2 rounded-xl border border-lagoon/30 bg-lagoon/10 px-3 py-2 text-[12px] text-mist"
        >
          {banner}
        </div>
      )}

      <div className="relative flex-1 min-h-0">
        <LiveMap
          reports={reports}
          position={position}
          radiusM={radiusM}
          selectedId={selectedId}
          follow={follow}
          onSelect={setSelectedId}
          onFollowChange={setFollow}
        />
        <div className="absolute top-2.5 left-3.5 right-3.5 z-10 flex items-start justify-between gap-2 pointer-events-none">
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
      </div>

      <div className="relative">
        <Fab />
        <SosButton />
        <ReportsSheet
          reports={reports}
          status={status}
          error={error}
          geoStatus={geoStatus}
          radiusKm={radiusKm}
          hasCenter={Boolean(queryCenter)}
          onSelect={selectFromList}
          onEnableLocation={retry}
        />
      </div>

      {selectedReport && (
        <ReportDetail
          key={selectedReport.id}
          report={selectedReport}
          onClose={closeDetail}
          onUpdated={(patch) => patchReport(selectedReport.id, patch)}
          onRemoved={() => {
            patchReport(selectedReport.id, null);
            setSelectedId(null);
          }}
        />
      )}
    </div>
  );
}
