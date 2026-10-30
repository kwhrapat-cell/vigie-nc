"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatAgeShort } from "@/lib/geo";
import { fetchTrajetReports, TrajetSignalement } from "@/lib/reports-api";
import {
  depuisDepartTexte,
  lireTrajet,
  NiveauTrajet,
  Point,
  texteVerdict,
  TRAJET_EVENT,
  TRAJET_INVITE_CLE,
  TrajetLocal,
  verdictTrajet,
} from "@/lib/trajet";
import type { Report } from "@/lib/types";
import { ReliabilityBadge, TypeTile } from "./ui";

// Relecture : toutes les 2 min tant que l'appli est à l'écran, au retour
// sur l'appli, et quand la carte reçoit du nouveau (30 s d'écart au moins).
const RELECTURE_MS = 2 * 60_000;
const ECART_MIN_MS = 30_000;

const COULEURS: Record<NiveauTrajet, string> = {
  calme: "border-ok/40 bg-ok/10 text-ok",
  surveiller: "border-warn/40 bg-warn/10 text-warn",
  danger: "border-danger/50 bg-danger/15 text-danger",
};

function RouteIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <circle cx="6" cy="19" r="2.5" />
      <circle cx="18" cy="5" r="2.5" />
      <path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5" />
    </svg>
  );
}

/**
 * Accueil : le point sur le trajet favori, en un coup d'œil (« Rien de
 * signalé », « 1 à surveiller », « 2 dangers »). Déplié : la liste dans
 * l'ordre de la route, et la ligne sur la carte. Sans trajet : une
 * invitation discrète à l'ajouter (fermable pour toujours).
 */
