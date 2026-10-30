"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LiveMap } from "./LiveMap";
import { HomeSheet } from "./HomeSheet";
import { ReportDetail } from "./ReportDetail";
import { BottomNav, NavOrdi } from "./BottomNav";
import { BandeauPanneauReplie } from "./BandeauPanneauReplie";
import { VigilanceMeteo } from "./VigilanceMeteo";
import { WelcomeNotice } from "./WelcomeNotice";
import { AnnonceBanner } from "./AnnonceBanner";
import { TravauxBanner } from "./TravauxBanner";
import { ImpactBanner } from "./ImpactBanner";
import { TrajetResume } from "./TrajetResume";
import { AUCUN_BANDEAU, Bandeau, masquePar, Presences } from "@/lib/bandeaux";
import { avatarSvg } from "@/lib/avatar";
import { useNiveau } from "@/lib/useNiveau";
import { DemandeConfirmation } from "./DemandeConfirmation";
import { BandeauConduite, BarreConduite, BoutonConduite, useModeConduite } from "./ModeConduite";
import { Logo } from "./ui";
import { PleinEcranButton, RecenterButton, ZoneSelector } from "./MapControls";
import { CONDUITE_RECENTRAGE_MS } from "@/lib/conduite";
import { isSupabaseConfigured } from "@/lib/supabase";
import { distanceM, LatLng } from "@/lib/geo";
import {
  estOrdiSouris,
  MapStyle,
  readMapStyle,
  readPanneauReplie,
  readRadiusKm,
  readZoneChoice,
  savePanneauReplie,
  saveZoneChoice,
  ZoneChoice,
} from "@/lib/preferences";
import { fetchReport } from "@/lib/reports-api";
import { useWatchPosition } from "@/lib/useWatchPosition";
import { useLiveReports } from "@/lib/useLiveReports";
import type { Point } from "@/lib/trajet";
import { Category, Report, REPORT_TYPE_CATEGORY } from "@/lib/types";

// On ne relance la recherche que si l'on s'est déplacé d'au moins 250 m.
const REQUERY_DISTANCE_M = 250;

