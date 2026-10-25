"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LiveMap } from "./LiveMap";
import { HomeSheet } from "./HomeSheet";
import { ReportDetail } from "./ReportDetail";
import { BottomNav } from "./BottomNav";
import { WelcomeNotice } from "./WelcomeNotice";
import { AnnonceBanner } from "./AnnonceBanner";
import { TravauxBanner } from "./TravauxBanner";
import { ImpactBanner } from "./ImpactBanner";
import { AUCUN_BANDEAU, Bandeau, masquePar, Presences } from "@/lib/bandeaux";
import { avatarSvg } from "@/lib/avatar";
import { useNiveau } from "@/lib/useNiveau";
import { useVigiesAutour } from "@/lib/useVigiesAutour";
import { DemandeConfirmation } from "./DemandeConfirmation";
import { BandeauConduite, BarreConduite, BoutonConduite, useModeConduite } from "./ModeConduite";
import { Logo } from "./ui";
import { RecenterButton, ZoneSelector } from "./MapControls";
import { CONDUITE_RECENTRAGE_MS } from "@/lib/conduite";
import { isSupabaseConfigured } from "@/lib/supabase";
import { distanceM, LatLng } from "@/lib/geo";
import { MapStyle, readMapStyle, readRadiusKm, readZoneChoice, saveZoneChoice, ZoneChoice } from "@/lib/preferences";
import { fetchReport } from "@/lib/reports-api";
import { useWatchPosition } from "@/lib/useWatchPosition";
import { useLiveReports } from "@/lib/useLiveReports";
import { Category, Report, REPORT_TYPE_CATEGORY } from "@/lib/types";

// On ne relance la recherche que si l'on s'est déplacé d'au moins 250 m.
const REQUERY_DISTANCE_M = 250;