export function TrajetResume({
  actualisation,
  demandeOuverture,
  ligneAffichee,
  onLigne,
  onReports,
  onOpen,
}: {
  /** Change quand la carte reçoit du nouveau (relecture). */
  actualisation: unknown;
  /** Lien « ?trajet=1 » (notification, écran Alertes) : déplier et montrer la ligne. */
  demandeOuverture: boolean;
  ligneAffichee: boolean;
  /** Montrer (points) ou masquer (null) la ligne sur la carte, `cadrer` pour la recadrer. */
  onLigne: (points: Point[] | null, cadrer: boolean) => void;
  onReports: (reports: Report[]) => void;
  onOpen: (r: Report) => void;
}) {
  const [trajet, setTrajet] = useState<TrajetLocal | null>(null);
  const [pret, setPret] = useState(false);
  const [invite, setInvite] = useState(false);
  const [liste, setListe] = useState<TrajetSignalement[] | null>(null);
  const [erreur, setErreur] = useState(false);
  const [deplie, setDeplie] = useState(false);
  const derniereLecture = useRef(0);
  const ouvertureFaite = useRef(false);

  // Trajet gardé sur le téléphone (et ses changements depuis l'écran Alertes)
  useEffect(() => {
    const relire = () => {
      const t = lireTrajet();
      setTrajet(t);
      setListe(null);
      if (!t) onLigne(null, false);
    };
    relire();
    try {
      setInvite(window.localStorage.getItem(TRAJET_INVITE_CLE) !== "fermee");
    } catch {
      setInvite(true);
    }
    setPret(true);
    window.addEventListener(TRAJET_EVENT, relire);
    return () => window.removeEventListener(TRAJET_EVENT, relire);
  }, [onLigne]);

  const lire = useCallback(
    async (force: boolean) => {
      if (!trajet) return;
      const maintenant = Date.now();
      if (!force && maintenant - derniereLecture.current < ECART_MIN_MS) return;
      derniereLecture.current = maintenant;
      try {
        const out = await fetchTrajetReports(trajet.points);
        setListe(out);
        setErreur(false);
      } catch {
        setErreur(true);
      }
    },
    [trajet],
  );

  useEffect(() => {
    if (!trajet) return;
    void lire(true);
    const minuteur = window.setInterval(() => {
      if (document.visibilityState === "visible") void lire(false);
    }, RELECTURE_MS);
    const retour = () => {
      if (document.visibilityState === "visible") void lire(false);
    };
    document.addEventListener("visibilitychange", retour);
    return () => {
      window.clearInterval(minuteur);
      document.removeEventListener("visibilitychange", retour);
    };
  }, [trajet, lire]);

  // La carte a reçu du nouveau : relecture (pas plus d'une fois par 30 s)
  useEffect(() => {
    if (actualisation) void lire(false);
  }, [actualisation, lire]);

  const reports = useMemo(() => (liste ?? []).map((x) => x.report), [liste]);
  useEffect(() => onReports(reports), [reports, onReports]);

  // Ouverture demandée par un lien (?trajet=1) : une fois le trajet lu
  useEffect(() => {
    if (!demandeOuverture || !trajet || ouvertureFaite.current) return;
    ouvertureFaite.current = true;
    setDeplie(true);
    onLigne(trajet.points, true);
  }, [demandeOuverture, trajet, onLigne]);

  const verdict = useMemo(() => verdictTrajet(reports), [reports]);
  const positions = useMemo(
    () => new Map<string, number>((liste ?? []).map((x) => [x.report.id, x.positionM] as [string, number])),
    [liste],
  );

  if (!pret) return null;

  if (!trajet) {
    if (!invite) return null;
    return (
      <div className="mt-2.5 flex items-center gap-1 rounded-xl border border-line bg-void/40">
        <Link href="/alertes#trajet" className="flex min-h-[44px] flex-1 items-center gap-2.5 px-3 text-[14px] text-mist">
          <RouteIcon className="h-[18px] w-[18px] shrink-0 text-lagoon" />
          <span className="flex-1">
            Ajoute ton trajet de tous les jours <span className="text-mist-dim">: le point dessus en un coup d&apos;œil</span>
          </span>
        </Link>
        <button
          type="button"
          aria-label="Ne plus proposer"
          onClick={() => {
            setInvite(false);
            try {
              window.localStorage.setItem(TRAJET_INVITE_CLE, "fermee");
            } catch {
              // sans stockage, l'invitation reviendra : tant pis
            }
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center text-mist-dim"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    );
  }

  const enCours = liste === null && !erreur;
  const pastille = enCours ? "…" : erreur && liste === null ? "Hors ligne" : texteVerdict(verdict);
  const couleur = enCours || (erreur && liste === null) ? "border-line bg-panel-2 text-mist-dim" : COULEURS[verdict.niveau];
  const ordonnes = [...verdict.dangers, ...verdict.aSurveiller].sort(
    (a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0),
  );

  return (
    <div className="mt-2.5 rounded-xl border border-line bg-void/40">
      <button
        type="button"
        aria-expanded={deplie}
        aria-controls="trajet-detail"
        onClick={() => setDeplie((d) => !d)}
        className="flex min-h-[44px] w-full items-center gap-2.5 px-3 text-left"
      >
        <RouteIcon className="h-[18px] w-[18px] shrink-0 text-lagoon" />
        <span className="flex-1 text-[14.5px] font-medium">Mon trajet</span>
        <span className={`rounded-full border px-2.5 py-0.5 text-[13px] font-semibold ${couleur}`} aria-live="polite">
          {pastille}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-mist-dim transition-transform ${deplie ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {deplie && (
        <div id="trajet-detail" className="border-t border-line px-3 pb-2 pt-1">
          {ordonnes.length > 0 ? (
            <ul className="flex flex-col">
              {ordonnes.map((r) => {
                const ou = depuisDepartTexte(positions.get(r.id));
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(r)}
                      className="flex min-h-[48px] w-full items-center gap-2.5 py-1.5 text-left"
                    >
                      <TypeTile type={r.type} size={30} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <b className="truncate text-[14.5px] font-semibold">{r.label}</b>
                          <ReliabilityBadge report={r} />
                        </span>
                        <span className="block truncate text-[13px] text-mist-dim">
                          {[r.place, ou, formatAgeShort(r.createdAt)].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-1.5 text-[13.5px] text-mist-dim">
              {erreur && liste === null
                ? "Pas de réseau pour l'instant : le point sur ton trajet reviendra tout seul."
                : "Rien de signalé sur ton trajet. L'absence de signalement ne garantit pas que la route est dégagée."}
            </p>
          )}
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onLigne(ligneAffichee ? null : trajet.points, !ligneAffichee)}
              className="min-h-[44px] rounded-lg border border-line bg-panel-2 text-[14px] font-medium text-mist"
            >
              {ligneAffichee ? "Masquer le trajet" : "Voir sur la carte"}
            </button>
            <Link
              href="/alertes#trajet"
              className="flex min-h-[44px] items-center justify-center rounded-lg border border-line bg-panel-2 text-[14px] font-medium text-mist"
            >
              Régler
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