const CATEGORIES: Category[] = ["danger", "perturbation", "meteo"];

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

  // Trajet favori : ligne sur la carte (à la demande) et ses signalements,
  // ajoutés à la carte quand la ligne est affichée (même hors zone).
  const [trajetLigne, setTrajetLigne] = useState<Point[] | null>(null);
  const [cadrageTrajet, setCadrageTrajet] = useState(0);
  const [trajetReports, setTrajetReports] = useState<Report[]>([]);
  const [trajetDemande, setTrajetDemande] = useState(false);
  const montrerTrajet = useCallback((points: Point[] | null, cadrer: boolean) => {
    setTrajetLigne(points);
    if (points && cadrer) setCadrageTrajet((n) => n + 1);
  }, []);

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

  // Ordinateur (960 px et plus) : panneau de gauche ouvert ou replié (la
  // carte prend alors tout l'écran). Choix gardé sur l'appareil. Après un
  // clic, le focus passe au bouton qui fait l'inverse (clavier).
  const [panneauReplie, setPanneauReplie] = useState(false);
  const boutonOuvrirRef = useRef<HTMLButtonElement>(null);
  const boutonReplierRef = useRef<HTMLButtonElement>(null);
  const [focusApres, setFocusApres] = useState(false);
  const changerPanneau = useCallback((replie: boolean) => {
    setPanneauReplie(replie);
    savePanneauReplie(replie);
    setFocusApres(true);
  }, []);
  useEffect(() => {
    if (!focusApres) return;
    setFocusApres(false);
    (panneauReplie ? boutonOuvrirRef : boutonReplierRef).current?.focus();
  }, [focusApres, panneauReplie]);

  useEffect(() => {
    // Sur un ordinateur, la position est approximative : toute la Calédonie
    // tant que la personne n'a pas choisi de zone.
    setZone(readZoneChoice(estOrdiSouris() ? "nc" : undefined));
    setMapStyle(readMapStyle());
    setPanneauReplie(readPanneauReplie());
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
    // Lien du trajet favori (notification avant départ, écran Alertes)
    if (params.get("trajet") === "1") {
      setTrajetDemande(true);
      if (!id) window.history.replaceState(null, "", window.location.pathname);
    }
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

  // Chiffres du bandeau du panneau replié (comme les compteurs de la liste)
  const counts = useMemo(
    () =>
      CATEGORIES.reduce(
        (acc, c) => ({ ...acc, [c]: reports.filter((r) => REPORT_TYPE_CATEGORY[r.type] === c).length }),
        {} as Record<Category, number>,
      ),
    [reports],
  );

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
    if (trajetLigne && trajetReports.length > 0) {
      const ids = new Set(liste.map((r) => r.id));
      const enPlus = trajetReports.filter((r) => !ids.has(r.id));
      if (enPlus.length > 0) liste = [...liste, ...enPlus];
    }
    if (selectedReport && selectedReport.active !== false && !liste.some((r) => r.id === selectedReport.id)) {
      return [...liste, selectedReport];
    }
    return liste;
  }, [visible, selectedReport, enConduite, conduite.reports, trajetLigne, trajetReports]);

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

  // Téléphone et tablette en portrait : en-tête et bandeaux, carte, puis
  // liste en dessous. Ordinateur et tablette en paysage (960 px et plus) :
  // grille à deux colonnes, panneau à gauche (en-tête, menu, bandeaux puis
  // liste), carte à droite sur toute la hauteur ; panneau replié : la carte
  // prend tout l'écran avec un petit bandeau (BandeauPanneauReplie). Même
  // ordre dans la page dans tous les cas (lecteurs d'écran, clavier). En
  // conduite, toujours la carte en plein écran.
  const grille = panneauReplie
    ? "lg:grid-cols-1"
    : "lg:grid-cols-[400px_minmax(0,1fr)] xl:grid-cols-[440px_minmax(0,1fr)]";
  return (
    <div
      className={`h-[100dvh] flex flex-col ${
        enConduite ? "" : `pb-nav lg:!pb-0 lg:grid ${grille} lg:grid-rows-[auto_minmax(0,1fr)]`
      }`}
    >
      {enConduite && (
        <BandeauConduite
          conduite={conduite}
          reglagesOuverts={reglagesConduite}
          onFermerReglages={() => setReglagesConduite(false)}
        />
      )}

      {/* Masqués (pas démontés) pendant la conduite, pour laisser la carte.
          Sur ordinateur : haut de la colonne de gauche. */}
      <div
        id="panneau-accueil"
        className={
          enConduite
            ? "hidden"
            : `contents lg:block lg:col-start-1 lg:row-start-1 lg:bg-panel lg:border-r lg:border-line ${
                panneauReplie ? "lg:!hidden" : ""
              }`
        }
      >
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
          {/* Ordinateur : replier le panneau, la carte prend tout l'écran */}
          <button
            ref={boutonReplierRef}
            type="button"
            onClick={() => changerPanneau(true)}
            aria-expanded={true}
            aria-controls="panneau-accueil"
            aria-label="Replier le panneau pour agrandir la carte"
            className="hidden lg:flex items-center gap-1.5 min-h-[40px] rounded-xl border border-line bg-panel-2 hover:border-lagoon/50 px-3 text-[13.5px] font-medium text-mist"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
            Replier
          </button>
        </div>
      </header>

      {/* Ordinateur : le menu est ici, pas de barre à part */}
      <NavOrdi />

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

      <div
        className={`relative flex-1 min-h-[180px] lg:row-start-1 lg:row-span-2 ${
          panneauReplie ? "lg:col-start-1" : "lg:col-start-2"
        }`}
      >
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
          ligne={trajetLigne}
          cadrerLigne={cadrageTrajet}
        />
        <div className="absolute top-2.5 left-3 right-3 z-10 flex items-start justify-between gap-2 pointer-events-none">
          <div className="pointer-events-auto flex flex-col items-start gap-2.5">
            {/* Ordinateur, panneau replié : logo, chiffres, bouton pour rouvrir */}
            {!enConduite && panneauReplie && (
              <BandeauPanneauReplie counts={counts} onOuvrir={() => changerPanneau(false)} boutonRef={boutonOuvrirRef} />
            )}
            {!enConduite && <ZoneSelector value={zone} onChange={changeZone} hasPosition={Boolean(position)} />}
            {/* Ordinateur : vigilance Météo-France sous le choix de la vue
                (la vignette ne se charge pas sur téléphone : masquée) */}
            {!enConduite && (
              <div className="hidden lg:block">
                <VigilanceMeteo className="w-[326px] shadow-[0_12px_28px_-14px_rgba(0,0,0,0.85)]" />
              </div>
            )}
          </div>
          <div className="pointer-events-auto flex flex-col gap-2">
            <RecenterButton
              active={!isNc && follow && Boolean(position)}
              onClick={recenter}
              label={position ? "Revenir sur ma position" : "Activer ma position"}
            />
            {/* En conduite, les commandes sont dans la barre du bas (gros
                boutons). Sur ordinateur, pas de mode conduite. */}
            {!enConduite && !conduite.dansAppli && (
              <div className="lg:hidden">
                <BoutonConduite onClick={conduite.demarrer} />
              </div>
            )}
            {/* Ordinateur : plein écran (écran de salle de crise) */}
            {!enConduite && (
              <div className="hidden lg:block">
                <PleinEcranButton />
              </div>
            )}
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
        replieOrdi={panneauReplie}
        trajet={
          <TrajetResume
            actualisation={updatedAt}
            demandeOuverture={trajetDemande}
            ligneAffichee={Boolean(trajetLigne)}
            onLigne={montrerTrajet}
            onReports={setTrajetReports}
            onOpen={openFromBanner}
          />
        }
      />

      <BottomNav rail={false} />
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
