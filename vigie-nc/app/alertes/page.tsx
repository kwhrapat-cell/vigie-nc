"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertSettings, WhatTriggers } from "@/components/AlertSettings";
import { TrajetSettings } from "@/components/TrajetSettings";
import { BottomNav } from "@/components/BottomNav";
import { ContenuLigneSignalement } from "@/components/LigneSignalement";
import { ScreenHeader } from "@/components/ui";
import { VigilanceMeteo } from "@/components/VigilanceMeteo";
import {
  grouperFil,
  OngletAlertes,
  ongletDepuisAncre,
  resumeAlertes,
  texteFilVide,
} from "@/lib/alertes-ecran";
import { LatLng } from "@/lib/geo";
import { libelleMiseAJour } from "@/lib/legende";
import { readPointZone, readRadiusKm } from "@/lib/preferences";
import { useEtatAlertes } from "@/lib/useEtatAlertes";
import { useLenteur } from "@/lib/useLenteur";
import { useLiveReports } from "@/lib/useLiveReports";
import { useWatchPosition } from "@/lib/useWatchPosition";

type Scope = "zone" | "tout";

const ONGLETS: [OngletAlertes, string][] = [
  ["en-cours", "En cours"],
  ["prevenir", "Être prévenu"],
];

/**
 * Écran Alertes (revue de design du 11/11/2026) : deux onglets au lieu d'une
 * longue page qui mélangeait tout.
 *  - « En cours » : est-ce que ce téléphone est prévenu (une ligne), la
 *    vigilance Météo-France, puis le fil de ce qui est signalé, du plus
 *    récent au plus ancien (l'accueil, lui, range par distance).
 *  - « Être prévenu » : lieu d'alerte et trajet (#prevenir, #trajet).
 */
