"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TypeTile } from "./ui";
import { RoundButton } from "./MapControls";
import { distanceM, LatLng } from "@/lib/geo";
import { fetchNearby } from "@/lib/reports-api";
import { getReliability } from "@/lib/reliability";
import { Report, REPORT_TYPE_LABELS } from "@/lib/types";
import {
  aAnnoncer,
  capDeg,
  CONDUITE_DEPLACEMENT_CAP_M,
  CONDUITE_PORTEE_DEFAUT_KM,
  CONDUITE_PORTEES_KM,
  CONDUITE_RELANCE_M,
  CONDUITE_RELANCE_MS,
  CONDUITE_VITESSE_CAP_MIN,
  DangerDevant,
  dangersDevant,
  estPortee,
  PorteeKm,
  rayonRecherche,
  texteAnnonce,
} from "@/lib/conduite";

// Mode conduite : téléphone sur son support, l'appli annonce à voix haute
// les dangers confirmés devant toi (jusqu'à 3, 5 ou 10 km au choix, rappel
// à 500 m). Rien à toucher en roulant. Une appli web ne peut ni parler ni
// suivre la position en arrière-plan : l'écran reste allumé tant que le
// mode tourne.
//
// Pendant la conduite, la carte prend tout l'écran (CarteLive masque la
// liste, la barre du bas et les bandeaux) : il ne reste en haut qu'un
// bandeau compact (prochain danger + Arrêter) et, sur la carte, deux petits
// boutons (voix, réglages). Les réglages sont repliés par défaut.
//
// Dans l'appli Android (repère « VigieNCApp » dans le navigateur intégré),
// c'est la barre native qui gère le mode conduite : le bouton se cache.

const CLE_VOIX = "vigie-nc:conduite-voix";
const CLE_TRAFIC = "vigie-nc:conduite-trafic";
const CLE_PORTEE = "vigie-nc:conduite-portee";
// Durée d'affichage du rappel « téléphone sur un support » au départ.
const RAPPEL_DEPART_MS = 12_000;

type Verrou = { release: () => Promise<void> };
type NavigatorAvecVerrou = Navigator & { wakeLock?: { request: (t: "screen") => Promise<Verrou> } };

function lirePref(cle: string, defaut: boolean): boolean {
  try {
    const v = window.localStorage.getItem(cle);
    return v == null ? defaut : v === "1";
  } catch {
    return defaut;
  }
}
function ecrirePref(cle: string, valeur: boolean) {
  try {
    window.localStorage.setItem(cle, valeur ? "1" : "0");
  } catch {
    // stockage indisponible : le choix vaut pour cette fois
  }
}

function lirePortee(): PorteeKm {
  try {
    const v = Number(window.localStorage.getItem(CLE_PORTEE));
    return estPortee(v) ? v : CONDUITE_PORTEE_DEFAUT_KM;
  } catch {
    return CONDUITE_PORTEE_DEFAUT_KM;
  }
}

function parler(texte: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(texte);
  u.lang = "fr-FR";
  const voix = window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith("fr"));
  if (voix) u.voice = voix;
  u.rate = 1;
  window.speechSynthesis.speak(u);
}

function distanceAffichee(m: number): string {
  return m < 1000
    ? `${Math.max(100, Math.round(m / 100) * 100)} m`
    : `${(m / 1000).toFixed(1).replace(".", ",")} km`;
}

