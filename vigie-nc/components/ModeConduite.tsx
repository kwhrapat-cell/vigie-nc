"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TypeTile } from "./ui";
import { RoundButton } from "./MapControls";
import { distanceM, LatLng } from "@/lib/geo";
import { fetchNearby, fetchPointRouteIa } from "@/lib/reports-api";
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
  evenementsDevant,
  palierPour,
  paliers,
  POINT_ROUTE_AFFICHAGE_MS,
  POINT_ROUTE_INTERVALLE_MS,
  POINT_ROUTE_KM,
  PorteeKm,
  rayonRechercheSite,
  texteAnnonce,
  textePointRoute,
} from "@/lib/conduite";

// Mode conduite : téléphone sur son support, l'appli annonce à voix haute
// les dangers confirmés devant toi (jusqu'à 3, 5 ou 10 km au choix, rappel
// à 500 m). Rien à toucher en roulant. Une appli web ne peut ni parler ni
// suivre la position en arrière-plan : l'écran reste allumé tant que le
// mode tourne.
//
// Pendant la conduite, la carte prend tout l'écran (CarteLive masque la
// liste, la barre du bas et les bandeaux) : il ne reste en haut qu'un
// bandeau compact (prochain danger + Arrêter) et, sur la carte, trois petits
// boutons (point route, voix, réglages). Les réglages sont repliés par défaut.
//
// Point route : au démarrage, puis à la demande (bouton), la voix dit ce qui
// est signalé sur les 10 km devant (tous les types, confirmés ou non),
// en une à trois phrases écrites par l'IA si elle est branchée
// (/api/point-route : seuls les identifiants et distances partent, jamais
// la position), sinon par textePointRoute(). Ces événements sont mis en
// évidence sur la carte tant qu'on roule.
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
  const [rechercheFaite, setRechercheFaite] = useState(false);
  const [pointRoute, setPointRoute] = useState<{ texte: string; ia: boolean; heure: number } | null>(null);
  const [pointRouteEnCours, setPointRouteEnCours] = useState(false);

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
  const actifRef = useRef(actif);
  actifRef.current = actif;
  const positionRef = useRef(position);
  positionRef.current = position;
  const capRef = useRef(cap);
  capRef.current = cap;
  const reportsRef = useRef(reports);
  reportsRef.current = reports;
  // Point route : déjà dit au démarrage ? heure du dernier demandé à l'IA ?
  const pointRouteDit = useRef(false);
  const dernierPointRouteIa = useRef(0);
  const pointRouteJeton = useRef(0);

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
    pointRouteDit.current = false;
    pointRouteJeton.current += 1; // un point route en route ne parlera plus
    setRechercheFaite(false);
    setPointRoute(null);
    setPointRouteEnCours(false);
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
    // Au moins 13 km : les 10 km du point route, quelle que soit la portée.
    fetchNearby(lieu, rayonRechercheSite(porteeRef.current))
      .then((liste) => {
        derniereRecherche.current = { lieu, heure: Date.now() };
        setReports(liste);
        setRechercheFaite(true);
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

  // Point route : les 10 km devant, dits à voix haute. L'IA les résume si
  // elle répond à temps ; sinon (pas de réseau, IA pas branchée, déjà
  // demandé il y a moins d'une minute), le texte est composé ici.
  const demanderPointRoute = useCallback(async () => {
    const ici = positionRef.current;
    if (!actifRef.current || !ici) return;
    const capIci = capRef.current;
    const liste = evenementsDevant(ici, capIci, reportsRef.current);
    const jeton = ++pointRouteJeton.current;
    setPointRouteEnCours(true);

    let texte = textePointRoute(liste, capIci != null);
    let ia = false;
    if (liste.length > 0 && Date.now() - dernierPointRouteIa.current >= POINT_ROUTE_INTERVALLE_MS) {
      dernierPointRouteIa.current = Date.now();
      const deLia = await fetchPointRouteIa(
        liste.map((d) => ({ id: d.report.id, distanceM: Math.round(d.distanceM) })),
        capIci != null,
      );
      if (deLia) {
        texte = deLia;
        ia = true;
      }
    }
    // Arrêté, ou un autre point route demandé entre-temps : on se tait.
    if (!actifRef.current || jeton !== pointRouteJeton.current) return;

    setPointRoute({ texte, ia, heure: Date.now() });
    setPointRouteEnCours(false);
    if (voixRef.current) parler(texte);

    // Les dangers devant qui viennent d'être cités ne sont pas réannoncés
    // tout de suite à la portée : seulement aux paliers plus proches.
    if (capIci != null) {
      const liste2 = paliers(porteeRef.current);
      for (const d of liste) {
        const p = palierPour(d.distanceM, liste2);
        if (p == null) continue;
        const avant = dejaAnnonce.current.get(d.report.id);
        if (avant == null || p < avant) dejaAnnonce.current.set(d.report.id, p);
      }
    }
  }, []);

  // Au démarrage : un point route dès que la position et la première
  // recherche sont là.
  useEffect(() => {
    if (!actif || !position || !rechercheFaite || pointRouteDit.current) return;
    pointRouteDit.current = true;
    demanderPointRoute();
  }, [actif, position, rechercheFaite, demanderPointRoute]);

  // Événements des 10 km devant, mis en évidence sur la carte. L'ensemble
  // ne change que si la liste change (pas à chaque point GPS), pour ne pas
  // redessiner les marqueurs sans arrêt.
  const cleDevant = useMemo(() => {
    if (!actif || !position) return "";
    return evenementsDevant(position, cap, reports)
      .map((d) => d.report.id)
      .sort()
      .join(",");
  }, [actif, position, cap, reports]);
  const idsDevant = useMemo(() => new Set(cleDevant ? cleDevant.split(",") : []), [cleDevant]);

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
    reports,
    idsDevant,
    pointRoute,
    pointRouteEnCours,
    probleme,
    ecranAllume,
    voixDispo,
    demarrer,
    arreter,
    demanderPointRoute,
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

/** Pendant la conduite, sur la carte : redemander le point route des 10 km devant. */
export function BoutonPointRoute({ conduite }: { conduite: ModeConduiteEtat }) {
  return (
    <RoundButton
      active={conduite.pointRouteEnCours}
      label={`Point route : ce qui est signalé sur les ${POINT_ROUTE_KM} km devant`}
      onClick={() => {
        if (!conduite.pointRouteEnCours) conduite.demanderPointRoute();
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M7 21l3-18M17 21l-3-18" />
        <path d="M12 5.5v2M12 11v2M12 16.5v2" />
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
  const { devant, cap, position, portee, voix, voixDispo, trafic, probleme, ecranAllume, pointRoute } = conduite;
  const prochain = devant[0] ?? null;

  // Le texte du point route reste affiché 45 s (pour un passager), puis
  // laisse la place à la carte.
  const [pointRouteVisible, setPointRouteVisible] = useState(false);
  useEffect(() => {
    if (!pointRoute) {
      setPointRouteVisible(false);
      return;
    }
    setPointRouteVisible(true);
    const t = window.setTimeout(() => setPointRouteVisible(false), POINT_ROUTE_AFFICHAGE_MS);
    return () => window.clearTimeout(t);
  }, [pointRoute]);

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

      {conduite.pointRouteEnCours && !pointRouteVisible && (
        <p className="mt-1.5 text-[12px] text-mist-dim" role="status">
          Point route des {POINT_ROUTE_KM} km en préparation…
        </p>
      )}
      {pointRoute && pointRouteVisible && !reglagesOuverts && (
        <div className="mt-2 rounded-xl border border-lagoon/30 bg-lagoon/10 px-3 py-2" role="status">
          <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-lagoon">
            Point route · {POINT_ROUTE_KM} km{pointRoute.ia ? " · résumé par l'IA" : ""}
          </p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-mist">{pointRoute.texte}</p>
        </div>
      )}

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
            dangers confirmés sont annoncés, à vol d&apos;oiseau. Le point route (au départ, ou bouton « route » sur
            la carte) cite tout ce qui est signalé sur les {POINT_ROUTE_KM} km devant ; il peut être écrit par
            l&apos;IA et se tromper.
          </p>
        </div>
      )}
    </section>
  );
}