export function CarteLive() {
  const { status: geoStatus, position, retry } = useWatchPosition();
  const [zone, setZone] = useState<ZoneChoice>(5);
  const [mapStyle, setMapStyle] = useState<MapStyle>("plan");
  const [follow, setFollow] = useState(true);
  const [queryCenter, setQueryCenter] = useState<LatLng | null>(null);
  const [filter, setFilter] = useState<Category | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [linkedReport, setLinkedReport] = useState<Report | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const selectedSnapshot = useRef<Report | null>(null);

  // « 12 vigies actives autour de toi » (total calculé par la base)
  const vigies = useVigiesAutour(position);

  // Ton cagou à ta position, selon ton niveau (lib/niveaux.ts) ; point bleu
  // simple si tu l'as choisi dans le Profil.
  const niveau = useNiveau();
  const avatar = useMemo(
    () => (niveau.pret && niveau.cagouSurCarte ? avatarSvg(niveau.rang, 54) : null),
    [niveau.pret, niveau.cagouSurCarte, niveau.rang],
  );

  // Bandeaux au-dessus de la carte : un seul à la fois, le plus important
  // d'abord (lib/bandeaux.ts). Chacun dit s'il a quelque chose à montrer.
  const [presences, setPresences] = useState<Presences>(AUCUN_BANDEAU);
  const presence = useCallback((b: Bandeau, v: boolean) => {
    setPresences((p) => (p[b] === v ? p : { ...p, [b]: v }));
  }, []);
  const presenceAnnonce = useCallback(
    (niveau: "alerte" | "info" | null) => {
      presence("annonce-alerte", niveau === "alerte");
      presence("annonce-info", niveau === "info");
    },
    [presence],
  );
  const presenceDemande = useCallback((v: boolean) => presence("demande", v), [presence]);
  const presenceTravaux = useCallback((v: boolean) => presence("travaux", v), [presence]);
  const presenceImpact = useCallback((v: boolean) => presence("impact", v), [presence]);

  // Mode conduite : la carte prend tout l'écran et suit le conducteur.
  const conduite = useModeConduite();
  const enConduite = conduite.actif;
  const [reglagesConduite, setReglagesConduite] = useState(false);

  useEffect(() => {
    setZone(readZoneChoice());
    setMapStyle(readMapStyle());
  }, []);
  const changeZone = useCallback((z: ZoneChoice) => {
    setZone(z);
    setFollow(true);
    saveZoneChoice(z);
  }, []);

  // En conduite, toujours la vue autour de soi (la vue Calédonie ne suit pas).
  const isNc = zone === "nc" && !enConduite;
  const radiusKm = zone === "nc" ? readRadiusKm() : zone;

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
  const { reports: rawReports, status, error, updatedAt, patchReport } = useLiveReports(
    isNc ? null : queryCenter,
    radiusM,
  );

  // En vue Calédonie, la base ne calcule pas les distances : on les calcule
  // ici depuis la position, et on trie du plus proche au plus loin.
  const reports = useMemo(() => {
    if (!position) return rawReports;
    const withDistance = rawReports.map((r) =>
      r.distanceM == null ? { ...r, distanceM: distanceM(position, r) } : r,
    );
    return isNc ? [...withDistance].sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0)) : withDistance;
  }, [rawReports, position, isNc]);

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
      conduite.reports.find((r) => r.id === selectedId) ??
      (linkedReport?.id === selectedId ? linkedReport : null);
    if (found) selectedSnapshot.current = found;
    return found ?? (selectedSnapshot.current?.id === selectedId ? selectedSnapshot.current : null);
  }, [reports, conduite.reports, selectedId, linkedReport]);

  // Pour la carte : en conduite, ajoute ce que le mode conduite a trouvé
  // jusqu'à 13 km (les 10 km du point route peuvent dépasser la zone) ; et
  // le signalement ouvert par lien s'il est hors zone.
  const mapReports = useMemo(() => {
    let liste = visible;
    if (enConduite && conduite.reports.length > 0) {
      const ids = new Set(liste.map((r) => r.id));
      const enPlus = conduite.reports.filter((r) => r.type !== "sos" && !ids.has(r.id));
      if (enPlus.length > 0) liste = [...liste, ...enPlus];
    }
    if (selectedReport && selectedReport.active !== false && !liste.some((r) => r.id === selectedReport.id)) {
      return [...liste, selectedReport];
    }
    return liste;
  }, [visible, selectedReport, enConduite, conduite.reports]);

  const selectFromList = useCallback((id: string) => {
    setSelectedId(id);
    setFollow(false);
  }, []);

  // Depuis le bandeau des travaux : ouvre la fiche, même hors de la zone
  // affichée (jusqu'à 10 km), puis la rafraîchit depuis la base.
  const openFromBanner = useCallback((r: Report) => {
    setLinkedReport(r);
    setSelectedId(r.id);
    setFollow(false);
    fetchReport(r.id)
      .then((fresh) => {
        if (fresh) setLinkedReport({ ...fresh, distanceM: fresh.distanceM ?? r.distanceM });
      })
      .catch(() => {});
  }, []);

  // Depuis le bandeau « Ton signalement a servi » : ouvre la fiche, même hors zone.
  const openById = useCallback((id: string) => {
    setSelectedId(id);
    setFollow(false);
    fetchReport(id)
      .then((r) => {
        if (r) setLinkedReport(r);
      })
      .catch(() => {});
  }, []);

  const closeDetail = useCallback(() => setSelectedId(null), []);

  // Au départ du mode conduite : fiche fermée, la carte suit le conducteur.
  useEffect(() => {
    if (enConduite) {
      setSelectedId(null);
      setFollow(true);
    } else {
      setReglagesConduite(false);
    }
  }, [enConduite]);

  // En conduite, si l'on a déplacé la carte à la main, elle revient toute
  // seule sur le conducteur (sauf pendant la lecture d'une fiche).
  useEffect(() => {
    if (!enConduite || follow || selectedId) return;
    const t = window.setTimeout(() => setFollow(true), CONDUITE_RECENTRAGE_MS);
    return () => window.clearTimeout(t);
  }, [enConduite, follow, selectedId]);

  // « Ma position » : revient sur la zone autour de soi (dernier rayon choisi)
  const recenter = useCallback(() => {
    if (!position) {
      retry();
      return;
    }
    if (isNc) changeZone(readRadiusKm());
    else setFollow(true);
  }, [position, retry, isNc, changeZone]);

  return (
    <div className={`h-[100dvh] flex flex-col ${enConduite ? "" : "pb-nav"}`}>
      {enConduite && (
        <BandeauConduite
          conduite={conduite}
          reglagesOuverts={reglagesConduite}
          onFermerReglages={() => setReglagesConduite(false)}
        />
      )}

      {/* Masqués (pas démontés) pendant la conduite, pour laisser la carte. */}
      <div className={enConduite ? "hidden" : "contents"}>
      <header className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <Logo />
        {/* Les alertes sont dans la barre du bas : pas de deuxième cloche ici. */}
        <div className="flex items-center gap-2">
          {isSupabaseConfigured ? (
            <span className="flex items-center gap-1.5 font-mono text-[12px] tracking-wider text-lagoon-dim bg-lagoon/10 border border-lagoon/30 px-2 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-lagoon animate-blink" />
              EN DIRECT
            </span>
          ) : (
            <span
              className="font-mono text-[12px] tracking-wider text-ochre bg-ochre/10 border border-ochre/30 px-2 py-1 rounded-full"
              title="Base de données non branchée : données de démonstration, rien n'est enregistré"
            >
              MODE DÉMO
            </span>
          )}
        </div>
      </header>

      {/* Un seul bandeau à la fois (lib/bandeaux.ts) : annonce urgente,
          « Tu passes par là ? », annonce info, travaux, merci. Les autres
          attendent leur tour sans rien perdre. */}

      {/* Annonces générales : vues par tout le monde, quelle que soit la zone */}
      <AnnonceBanner
        masque={!presences["annonce-alerte"] && masquePar("annonce-info", presences)}
        onPresence={presenceAnnonce}
      />

      {/* « Tu passes par là ? » : jamais pendant la conduite */}
      {!enConduite && (
        <DemandeConfirmation
          reports={reports}
          position={position}
          onVoted={patchReport}
          masque={masquePar("demande", presences)}
          onPresence={presenceDemande}
        />
      )}

      {/* Travaux près de toi (10 km), à l'ouverture de l'appli */}
      <TravauxBanner
        position={position}
        onOpen={openFromBanner}
        masque={masquePar("travaux", presences)}
        onPresence={presenceTravaux}
      />

      {/* Mes signalements confirmés par d'autres (gardés sur le téléphone) */}
      <ImpactBanner onOpen={openById} masque={masquePar("impact", presences)} onPresence={presenceImpact} />

      {banner && (
        <div role="status" className="mx-4 mb-2 rounded-xl border border-lagoon/30 bg-lagoon/10 px-3 py-2 text-[14px] text-mist">
          {banner}
        </div>
      )}
      </div>

      <div className="relative flex-1 min-h-[180px]">
        <LiveMap
          reports={mapReports}
          position={position}
          scope={isNc ? "nc" : "zone"}
          radiusM={radiusM}
          mapStyle={mapStyle}
          selectedId={selectedId}
          follow={follow}
          onSelect={setSelectedId}
          onFollowChange={setFollow}
          highlightIds={enConduite ? conduite.idsDevant : undefined}
          avatar={avatar}
        />
        <div className="absolute top-2.5 left-3 right-3 z-10 flex items-start justify-between gap-2 pointer-events-none">
          <div className="pointer-events-auto">
            {!enConduite && <ZoneSelector value={zone} onChange={changeZone} hasPosition={Boolean(position)} />}
          </div>
          <div className="pointer-events-auto flex flex-col gap-2">
            <RecenterButton
              active={!isNc && follow && Boolean(position)}
              onClick={recenter}
              label={position ? "Revenir sur ma position" : "Activer ma position"}
            />
            {/* En conduite, les commandes sont dans la barre du bas (gros boutons) */}
            {!enConduite && !conduite.dansAppli && <BoutonConduite onClick={conduite.demarrer} />}
          </div>
        </div>
        <Link
          href="/sos"
          aria-label="SOS — je suis en danger"
          className="absolute left-3 bottom-7 z-10 w-[52px] h-[52px] rounded-full flex items-center justify-center font-display font-bold text-[15px] text-white border-[3px] border-void shadow-[0_8px_20px_-6px_rgba(229,72,77,0.8)]"
          style={{ background: "radial-gradient(circle at 35% 30%, #F26A6E, #D3343A)" }}
        >
          SOS
        </Link>
      </div>

      {enConduite && (
        <BarreConduite
          conduite={conduite}
          reglagesOuverts={reglagesConduite}
          onReglages={() => setReglagesConduite((o) => !o)}
        />
      )}

      <div className={enConduite ? "hidden" : "contents"}>
      <HomeSheet
        allReports={reports}
        reports={visible}
        status={status}
        error={error}
        updatedAt={updatedAt}
        geoStatus={geoStatus}
        radiusKm={radiusKm}
        scope={isNc ? "nc" : "zone"}
        hasCenter={!isNc && Boolean(queryCenter)}
        filter={filter}
        onFilter={setFilter}
        onSelect={selectFromList}
        onEnableLocation={retry}
        vigies={vigies}
      />

      <BottomNav />
      </div>

      {selectedReport && (
        <ReportDetail
          key={selectedReport.id}
          report={selectedReport}
          userPosition={position}
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

      <WelcomeNotice />
    </div>
  );
}
