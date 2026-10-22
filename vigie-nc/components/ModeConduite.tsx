"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TypeTile } from "./ui";
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
// à 500 m). Rien à
// toucher en roulant. Une appli web ne peut ni parler ni suivre la
// position en arrière-plan : l'écran reste allumé tant que le mode tourne.
// Dans l'appli Android (repère « VigieNCApp » dans le navigateur intégré),
// c'est la barre native qui gère le mode conduite : ce bouton se cache.

const CLE_VOIX = "vigie-nc:conduite-voix";
const CLE_TRAFIC = "vigie-nc:conduite-trafic";
const CLE_PORTEE = "vigie-nc:conduite-portee";

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

export function ModeConduite({ onStart }: { onStart?: () => void }) {
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
    onStart?.();
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
  }, [garderEcranAllume, onStart]);

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

  const changerVoix = () => {
    const v = !voix;
    setVoix(v);
    ecrirePref(CLE_VOIX, v);
    if (!v && "speechSynthesis" in window) window.speechSynthesis.cancel();
    if (v) parler("Voix activée.");
  };
  const changerTrafic = () => {
    const t = !trafic;
    setTrafic(t);
    ecrirePref(CLE_TRAFIC, t);
  };
  const changerPortee = (p: PorteeKm) => {
    if (p === portee) return;
    setPortee(p);
    porteeRef.current = p;
    try {
      window.localStorage.setItem(CLE_PORTEE, String(p));
    } catch {
      // stockage indisponible : le choix vaut pour cette fois
    }
    // Plus loin = nouvelle recherche, plus large.
    if (actif && position) chercher(position);
  };

  if (dansAppli) return null;

  const prochain = devant[0] ?? null;

  return (
    <>
      <button
        type="button"
        onClick={actif ? arreter : demarrer}
        aria-label={actif ? "Arrêter le mode conduite" : "Mode conduite : annonces vocales des dangers devant toi"}
        aria-pressed={actif}
        title="Mode conduite"
        className={`w-11 h-11 rounded-full flex items-center justify-center border backdrop-blur shadow-[0_6px_16px_-8px_rgba(0,0,0,0.7)] ${
          actif ? "bg-primary border-primary text-white" : "bg-void/90 border-line text-mist"
        }`}
      >
        {/* Volant */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="w-5 h-5">
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="2" />
          <path d="M3.8 10.5c2.6-.9 5.3-1.2 8.2-1.2s5.6.3 8.2 1.2M10.2 13.6L7 19.6M13.8 13.6l3.2 6" />
        </svg>
      </button>

      {actif &&
        createPortal(
          <section
            aria-label="Mode conduite"
            className="fixed inset-x-0 top-0 z-[30] px-3 pb-3 pt-[max(env(safe-area-inset-top),12px)] bg-void/95 border-b border-line backdrop-blur"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-display font-bold text-[15px] text-mist">
                <span className="w-2 h-2 rounded-full bg-lagoon animate-blink" />
                Mode conduite
              </span>
              <button
                type="button"
                onClick={arreter}
                className="min-h-[44px] px-4 rounded-full border border-line text-[13px] font-semibold text-mist"
              >
                Arrêter
              </button>
            </div>

            <div aria-live="polite" className="mt-2 rounded-2xl border border-line bg-panel px-3 py-3">
              {prochain ? (
                <div className="flex items-center gap-3">
                  <TypeTile type={prochain.report.type} size={48} />
                  <div className="min-w-0">
                    <p className="font-display font-bold text-[20px] leading-tight text-mist truncate">
                      {REPORT_TYPE_LABELS[prochain.report.type]}
                    </p>
                    <p className="text-[14px] text-mist">
                      {prochain.distanceM < 1000
                        ? `${Math.max(100, Math.round(prochain.distanceM / 100) * 100)} m`
                        : `${(prochain.distanceM / 1000).toFixed(1).replace(".", ",")} km`}
                      {cap != null ? " devant" : " autour de toi"}
                      {" · "}
                      {getReliability(prochain.report).detail}
                    </p>
                    {devant.length > 1 && (
                      <p className="text-[12px] text-mist-dim">
                        + {devant.length - 1} autre{devant.length > 2 ? "s" : ""} plus loin
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="w-12 h-12 rounded-xl bg-ok/15 text-ok flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="w-6 h-6">
                      <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <div>
                    <p className="font-display font-bold text-[18px] leading-tight text-mist">
                      Rien de confirmé devant toi
                    </p>
                    <p className="text-[12px] text-mist-dim">
                      {!position
                        ? "Recherche de ta position…"
                        : cap == null
                          ? `Je surveille 1 km autour de toi. Dès que tu roules, je regarde devant, jusqu'à ${portee} km.`
                          : `Je surveille les ${portee} km devant toi.`}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={changerVoix}
                aria-pressed={voix}
                disabled={!voixDispo}
                className={`flex-1 min-h-[44px] rounded-full border text-[13px] font-semibold disabled:opacity-40 ${
                  voix ? "bg-primary border-primary text-white" : "border-line text-mist-dim"
                }`}
              >
                {voix ? "Voix activée" : "Voix coupée"}
              </button>
              <button
                type="button"
                onClick={changerTrafic}
                aria-pressed={trafic}
                className={`flex-1 min-h-[44px] rounded-full border text-[13px] font-semibold ${
                  trafic ? "bg-primary border-primary text-white" : "border-line text-mist-dim"
                }`}
              >
                {trafic ? "Trafic dense : oui" : "Trafic dense : non"}
              </button>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <span className="text-[12px] text-mist-dim shrink-0">Portée de la voix</span>
              <div role="radiogroup" aria-label="Portée de la voix" className="flex flex-1 gap-1.5">
                {CONDUITE_PORTEES_KM.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={portee === p}
                    onClick={() => changerPortee(p)}
                    className={`flex-1 min-h-[44px] rounded-full border text-[13px] font-semibold ${
                      portee === p ? "bg-primary border-primary text-white" : "border-line text-mist-dim"
                    }`}
                  >
                    {p} km
                  </button>
                ))}
              </div>
            </div>

            {probleme && <p className="mt-2 text-[12px] text-ochre">{probleme}</p>}
            {!voixDispo && <p className="mt-2 text-[12px] text-ochre">La voix n&apos;est pas disponible sur ce navigateur.</p>}
            {!ecranAllume && (
              <p className="mt-2 text-[12px] text-ochre">
                Garde l&apos;écran allumé : écran éteint, l&apos;appli ne peut plus te prévenir.
              </p>
            )}
            <p className="mt-2 text-[11px] text-mist-dim">
              Téléphone sur un support, ou tenu par un passager. Ne touche pas l&apos;écran en roulant. Seuls les
              dangers confirmés sont annoncés, à vol d&apos;oiseau.
            </p>
          </section>,
          document.body,
        )}
    </>
  );
}