/** Tout le mode conduite (position, recherche, voix) ; l'écran se compose avec les éléments plus bas. */
export function useModeConduite() {
  const [dansAppli, setDansAppli] = useState(false);
  const [actif, setActif] = useState(false);
  const [voix, setVoix] = useState(true);
  const [trafic, setTrafic] = useState(false);
  const [portee, setPortee] = useState<PorteeKm>(CONDUITE_PORTEE_DEFAUT_KM);
  const [position, setPosition] = useState<LatLng | null>(null);
  const [cap, setCap] = useState<number | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [devant, setDevant] = useState<DangerDevant[]>([]);
  const [probleme, setProbleme] = useState<string | null>(null);
  const [ecranAllume, setEcranAllume] = useState(true);
  const [voixDispo, setVoixDispo] = useState(true);

  const watchId = useRef<number | null>(null);
  const verrou = useRef<Verrou | null>(null);
  const precedent = useRef<LatLng | null>(null);
  const derniereRecherche = useRef<{ lieu: LatLng; heure: number } | null>(null);
  const rechercheEnCours = useRef(false);
  const dejaAnnonce = useRef(new Map<string, number>());
  const voixRef = useRef(voix);
  voixRef.current = voix;
  const porteeRef = useRef(portee);
  porteeRef.current = portee;

  useEffect(() => {
    setDansAppli(navigator.userAgent.includes("VigieNCApp"));
    setVoix(lirePref(CLE_VOIX, true));
    setTrafic(lirePref(CLE_TRAFIC, false));
    setPortee(lirePortee());
    setVoixDispo("speechSynthesis" in window);
    // Certaines voix se chargent après coup : on les demande tôt.
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
  }, []);

  const garderEcranAllume = useCallback(async () => {
    const nav = navigator as NavigatorAvecVerrou;
    if (!nav.wakeLock) {
      setEcranAllume(false);
      return;
    }
    try {
      verrou.current = await nav.wakeLock.request("screen");
      setEcranAllume(true);
    } catch {
      setEcranAllume(false);
    }
  }, []);

  const arreter = useCallback(() => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    verrou.current?.release().catch(() => {});
    verrou.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    precedent.current = null;
    derniereRecherche.current = null;
    dejaAnnonce.current.clear();
    setActif(false);
    setPosition(null);
    setCap(null);
    setReports([]);
    setDevant([]);
    setProbleme(null);
  }, []);

  const demarrer = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setProbleme("Ce téléphone ne donne pas sa position à l'appli.");
      return;
    }
    setActif(true);
    setProbleme(null);
    // Annonce de départ, dans le geste du doigt : elle « débloque » la voix
    // sur les téléphones qui l'exigent.
    if (voixRef.current) parler("Mode conduite activé. Je te préviens des dangers confirmés devant toi.");
    garderEcranAllume();
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const ici = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const vitesse = pos.coords.speed;
        const capGps = pos.coords.heading;
        if (capGps != null && !Number.isNaN(capGps) && vitesse != null && vitesse >= CONDUITE_VITESSE_CAP_MIN) {
          setCap(capGps);
          precedent.current = ici;
        } else if (vitesse != null && vitesse < 1) {
          // À l'arrêt : le sens de marche n'est plus sûr.
          setCap(null);
        } else if (!precedent.current) {
          precedent.current = ici;
        } else if (distanceM(precedent.current, ici) >= CONDUITE_DEPLACEMENT_CAP_M) {
          setCap(capDeg(precedent.current, ici));
          precedent.current = ici;
        }
        setPosition(ici);
        setProbleme(null);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setProbleme("Autorise la position pour que le mode conduite fonctionne.");
        } else {
          setProbleme("Signal GPS faible : je garde la dernière position connue.");
        }
      },
      { enableHighAccuracy: true, maximumAge: 2_000, timeout: 20_000 },
    );
  }, [garderEcranAllume]);

  // Le verrou d'écran saute quand on quitte l'appli : on le reprend au retour.
  useEffect(() => {
    if (!actif) return;
    const auRetour = () => {
      if (document.visibilityState === "visible") garderEcranAllume();
    };
    document.addEventListener("visibilitychange", auRetour);
    return () => document.removeEventListener("visibilitychange", auRetour);
  }, [actif, garderEcranAllume]);

  // Arrêt propre si l'on quitte la carte.
  useEffect(() => arreter, [arreter]);

  // Recherche des signalements : au départ, puis tous les 1,5 km ou 90 s,
  // un peu plus loin que la portée choisie.
  const chercher = useCallback((lieu: LatLng) => {
    if (rechercheEnCours.current) return;
    rechercheEnCours.current = true;
    fetchNearby(lieu, rayonRecherche(porteeRef.current))
      .then((liste) => {
        derniereRecherche.current = { lieu, heure: Date.now() };
        setReports(liste);
      })
      .catch(() => setProbleme("Pas de réseau : les annonces reprendront avec la connexion."))
      .finally(() => {
        rechercheEnCours.current = false;
      });
  }, []);

  useEffect(() => {
    if (!actif || !position) return;
    const d = derniereRecherche.current;
    if (!d || distanceM(d.lieu, position) >= CONDUITE_RELANCE_M || Date.now() - d.heure >= CONDUITE_RELANCE_MS) {
      chercher(position);
    }
  }, [actif, position, chercher]);

  useEffect(() => {
    if (!actif) return;
    const t = window.setInterval(() => {
      const d = derniereRecherche.current;
      if (d && Date.now() - d.heure >= CONDUITE_RELANCE_MS) chercher(d.lieu);
    }, 15_000);
    return () => window.clearInterval(t);
  }, [actif, chercher]);

  // Dangers devant + annonces.
  useEffect(() => {
    if (!actif || !position) return;
    const liste = dangersDevant(position, cap, reports, trafic, portee);
    setDevant(liste);
    // Oublie les signalements disparus de la recherche.
    const ids = new Set(reports.map((r) => r.id));
    for (const id of dejaAnnonce.current.keys()) if (!ids.has(id)) dejaAnnonce.current.delete(id);
    const nouvelles = aAnnoncer(liste, dejaAnnonce.current, portee);
    if (voixRef.current) {
      // Deux annonces au plus d'un coup, la plus proche d'abord.
      for (const d of nouvelles.slice(0, 2)) parler(texteAnnonce(d, cap != null));
    }
  }, [actif, position, cap, reports, trafic, portee]);

  const changerVoix = useCallback(() => {
    const v = !voixRef.current;
    setVoix(v);
    ecrirePref(CLE_VOIX, v);
    if (!v && "speechSynthesis" in window) window.speechSynthesis.cancel();
    if (v) parler("Voix activée.");
  }, []);
  const changerTrafic = useCallback(() => {
    setTrafic((t) => {
      ecrirePref(CLE_TRAFIC, !t);
      return !t;
    });
  }, []);
  const changerPortee = useCallback(
    (p: PorteeKm) => {
      if (p === porteeRef.current) return;
      setPortee(p);
      porteeRef.current = p;
      try {
        window.localStorage.setItem(CLE_PORTEE, String(p));
      } catch {
        // stockage indisponible : le choix vaut pour cette fois
      }
      // Plus loin = nouvelle recherche, plus large.
      if (actif && position) chercher(position);
    },
    [actif, position, chercher],
  );

  return {
    dansAppli,
    actif,
    voix,
    trafic,
    portee,
    position,
    cap,
    devant,
    probleme,
    ecranAllume,
    voixDispo,
    demarrer,
    arreter,
    changerVoix,
    changerTrafic,
    changerPortee,
  };
}