export default function AlertesPage() {
  const [onglet, setOnglet] = useState<OngletAlertes>("en-cours");
  // « Activer » touché dans « En cours » : l'éditeur s'ouvre tout de suite.
  const [demarrerAlertes, setDemarrerAlertes] = useState(false);

  useEffect(() => {
    const lire = () => setOnglet(ongletDepuisAncre(window.location.hash));
    lire();
    window.addEventListener("hashchange", lire);
    return () => window.removeEventListener("hashchange", lire);
  }, []);

  function choisir(o: OngletAlertes, activer = false) {
    setDemarrerAlertes(activer);
    setOnglet(o);
    // Garder l'onglet au rechargement, sans ajouter d'étape au bouton Retour.
    const url = o === "prevenir" ? "#prevenir" : window.location.pathname + window.location.search;
    window.history.replaceState(window.history.state, "", url);
    window.scrollTo({ top: 0 });
  }

  return (
    <main className="min-h-[100dvh] pb-nav">
      <ScreenHeader title="Alertes" />

      <div className="mx-4 mb-3 grid grid-cols-2 gap-1 rounded-xl border border-line bg-panel p-1" role="tablist">
        {ONGLETS.map(([o, label]) => (
          <button
            key={o}
            id={`onglet-${o}`}
            type="button"
            role="tab"
            aria-selected={onglet === o}
            aria-controls={`panneau-${o}`}
            onClick={() => choisir(o)}
            className={`min-h-[44px] rounded-lg text-[15px] font-semibold ${
              onglet === o ? "bg-primary text-white" : "text-mist-dim"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {onglet === "en-cours" ? (
        <section id="panneau-en-cours" role="tabpanel" aria-labelledby="onglet-en-cours">
          <LigneEtatAlertes onOuvrir={(activer) => choisir("prevenir", activer)} />
          <VigilanceMeteo className="mx-4 mb-3" />
          <FilEnCours />
        </section>
      ) : (
        <section id="panneau-prevenir" role="tabpanel" aria-labelledby="onglet-prevenir">
          <p className="mx-4 mb-3 text-[14px] leading-relaxed text-mist-dim">
            Vigie NC te prévient sur ce téléphone, même l&apos;appli fermée : près d&apos;un lieu que tu choisis, et
            sur ton trajet de tous les jours.
          </p>
          <AlertSettings demarrer={demarrerAlertes} />
          <TrajetSettings />
          <section className="mx-4 mb-3 rounded-xl border border-line bg-panel px-4 py-3" aria-labelledby="alertes-quand">
            <h2 id="alertes-quand" className="text-[15px] font-semibold">
              Quand reçois-tu une alerte ?
            </h2>
            <WhatTriggers />
          </section>
        </section>
      )}

      <BottomNav />
    </main>
  );
}

function IconeCloche({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
      <path d="M10.3 20a2 2 0 0 0 3.4 0" />
    </svg>
  );
}

/** Une ligne : ce téléphone est-il prévenu ? Touchée, elle ouvre « Être prévenu ». */
function LigneEtatAlertes({ onOuvrir }: { onOuvrir: (activer: boolean) => void }) {
  const { etat, avecTrajet } = useEtatAlertes();
  const r = resumeAlertes(etat, avecTrajet);
  if (!r) {
    // Même hauteur pendant le chargement : rien ne saute à l'écran.
    return <div className="mx-4 mb-3 h-[64px] rounded-xl border border-line bg-panel" aria-hidden="true" />;
  }
  return (
    <button
      type="button"
      onClick={() => onOuvrir(r.action === "activer")}
      className={`mx-4 mb-3 flex min-h-[64px] w-[calc(100%-2rem)] items-center gap-3 rounded-xl border bg-panel px-3 py-2.5 text-left ${
        r.actif ? "border-primary/60" : "border-line"
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          r.actif ? "bg-primary/20 text-lagoon" : "bg-panel-2 text-mist-dim"
        }`}
      >
        <IconeCloche className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-[15px] font-semibold">{r.titre}</b>
        <span className="block text-[13.5px] leading-snug text-mist-dim">{r.detail}</span>
      </span>
      {r.action === "activer" ? (
        <span className="flex min-h-[44px] shrink-0 items-center rounded-lg bg-primary px-4 text-[15px] font-semibold text-white">
          Activer
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-0.5 text-[14px] font-medium text-lagoon">
          {r.action === "regler" ? "Régler" : "Voir"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden="true">
            <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </button>
  );
}

/** Le fil : ce qui est signalé, du plus récent au plus ancien. */
function FilEnCours() {
  const { position, status: geoStatus } = useWatchPosition();
  const [scope, setScope] = useState<Scope>("zone");
  const [radiusKm, setRadiusKm] = useState(5);
  const [pointZone, setPointZone] = useState<LatLng | null>(null);
  const [gpsFixe, setGpsFixe] = useState<LatLng | null>(null);

  useEffect(() => {
    setRadiusKm(readRadiusKm());
    // « Ma zone » choisie sur la carte (ordinateurs des mairies) : sert de
    // centre tant qu'il n'y a pas de vraie position.
    setPointZone(readPointZone());
  }, []);
  // Position figée à la première mesure : une liste qui bouge sans cesse
  // serait illisible.
  useEffect(() => {
    if (position && !gpsFixe) setGpsFixe({ lat: position.lat, lng: position.lng });
  }, [position, gpsFixe]);

  const centre = gpsFixe ?? pointZone;
  const sansGps = geoStatus === "denied" || geoStatus === "unsupported" || geoStatus === "unavailable";
  const noPosition = !centre && sansGps;
  const effectiveScope: Scope = noPosition ? "tout" : scope;
  const waitingForPosition = effectiveScope === "zone" && !centre;

  const { reports, status, error, updatedAt } = useLiveReports(
    waitingForPosition ? null : effectiveScope === "zone" ? centre : null,
    radiusKm * 1000,
  );
  const lent = useLenteur(status === "loading" || waitingForPosition);
  const groupes = useMemo(() => grouperFil(reports), [reports]);
  const vide = status === "ready" && !waitingForPosition && reports.length === 0;

  return (
    <>
      <div className="mx-4 mb-1.5 grid grid-cols-2 gap-1 rounded-xl border border-line bg-panel p-1" role="radiogroup" aria-label="Où regarder">
        {(
          [
            ["zone", `Ma zone (${radiusKm} km)`],
            ["tout", "Toute la Calédonie"],
          ] as [Scope, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={effectiveScope === value}
            disabled={value === "zone" && noPosition}
            onClick={() => setScope(value)}
            className={`min-h-[44px] rounded-lg text-[14.5px] font-medium disabled:opacity-40 ${
              effectiveScope === value ? "bg-panel-2 text-mist ring-1 ring-lagoon/60" : "text-mist-dim"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="mx-4 mb-2 text-[12.5px] text-mist-dim" aria-live="polite">
        {waitingForPosition ? (lent ? "Recherche de ta position… (long)" : "Recherche de ta position…") : libelleMiseAJour(status, updatedAt, lent)}
      </p>

      {noPosition && (
        <p className="mx-4 mb-3 text-[13.5px] text-warn">Position indisponible : affichage de toute la Calédonie.</p>
      )}
      {error && (
        <p className="mx-4 mb-3 text-[14px] text-warn" role="status">
          {error}
        </p>
      )}

      {vide && (
        <div className="mx-4 rounded-xl border border-line bg-panel px-4 py-5 text-center">
          <p className="text-[15px]">{texteFilVide(effectiveScope === "zone", radiusKm)}</p>
          <p className="mt-1 text-[13.5px] text-mist-dim">
            Ça ne garantit pas que la route est dégagée : reste prudent.
          </p>
        </div>
      )}

      {!waitingForPosition &&
        groupes.map((g) => (
          <section key={g.cle} aria-label={g.titre}>
            {groupes.length > 1 && (
              <h2 className="mx-4 mb-1.5 mt-3 text-[13px] font-semibold uppercase tracking-wide text-mist-dim">
                {g.titre}
              </h2>
            )}
            <ul className="mx-4 flex flex-col gap-2">
              {g.signalements.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/?signalement=${r.id}`}
                    className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2.5"
                  >
                    <ContenuLigneSignalement r={r} tailleIcone={40} />
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 shrink-0 text-mist-dim" aria-hidden="true">
                      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </>
  );
}
