"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { ScreenHeader } from "@/components/ui";
import {
  AIRES,
  AireCarte,
  AireId,
  CARTE_EVENT,
  changerMajAuto,
  ChoixCarte,
  lireAires,
  majAutoActive,
  NOM_AIRE,
  Plan,
  planifier,
  supprimerAire,
  telecharger,
} from "@/lib/carte-hors-ligne";
import { texteOctets } from "@/lib/carte-plan";
import type { LatLng } from "@/lib/geo";
import { reversePlace } from "@/lib/place";
import { readPointZone } from "@/lib/preferences";
import { lireTrajet, type TrajetLocal } from "@/lib/trajet";
import { useDemo } from "@/lib/useDemo";
import { useGeolocation } from "@/lib/useGeolocation";

const DESCRIPTION: Record<AireId, string> = {
  zone: "La carte autour de toi",
  trajet: "Le long de ta route de tous les jours",
  nc: "Grande Terre et îles",
};

/** Réseau coupé pendant le téléchargement : nouvel essai tout seul. */
const REPRISE_MS = 10_000;
const REPRISES_MAX = 6;
/** Au-delà, on propose de mettre à jour (la carte change chaque mois). */
const VIEILLE_MS = 35 * 24 * 3_600_000;

type Estimation = { cle: string; plan: Plan } | { cle: string; erreur: true } | { cle: string; calcul: true };