export type ModeConduiteEtat = ReturnType<typeof useModeConduite>;

/** Bouton volant sur la carte : lance le mode conduite. */
export function BoutonConduite({ onClick }: { onClick: () => void }) {
  return (
    <RoundButton active={false} label="Mode conduite : annonces vocales des dangers devant toi" onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="w-5 h-5">
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="2" />
        <path d="M3.8 10.5c2.6-.9 5.3-1.2 8.2-1.2s5.6.3 8.2 1.2M10.2 13.6L7 19.6M13.8 13.6l3.2 6" />
      </svg>
    </RoundButton>
  );
}

/** Pendant la conduite, sur la carte : couper / remettre la voix. */
export function BoutonVoix({ conduite }: { conduite: ModeConduiteEtat }) {
  if (!conduite.voixDispo) return null;
  return (
    <RoundButton
      active={conduite.voix}
      label={conduite.voix ? "Couper la voix" : "Remettre la voix"}
      onClick={conduite.changerVoix}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" />
        {conduite.voix ? <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.3 6.3a8 8 0 0 1 0 11.4" /> : <path d="M16 9.5l5 5M21 9.5l-5 5" />}
      </svg>
    </RoundButton>
  );
}

/** Pendant la conduite, sur la carte : ouvre les réglages (portée, trafic dense). */
export function BoutonReglagesConduite({ ouvert, onClick }: { ouvert: boolean; onClick: () => void }) {
  return (
    <RoundButton active={ouvert} label="Réglages du mode conduite" onClick={onClick} expanded={ouvert}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="w-5 h-5">
        <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
        <circle cx="15" cy="7" r="2.2" />
        <circle cx="9" cy="17" r="2.2" />
      </svg>
    </RoundButton>
  );
}

/**
 * Bandeau compact en haut de l'écran pendant la conduite : le prochain
 * danger et le bouton Arrêter. Les réglages s'ouvrent dessous, à la demande.
 */
export function BandeauConduite({
  conduite,
  reglagesOuverts,
  onFermerReglages,
}: {
  conduite: ModeConduiteEtat;
  reglagesOuverts: boolean;
  onFermerReglages: () => void;
}) {
  const { devant, cap, position, portee, voix, voixDispo, trafic, probleme, ecranAllume } = conduite;
  const prochain = devant[0] ?? null;

  // Rappel de sécurité quelques secondes au départ, puis il laisse la place à la carte.
  const [rappel, setRappel] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setRappel(false), RAPPEL_DEPART_MS);
    return () => window.clearTimeout(t);
  }, []);

  const messages: string[] = [];
  if (probleme) messages.push(probleme);
  if (!voixDispo) messages.push("La voix n'est pas disponible sur ce navigateur.");
  if (!ecranAllume) messages.push("Garde l'écran allumé : écran éteint, l'appli ne peut plus te prévenir.");

  return (
    <section
      aria-label="Mode conduite"
      className="shrink-0 relative z-[13] px-3 pb-2 pt-[max(env(safe-area-inset-top),10px)] bg-void/95 border-b border-line"
    >
      <p className="flex items-center gap-1.5 font-mono text-[9.5px] tracking-wider uppercase text-lagoon-dim">
        <span className="w-1.5 h-1.5 rounded-full bg-lagoon animate-blink" />
        Mode conduite · {voix && voixDispo ? `voix jusqu'à ${portee} km` : "voix coupée"}
      </p>

      <div className="mt-1 flex items-center gap-2.5">
        {prochain ? (
          <TypeTile type={prochain.report.type} size={44} />
        ) : (
          <span className="w-11 h-11 rounded-xl bg-ok/15 text-ok flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="w-6 h-6">
              <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}

        <div aria-live="polite" className="flex-1 min-w-0">
          {prochain ? (
            <>
              <p className="font-display font-bold text-[17px] leading-tight text-mist truncate">
                {REPORT_TYPE_LABELS[prochain.report.type]}
              </p>
              <p className="text-[12.5px] text-mist truncate">
                {distanceAffichee(prochain.distanceM)}
                {cap != null ? " devant" : " autour"}
                {" · "}
                {getReliability(prochain.report).detail}
                {devant.length > 1 && <span className="text-mist-dim"> · +{devant.length - 1}</span>}
              </p>
            </>
          ) : (
            <>
              <p className="font-display font-bold text-[16px] leading-tight text-mist truncate">
                Rien de confirmé devant
              </p>
              <p className="text-[12px] text-mist-dim truncate">
                {!position
                  ? "Recherche de ta position…"
                  : cap == null
                    ? "À l'arrêt : je surveille 1 km autour"
                    : `Je surveille les ${portee} km devant toi`}
              </p>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={conduite.arreter}
          className="shrink-0 min-h-[44px] px-4 rounded-full border border-line bg-panel text-[13px] font-semibold text-mist"
        >
          Arrêter
        </button>
      </div>

      {messages.map((m) => (
        <p key={m} className="mt-1.5 text-[12px] leading-snug text-ochre">
          {m}
        </p>
      ))}
      {rappel && !reglagesOuverts && (
        <p className="mt-1.5 text-[11.5px] leading-snug text-mist-dim">
          Téléphone sur un support, ou tenu par un passager. Ne touche pas l&apos;écran en roulant.
        </p>
      )}

      {reglagesOuverts && (
        <div id="reglages-conduite" className="mt-2 rounded-2xl border border-line bg-panel p-3">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-mist-dim shrink-0">Portée de la voix</span>
            <div role="radiogroup" aria-label="Portée de la voix" className="flex flex-1 gap-1.5">
              {CONDUITE_PORTEES_KM.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={portee === p}
                  onClick={() => conduite.changerPortee(p)}
                  className={`flex-1 min-h-[44px] rounded-full border text-[13px] font-semibold ${
                    portee === p ? "bg-primary border-primary text-white" : "border-line text-mist-dim"
                  }`}
                >
                  {p} km
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={conduite.changerTrafic}
              aria-pressed={trafic}
              className={`flex-1 min-h-[44px] rounded-full border text-[13px] font-semibold ${
                trafic ? "bg-primary border-primary text-white" : "border-line text-mist-dim"
              }`}
            >
              {trafic ? "Trafic dense : oui" : "Trafic dense : non"}
            </button>
            <button
              type="button"
              onClick={onFermerReglages}
              className="min-h-[44px] px-5 rounded-full border border-line text-[13px] font-semibold text-mist"
            >
              OK
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-mist-dim">
            Téléphone sur un support, ou tenu par un passager. Ne touche pas l&apos;écran en roulant. Seuls les
            dangers confirmés sont annoncés, à vol d&apos;oiseau.
          </p>
        </div>
      )}
    </section>
  );
}