function dateCourte(ms: number): string {
  return new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function estAnnulation(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

function wifiConseille(): boolean {
  const c = (navigator as Navigator & { connection?: { type?: string } }).connection;
  return c?.type === "cellular";
}

/** Profil › Carte sans réseau : télécharger, mettre à jour, supprimer. */
export default function CarteHorsLignePage() {
  const demo = useDemo();
  const { locate } = useGeolocation();
  const [aires, setAires] = useState<AireCarte[]>([]);
  const [pret, setPret] = useState(false);
  const [choix, setChoix] = useState<AireId>("zone");
  const [ajout, setAjout] = useState(false);
  const [centre, setCentre] = useState<LatLng | null>(null);
  const [lieu, setLieu] = useState<string | null>(null);
  const [trajet, setTrajet] = useState<TrajetLocal | null>(null);
  const [estimation, setEstimation] = useState<Estimation | null>(null);
  const [encours, setEncours] = useState<{ id: AireId; fait: number; total: number; reprise: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [majAuto, setMajAuto] = useState(true);
  const [enLigne, setEnLigne] = useState(true);
  const annulation = useRef<AbortController | null>(null);

  useEffect(() => {
    const relire = () => setAires(lireAires());
    relire();
    setMajAuto(majAutoActive());
    setTrajet(lireTrajet());
    setEnLigne(navigator.onLine);
    const zone = readPointZone();
    if (zone) setCentre(zone);
    locate()
      .then((p) => setCentre({ lat: p.lat, lng: p.lng }))
      .catch(() => undefined);
    // Arrivée depuis le rappel d'une annonce : la zone est déjà choisie.
    if (new URLSearchParams(window.location.search).get("auto") === "zone") setChoix("zone");
    const enLigneOui = () => setEnLigne(true);
    const enLigneNon = () => setEnLigne(false);
    window.addEventListener(CARTE_EVENT, relire);
    window.addEventListener("online", enLigneOui);
    window.addEventListener("offline", enLigneNon);
    setPret(true);
    return () => {
      window.removeEventListener(CARTE_EVENT, relire);
      window.removeEventListener("online", enLigneOui);
      window.removeEventListener("offline", enLigneNon);
      annulation.current?.abort();
    };
  }, [locate]);

  // Nom du lieu de la zone (« Païta », « Boulari… »)
  useEffect(() => {
    if (!centre) return;
    let annule = false;
    void reversePlace(centre.lat, centre.lng).then((p) => {
      if (!annule) setLieu(p);
    });
    return () => {
      annule = true;
    };
  }, [centre]);

  const pretes = aires.filter((a) => a.fini);
  const interrompues = aires.filter((a) => !a.fini);
  const disponibles = AIRES.filter((id) => !pretes.some((a) => a.id === id));
  const montrerChoix = pret && !demo && (pretes.length === 0 || ajout) && disponibles.length > 0;

  // Le choix doit rester parmi les cartes pas encore téléchargées.
  useEffect(() => {
    if (disponibles.length > 0 && !disponibles.includes(choix)) setChoix(disponibles[0]);
  }, [disponibles, choix]);

  const choixCarte = useCallback(
    (id: AireId, depuis?: AireCarte): ChoixCarte | null => {
      if (id === "nc") return { id: "nc" };
      if (id === "trajet") return trajet ? { id: "trajet", points: trajet.points } : null;
      const c = depuis?.centre ?? centre;
      return c ? { id: "zone", centre: c, lieu: depuis?.lieu ?? lieu } : null;
    },
    [trajet, centre, lieu],
  );

  const cleChoix = useMemo(() => {
    const c = choixCarte(choix);
    if (!c) return null;
    if (c.id === "zone") return `zone:${c.centre.lat.toFixed(3)},${c.centre.lng.toFixed(3)}`;
    if (c.id === "trajet") return `trajet:${trajet?.majAt ?? ""}`;
    return "nc";
  }, [choix, choixCarte, trajet]);

  // Taille exacte du choix (quelques petites requêtes), recalculée s'il change.
  useEffect(() => {
    if (!montrerChoix || !cleChoix || !enLigne || encours) return;
    if (estimation && estimation.cle === cleChoix && !("erreur" in estimation)) return;
    const c = choixCarte(choix);
    if (!c) return;
    const ctrl = new AbortController();
    setEstimation({ cle: cleChoix, calcul: true });
    planifier(c, ctrl.signal).then(
      (plan) => setEstimation({ cle: cleChoix, plan }),
      (e) => {
        if (!estAnnulation(e)) setEstimation({ cle: cleChoix, erreur: true });
      },
    );
    return () => ctrl.abort();
    // (estimation et choixCarte lus à jour sans relancer le calcul)
  }, [montrerChoix, cleChoix, enLigne, encours]);

  const lancer = useCallback(async (plan: Plan) => {
    const id = plan.choix.id;
    setMessage(null);
    for (let essai = 0; ; essai++) {
      const ctrl = new AbortController();
      annulation.current = ctrl;
      setEncours({ id, fait: 0, total: plan.octets, reprise: essai > 0 });
      try {
        await telecharger(plan, {
          signal: ctrl.signal,
          progression: (fait, total) => setEncours({ id, fait, total, reprise: false }),
        });
        setEncours(null);
        setAjout(false);
        setEstimation(null);
        return;
      } catch (e) {
        if (estAnnulation(e) || essai >= REPRISES_MAX) {
          setEncours(null);
          setMessage(
            estAnnulation(e)
              ? "Téléchargement arrêté. Ce qui est déjà téléchargé est gardé : il reprendra là où il s'est arrêté."
              : "Le réseau ne répond pas. Ce qui est déjà téléchargé est gardé : réessaie quand ça capte.",
          );
          return;
        }
        // Réseau coupé : nouvel essai au retour du réseau, ou dans 10 s.
        setEncours((x) => (x ? { ...x, reprise: true } : x));
        await new Promise<void>((resolve) => {
          const fini = () => {
            window.removeEventListener("online", fini);
            clearTimeout(t);
            resolve();
          };
          const t = setTimeout(fini, REPRISE_MS);
          window.addEventListener("online", fini);
          ctrl.signal.addEventListener("abort", fini);
        });
        if (ctrl.signal.aborted) {
          setEncours(null);
          return;
        }
      }
    }
  }, []);

  const relancer = useCallback(
    async (a: AireCarte) => {
      const c = choixCarte(a.id, a);
      if (!c) {
        setMessage(a.id === "trajet" ? "Ton trajet n'est plus enregistré : ajoute-le dans Alertes." : "Position introuvable.");
        return;
      }
      setMessage(null);
      setEncours({ id: a.id, fait: 0, total: a.octets, reprise: false });
      try {
        await lancer(await planifier(c));
      } catch {
        setEncours(null);
        setMessage("Le réseau ne répond pas : réessaie quand ça capte.");
      }
    },
    [choixCarte, lancer],
  );

  const planChoisi = estimation && estimation.cle === cleChoix && "plan" in estimation ? estimation.plan : null;
  const pourcent = encours && encours.total > 0 ? Math.min(100, Math.round((encours.fait / encours.total) * 100)) : 0;

  function raisonIndisponible(id: AireId): string | null {
    if (id === "zone" && !centre) return "Position introuvable : active ta position, ou choisis ta zone sur la carte de l'accueil.";
    if (id === "trajet" && !trajet) return "Ajoute d'abord ton trajet de tous les jours (écran Alertes).";
    return null;
  }

  function tailleDe(id: AireId): string {
    if (id !== choix) return "";
    if (!enLigne) return "";
    if (!estimation || estimation.cle !== cleChoix || "calcul" in estimation) return "…";
    if ("erreur" in estimation) return "?";
    return `≈ ${texteOctets(estimation.plan.octets)}`;
  }

  return (
    <main className="min-h-[100dvh] pb-nav">
      <ScreenHeader title="Carte sans réseau" subtitle="Profil · sur ce téléphone" backHref="/profil" />

      <div className="px-4 flex flex-col gap-3.5">
        <section className="flex gap-3 items-start rounded-2xl border border-line bg-panel p-3.5">
          <span className="w-11 h-11 shrink-0 rounded-xl bg-panel-2 text-lagoon flex items-center justify-center" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
              <path d="M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z" />
              <path d="M9 4v13.5M15 6.5V12" />
              <path d="M18 14v6M15.5 17.5L18 20l2.5-2.5" />
            </svg>
          </span>
          <div>
            <p className="text-[15px] font-semibold">Télécharge-la une fois, avec du réseau.</p>
            <p className="mt-1 text-[14px] leading-relaxed text-mist-dim">
              Pendant un cyclone ou une coupure, la carte s&apos;affiche quand même, en entier. Les signalements, eux,
              restent ceux de la dernière mise à jour.
            </p>
          </div>
        </section>

        {demo && (
          <p className="rounded-xl border border-line bg-panel-2 px-3 py-2.5 text-[14px] text-mist-dim">
            Indisponible pendant la démonstration.
          </p>
        )}

        {/* Téléchargement en cours */}
        {encours && (
          <section className="rounded-2xl border border-line bg-panel p-4 flex flex-col gap-3" aria-live="polite">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display font-semibold text-[17px]">{NOM_AIRE[encours.id]}</h2>
              <span className="font-display font-bold text-[24px] text-lagoon">{pourcent} %</span>
            </div>
            <div
              role="progressbar"
              aria-label="Téléchargement de la carte"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pourcent}
              className="h-2.5 rounded-full bg-panel-2 overflow-hidden"
            >
              <div className="h-full rounded-full bg-lagoon transition-[width]" style={{ width: `${pourcent}%` }} />
            </div>
            <p className="font-mono text-[13px] text-mist-dim">
              {texteOctets(encours.fait)} sur {texteOctets(encours.total)}
            </p>
            <p className="text-[14px] leading-relaxed">
              {encours.reprise
                ? "Réseau coupé : le téléchargement reprend tout seul dès que ça capte."
                : "Tu peux continuer à utiliser l'appli. Si le réseau coupe, le téléchargement reprend là où il s'est arrêté."}
            </p>
            <button
              type="button"
              onClick={() => annulation.current?.abort()}
              className="self-start min-h-[44px] px-4 rounded-xl border border-line bg-panel-2 text-[14px] font-medium"
            >
              Arrêter
            </button>
          </section>
        )}

        {message && (
          <p className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2.5 text-[14px]" role="status">
            {message}
          </p>
        )}

        {/* Cartes prêtes */}
        {pretes.map((a) => (
          <section key={a.id} className="rounded-2xl border border-lagoon/60 bg-panel p-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 shrink-0 rounded-full bg-primary text-white flex items-center justify-center" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </span>
              <div className="min-w-0">
                <h2 className="font-display font-semibold text-[17px]">Carte prête</h2>
                <p className="text-[14px] text-mist-dim truncate">
                  {NOM_AIRE[a.id]}
                  {a.id === "zone" && a.lieu ? ` · ${a.lieu}` : ""}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-panel-2 px-3 py-2">
                <span className="block text-[12px] text-mist-dim">Téléchargée le</span>
                <span className="font-mono text-[14px]">{dateCourte(a.at)}</span>
              </div>
              <div className="rounded-xl bg-panel-2 px-3 py-2">
                <span className="block text-[12px] text-mist-dim">Place prise</span>
                <span className="font-mono text-[14px]">≈ {texteOctets(a.octets)}</span>
              </div>
            </div>
            {Date.now() - a.at > VIEILLE_MS && (
              <p className="text-[13.5px] text-warn">Elle a plus d&apos;un mois : mets-la à jour quand tu as du Wi-Fi.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={Boolean(encours) || !enLigne}
                onClick={() => void relancer(a)}
                className="min-h-[44px] px-4 rounded-xl border border-line bg-panel-2 text-[14px] font-medium disabled:opacity-40"
              >
                Mettre à jour
              </button>
              <button
                type="button"
                disabled={Boolean(encours)}
                onClick={() => void supprimerAire(a.id)}
                className="min-h-[44px] px-4 rounded-xl border border-line text-[14px] font-medium text-mist-dim disabled:opacity-40"
              >
                Supprimer
              </button>
            </div>
          </section>
        ))}

        {/* Téléchargement interrompu (appli fermée, réseau perdu) */}
        {!encours &&
          interrompues.map((a) => (
            <section key={a.id} className="rounded-2xl border border-warn/40 bg-panel p-4 flex flex-col gap-2.5">
              <h2 className="font-display font-semibold text-[16px]">{NOM_AIRE[a.id]} : pas fini</h2>
              <p className="text-[14px] text-mist-dim">Le téléchargement s&apos;est arrêté. Ce qui est déjà là est gardé.</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!enLigne}
                  onClick={() => void relancer(a)}
                  className="min-h-[44px] px-4 rounded-xl bg-primary text-white text-[14px] font-semibold disabled:opacity-40"
                >
                  Reprendre
                </button>
                <button
                  type="button"
                  onClick={() => void supprimerAire(a.id)}
                  className="min-h-[44px] px-4 rounded-xl border border-line text-[14px] font-medium text-mist-dim"
                >
                  Supprimer
                </button>
              </div>
            </section>
          ))}

        {pret && !demo && pretes.length > 0 && !ajout && !encours && disponibles.length > 0 && (
          <section className="rounded-2xl border border-dashed border-line p-3.5 flex flex-col gap-2">
            <h2 className="text-[15px] font-semibold">Ajouter une autre carte</h2>
            <p className="text-[14px] leading-relaxed text-mist-dim">
              Ton trajet, ou toute la Calédonie si tu te déplaces pendant la saison des cyclones.
            </p>
            <button
              type="button"
              onClick={() => setAjout(true)}
              className="self-start min-h-[44px] px-4 rounded-xl bg-primary text-white text-[14px] font-semibold"
            >
              Choisir
            </button>
          </section>
        )}

        {/* Choix de la carte */}
        {montrerChoix && !encours && (
          <fieldset className="m-0 p-0 border-0 flex flex-col gap-2">
            <legend className="mb-2 font-display font-semibold text-[16px]">Quelle carte ?</legend>
            {disponibles.map((id) => {
              const raison = raisonIndisponible(id);
              const choisi = choix === id;
              return (
                <label
                  key={id}
                  className={`flex items-center gap-3 min-h-[64px] rounded-2xl px-3.5 py-2.5 ${
                    choisi ? "border-2 border-lagoon bg-panel-2" : "border border-line bg-panel"
                  } ${raison ? "opacity-60" : ""}`}
                >
                  <input
                    type="radio"
                    name="choix-carte"
                    checked={choisi}
                    disabled={Boolean(raison)}
                    onChange={() => setChoix(id)}
                    className="w-5 h-5 accent-[#22B8B0] shrink-0"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold">{NOM_AIRE[id]}</span>
                    <span className="block text-[13px] text-mist-dim">
                      {raison ?? (id === "zone" && lieu ? `Autour de ${lieu}` : DESCRIPTION[id])}
                      {id === "nc" && !raison ? " · Wi-Fi conseillé" : ""}
                    </span>
                  </span>
                  <span className="font-mono text-[13px] shrink-0">{raison ? "" : tailleDe(id)}</span>
                </label>
              );
            })}

            <label className="mt-1 flex items-center gap-3 min-h-[52px] px-0.5">
              <input
                type="checkbox"
                checked={majAuto}
                onChange={(e) => {
                  setMajAuto(e.target.checked);
                  changerMajAuto(e.target.checked);
                }}
                className="w-5 h-5 accent-[#22B8B0] shrink-0"
              />
              <span className="text-[14px] leading-snug">Mettre à jour toute seule une fois par mois, en Wi-Fi</span>
            </label>

            {!enLigne && <p className="text-[14px] text-warn">Pas de réseau : la carte se télécharge quand ça capte.</p>}
            {estimation && "erreur" in estimation && estimation.cle === cleChoix && enLigne && (
              <p className="text-[14px] text-warn">La carte ne répond pas pour l&apos;instant : réessaie dans un moment.</p>
            )}
            {choix === "nc" && wifiConseille() && (
              <p className="text-[13.5px] text-mist-dim">Tu es en données mobiles : le Wi-Fi est conseillé pour toute la Calédonie.</p>
            )}

            <button
              type="button"
              disabled={!planChoisi || !enLigne}
              onClick={() => planChoisi && void lancer(planChoisi)}
              className="mt-2 w-full min-h-[52px] rounded-xl bg-primary font-display font-semibold text-[15.5px] text-white disabled:opacity-40"
            >
              {planChoisi ? `Télécharger la carte (≈ ${texteOctets(planChoisi.octets)})` : "Télécharger la carte"}
            </button>
            <p className="text-center text-[12px] text-mist-dim">
              Gardée sur ton téléphone · ta position n&apos;est pas envoyée
            </p>
          </fieldset>
        )}

        <p className="pb-4 text-[12px] leading-relaxed text-mist-dim">
          Carte © contributeurs OpenStreetMap, mise en forme par Protomaps, mise à jour chaque mois. Elle prend un peu de
          place sur ton téléphone : tu peux la supprimer quand tu veux.{" "}
          <Link href="/confidentialite" className="text-lagoon underline">
            Confidentialité
          </Link>
        </p>
      </div>

      <BottomNav />
    </main>
  );
}
