"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PositionPicker } from "@/components/PositionPicker";
import { TrajetApercu } from "@/components/TrajetApercu";
import { PrimaryButton, SecondaryButton } from "@/components/ui";
import { distanceM, LatLng } from "@/lib/geo";
import { ALERTES_EVENT, currentSubscription, pushSupport, SubscriptionKeys } from "@/lib/push";
import {
  calculerItineraire,
  errorMessage,
  Itineraire,
  notifAvailable,
  notifGetZone,
  trajetEnregistrerServeur,
  trajetLireServeur,
  trajetSupprimerServeur,
} from "@/lib/reports-api";
import {
  basculerJour,
  dureeTexte,
  garderTrajet,
  heureTexte,
  heureValide,
  JOURS_INITIALES,
  JOURS_NOMS,
  JOURS_SEMAINE,
  jourCoche,
  joursTexte,
  lireTrajet,
  longueurLigne,
  longueurTexte,
  oublierTrajet,
  preparerLigne,
  TRAJET_AVANCE_MIN,
  TRAJET_DISTANCE_MIN_M,
  TRAJET_EVENT,
  TRAJET_LONGUEUR_MIN_M,
  TrajetLocal,
} from "@/lib/trajet";
import { useGeolocation } from "@/lib/useGeolocation";

type Phase = "chargement" | "vide" | "edition" | "pret";
type Etape = "depart" | "arrivee" | "horaires";

function RouteIcon({ className }: { className?: string }) {
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
      <circle cx="6" cy="19" r="2.5" />
      <circle cx="18" cy="5" r="2.5" />
      <path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5" />
    </svg>
  );
}

function Card({ children, active = false }: { children: React.ReactNode; active?: boolean }) {
  return (
    <section
      id="trajet"
      className={`mx-4 mb-3 scroll-mt-4 rounded-xl border bg-panel px-4 py-3 ${active ? "border-primary/60" : "border-line"}`}
      aria-label="Mon trajet"
    >
      {children}
    </section>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-[15px] font-semibold">
      <RouteIcon className="w-[18px] h-[18px] text-lagoon shrink-0" />
      {children}
    </p>
  );
}

function Note({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`mt-1.5 text-[13.5px] text-mist-dim leading-relaxed ${className}`}>{children}</p>;
}

function Etapes({ etape }: { etape: Etape }) {
  const liste: [Etape, string][] = [
    ["depart", "Départ"],
    ["arrivee", "Arrivée"],
    ["horaires", "Horaires"],
  ];
  const i = liste.findIndex(([e]) => e === etape);
  return (
    <ol className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[12.5px]" aria-label="Étapes">
      {liste.map(([e, label], k) => (
        <li
          key={e}
          aria-current={e === etape ? "step" : undefined}
          className={`rounded-full border px-2 py-1 ${
            k === i ? "border-primary bg-primary/20 text-mist" : k < i ? "border-line text-lagoon-dim" : "border-line text-mist-dim"
          }`}
        >
          {k < i ? "✓ " : `${k + 1}. `}
          {label}
        </li>
      ))}
    </ol>
  );
}

/** Une heure de départ (aller ou retour), activable. */
function HeureDepart({
  id,
  label,
  actif,
  heure,
  onActif,
  onHeure,
}: {
  id: string;
  label: string;
  actif: boolean;
  heure: string;
  onActif: (v: boolean) => void;
  onHeure: (v: string) => void;
}) {
  return (
    <div className="mt-2 flex items-center gap-3 rounded-lg border border-line bg-panel-2 px-3 py-1.5">
      <label className="flex flex-1 min-h-[44px] items-center gap-2.5 text-[14.5px]" htmlFor={`${id}-actif`}>
        <input
          id={`${id}-actif`}
          type="checkbox"
          checked={actif}
          onChange={(e) => onActif(e.target.checked)}
          className="h-5 w-5 accent-[#167F78]"
        />
        {label}
      </label>
      <input
        id={`${id}-heure`}
        type="time"
        value={heure}
        step={300}
        disabled={!actif}
        aria-label={`Heure de départ : ${label.toLowerCase()}`}
        onChange={(e) => onHeure(e.target.value)}
        className="min-h-[44px] rounded-lg border border-line bg-void px-2 text-[15px] text-mist disabled:opacity-40 focus:border-primary focus:outline-none"
      />
    </div>
  );
}

/**
 * « Mon trajet » (écran Alertes) : le trajet de tous les jours (maison →
 * travail…). Sur le téléphone : point sur le trajet à l'ouverture de
 * l'appli. Avec les alertes activées : alerte 30 min avant chaque départ
 * s'il y a un danger confirmé dessus, pendant le trajet, et à la fin du
 * danger. Le départ et l'arrivée exacts ne quittent pas le téléphone.
 */
export function TrajetSettings() {
  const [phase, setPhase] = useState<Phase>("chargement");
  const [trajet, setTrajet] = useState<TrajetLocal | null>(null);
  const [keys, setKeys] = useState<SubscriptionKeys | null>(null);
  const [alertesActives, setAlertesActives] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Brouillon de l'éditeur
  const [etape, setEtape] = useState<Etape>("depart");
  const [depart, setDepart] = useState<LatLng | null>(null);
  const [arrivee, setArrivee] = useState<LatLng | null>(null);
  const [itineraire, setItineraire] = useState<Itineraire | null>(null);
  const [ligne, setLigne] = useState<ReturnType<typeof preparerLigne> | null>(null);
  const [jours, setJours] = useState(JOURS_SEMAINE);
  const [allerOn, setAllerOn] = useState(true);
  const [aller, setAller] = useState("06:30");
  const [retourOn, setRetourOn] = useState(true);
  const [retour, setRetour] = useState("16:30");
  const [calme, setCalme] = useState(false);
  const { position: gps, status: geoStatus, error: geoError, locate } = useGeolocation();

  /**
   * Alertes de ce téléphone, et trajet rattaché à l'abonnement : renvoyé à
   * la base s'il manque ou diffère (alertes activées après le trajet…).
   */
  const synchroniser = useCallback(async (t: TrajetLocal | null) => {
    if (!notifAvailable || pushSupport() !== "ok") {
      setKeys(null);
      setAlertesActives(false);
      return;
    }
    try {
      const k = await currentSubscription();
      const zone = k ? await notifGetZone(k.endpoint) : null;
      setKeys(k);
      setAlertesActives(Boolean(zone));
      if (!k || !zone || !t) return;
      const serveur = await trajetLireServeur(k.endpoint);
      if (
        !serveur ||
        serveur.jours !== t.jours ||
        serveur.aller !== t.aller ||
        serveur.retour !== t.retour ||
        serveur.calme !== t.calme ||
        Math.abs(serveur.longueurM - t.longueurM) > 100
      ) {
        await trajetEnregistrerServeur(k.endpoint, t);
      }
    } catch {
      // pas de réseau : on réessaiera à la prochaine ouverture
    }
  }, []);

  useEffect(() => {
    const t = lireTrajet();
    setTrajet(t);
    setPhase(t ? "pret" : "vide");
    void synchroniser(t);
    // Lien « Ajoute ton trajet » de l'accueil (/alertes#trajet)
    if (window.location.hash === "#trajet") {
      setTimeout(() => document.getElementById("trajet")?.scrollIntoView({ behavior: "smooth" }), 300);
    }
    const surAlertes = () => void synchroniser(lireTrajet());
    window.addEventListener(ALERTES_EVENT, surAlertes);
    return () => window.removeEventListener(ALERTES_EVENT, surAlertes);
  }, [synchroniser]);

  // Le trajet a changé ailleurs (autre onglet…)
  useEffect(() => {
    const relire = () => {
      if (phase === "edition") return;
      const t = lireTrajet();
      setTrajet(t);
      setPhase(t ? "pret" : "vide");
    };
    window.addEventListener(TRAJET_EVENT, relire);
    return () => window.removeEventListener(TRAJET_EVENT, relire);
  }, [phase]);

  function nouveau() {
    setError(null);
    setNotice(null);
    setItineraire(null);
    setLigne(null);
    setArrivee(null);
    setDepart(null);
    setJours(trajet?.jours ?? JOURS_SEMAINE);
    setCalme(trajet?.calme ?? false);
    setEtape("depart");
    setPhase("edition");
    locate()
      .then((p) => setDepart((prev) => prev ?? { lat: p.lat, lng: p.lng }))
      .catch(() => {
        // pas de position : la personne touche la carte
      });
  }

  function modifierHoraires() {
    if (!trajet) return;
    setError(null);
    setNotice(null);
    setItineraire(null);
    setLigne(null);
    setJours(trajet.jours);
    setAllerOn(Boolean(trajet.aller));
    setAller(trajet.aller ?? "06:30");
    setRetourOn(Boolean(trajet.retour));
    setRetour(trajet.retour ?? "16:30");
    setCalme(trajet.calme);
    setEtape("horaires");
    setPhase("edition");
  }

  function annuler() {
    setError(null);
    setPhase(trajet ? "pret" : "vide");
  }

  function maPosition(pour: "depart" | "arrivee") {
    setError(null);
    locate()
      .then((p) => (pour === "depart" ? setDepart : setArrivee)({ lat: p.lat, lng: p.lng }))
      .catch(() => {
        // message affiché via geoError
      });
  }

  async function calculer() {
    if (!depart || !arrivee) return;
    if (distanceM(depart, arrivee) < TRAJET_DISTANCE_MIN_M) {
      setError("Le départ et l'arrivée sont trop proches : 500 m au moins.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const it = await calculerItineraire(depart, arrivee);
      const prep = preparerLigne(it.points);
      if (prep.points.length < 2 || prep.longueurM < TRAJET_LONGUEUR_MIN_M) {
        setError("Ce trajet est trop court pour être surveillé.");
        return;
      }
      setItineraire(it);
      setLigne(prep);
      setEtape("horaires");
    } catch (e) {
      setError(errorMessage(e, "Le calcul d'itinéraire n'a pas marché. Réessaie dans un moment."));
    } finally {
      setBusy(false);
    }
  }

  async function enregistrer() {
    const points = ligne?.points ?? trajet?.points;
    if (!points) return;
    const a = allerOn && heureValide(aller) ? aller : null;
    const r = retourOn && heureValide(retour) ? retour : null;
    if (!a && !r) {
      setError("Indique au moins une heure de départ (aller ou retour).");
      return;
    }
    if (jours === 0) {
      setError("Choisis au moins un jour.");
      return;
    }
    const t: TrajetLocal = {
      v: 1,
      points,
      longueurM: ligne?.longueurM ?? trajet?.longueurM ?? Math.round(longueurLigne(points)),
      distanceTotaleM: itineraire
        ? Math.round(itineraire.distanceM || longueurLigne(itineraire.points))
        : (trajet?.distanceTotaleM ?? null),
      dureeS: itineraire ? itineraire.dureeS : (trajet?.dureeS ?? null),
      jours,
      aller: a,
      retour: r,
      calme,
      majAt: new Date().toISOString(),
    };
    setBusy(true);
    setError(null);
    setNotice(null);
    garderTrajet(t);
    setTrajet(t);
    try {
      if (keys && alertesActives) {
        await trajetEnregistrerServeur(keys.endpoint, t);
        setNotice(
          calme
            ? `Trajet enregistré. Tu auras le point sur ta route ${TRAJET_AVANCE_MIN} min avant chaque départ.`
            : `Trajet enregistré. S'il y a un danger dessus, tu seras prévenu ${TRAJET_AVANCE_MIN} min avant de partir.`,
        );
      } else {
        setNotice("Trajet enregistré : le point sur ton trajet s'affiche sur l'accueil.");
      }
    } catch (e) {
      setNotice("Trajet enregistré sur ce téléphone.");
      setError(errorMessage(e, "Les alertes du trajet n'ont pas pu être activées. Réessaie plus tard."));
    } finally {
      setBusy(false);
      setPhase("pret");
    }
  }

  async function supprimer() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (keys) await trajetSupprimerServeur(keys.endpoint);
    } catch {
      // sans réseau : il partira avec l'abonnement, ou au prochain enregistrement
    }
    oublierTrajet();
    setTrajet(null);
    setBusy(false);
    setPhase("vide");
    setNotice("Trajet effacé de ce téléphone et des alertes.");
  }

  const messages = (
    <>
      {notice && <p className="mt-2 text-[14px] text-ok">{notice}</p>}
      {error && (
        <p className="mt-2 text-[14px] text-danger" role="alert">
          {error}
        </p>
      )}
    </>
  );

  if (phase === "chargement") {
    return (
      <Card>
        <Title>Mon trajet</Title>
        <Note>Chargement…</Note>
      </Card>
    );
  }

  // ---- Pas encore de trajet ----
  if (phase === "vide") {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <Title>Mon trajet de tous les jours</Title>
            <Note className="mt-1">
              Maison → travail : le point sur ta route dès l&apos;ouverture, et une alerte avant de partir s&apos;il y a
              un danger dessus.
            </Note>
          </div>
          <button
            type="button"
            onClick={nouveau}
            className="min-h-[44px] shrink-0 rounded-lg bg-primary px-4 text-[15px] font-semibold text-white active:bg-primary-strong"
          >
            Ajouter
          </button>
        </div>
        {messages}
      </Card>
    );
  }

  // ---- Trajet enregistré ----
  if (phase === "pret" && trajet) {
    const departs = [
      trajet.aller ? `départ à ${heureTexte(trajet.aller)}` : null,
      trajet.retour ? `retour à ${heureTexte(trajet.retour)}` : null,
    ].filter(Boolean);
    const taille = [
      trajet.distanceTotaleM ? `≈ ${longueurTexte(trajet.distanceTotaleM)}` : null,
      trajet.dureeS ? `≈ ${dureeTexte(trajet.dureeS)}` : null,
    ].filter(Boolean);
    return (
      <Card active={alertesActives}>
        <Title>
          Mon trajet
          {alertesActives && (
            <span className="ml-auto rounded-full bg-primary/20 px-2 py-0.5 text-[12.5px] font-medium text-lagoon">
              ✓ Surveillé
            </span>
          )}
        </Title>
        <p className="mt-1.5 text-[14.5px]">
          {departs.join(", ").replace(/^./, (c) => c.toUpperCase())}, {joursTexte(trajet.jours)}.
        </p>
        {taille.length > 0 && <Note className="mt-0.5">{taille.join(" · ")} en voiture</Note>}
        {alertesActives ? (
          <Note>
            {trajet.calme
              ? `Point sur ta route ${TRAJET_AVANCE_MIN} min avant chaque départ, même quand tout est calme. Alerte aussi pendant le trajet, puis quand un danger est déclaré terminé.`
              : `Alerte ${TRAJET_AVANCE_MIN} min avant chaque départ s'il y a un danger confirmé sur ta route, pendant le trajet, puis quand le danger est déclaré terminé.`}
          </Note>
        ) : (
          <Note>
            <strong className="font-semibold text-mist">Pour être prévenu avant de partir,</strong> active les alertes
            ci-dessus. Le point sur ton trajet s&apos;affiche déjà sur l&apos;accueil.
          </Note>
        )}
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          <Link
            href="/?trajet=1"
            className="flex min-h-[44px] items-center justify-center rounded-lg border border-line bg-panel-2 text-center text-[14px] font-medium text-mist"
          >
            Sur la carte
          </Link>
          {(
            [
              ["Modifier", modifierHoraires],
              ["Effacer", supprimer],
            ] as [string, () => void][]
          ).map(([label, action]) => (
            <button
              key={label}
              type="button"
              disabled={busy}
              onClick={action}
              className={`min-h-[44px] rounded-lg border border-line bg-panel-2 text-[14.5px] font-medium disabled:opacity-40 ${
                label === "Effacer" ? "text-mist-dim" : "text-mist"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {messages}
      </Card>
    );
  }

  // ---- Éditeur : départ, arrivée, horaires ----
  const trace = itineraire?.points ?? trajet?.points ?? null;
  const surveille = ligne?.points ?? trajet?.points;
  return (
    <Card active>
      <Title>{trajet ? "Modifier mon trajet" : "Ajouter mon trajet"}</Title>
      <Etapes etape={etape} />

      {etape === "depart" && (
        <>
          <p className="mt-3 text-[14px] font-medium">D&apos;où pars-tu ? (maison…)</p>
          <div className="relative mt-1.5 h-[240px] overflow-hidden rounded-xl border border-line">
            <PositionPicker key="depart" value={depart} gps={gps} onChange={setDepart} label="Départ" />
          </div>
          <button
            type="button"
            onClick={() => maPosition("depart")}
            disabled={geoStatus === "locating"}
            className="mt-2 flex min-h-[44px] w-full items-center justify-center rounded-lg border border-line bg-panel-2 text-[14.5px] font-medium text-mist disabled:opacity-40"
          >
            {geoStatus === "locating" ? "Recherche de ta position…" : "Utiliser ma position actuelle"}
          </button>
          {geoError && <p className="mt-1.5 text-[13.5px] text-warn">{geoError}</p>}
          <Note>Touche la carte ou fais glisser le repère. Ce point reste sur ton téléphone.</Note>
          <div className="mt-3 flex flex-col gap-2">
            <PrimaryButton onClick={() => setEtape("arrivee")} disabled={!depart}>
              Suivant : l&apos;arrivée
            </PrimaryButton>
            <SecondaryButton onClick={annuler}>Annuler</SecondaryButton>
          </div>
        </>
      )}

      {etape === "arrivee" && (
        <>
          <p className="mt-3 text-[14px] font-medium">Où vas-tu ? (travail, école…)</p>
          <div className="relative mt-1.5 h-[240px] overflow-hidden rounded-xl border border-line">
            <PositionPicker key="arrivee" value={arrivee} gps={gps} onChange={setArrivee} label="Arrivée" />
          </div>
          <button
            type="button"
            onClick={() => maPosition("arrivee")}
            disabled={geoStatus === "locating"}
            className="mt-2 flex min-h-[44px] w-full items-center justify-center rounded-lg border border-line bg-panel-2 text-[14.5px] font-medium text-mist disabled:opacity-40"
          >
            {geoStatus === "locating" ? "Recherche de ta position…" : "Je suis à l'arrivée en ce moment"}
          </button>
          <Note>Touche la carte à l&apos;endroit où tu vas. Ce point reste aussi sur ton téléphone.</Note>
          <div className="mt-3 flex flex-col gap-2">
            <PrimaryButton onClick={calculer} disabled={busy || !arrivee}>
              {busy ? "Calcul de l'itinéraire…" : "Calculer l'itinéraire"}
            </PrimaryButton>
            <SecondaryButton onClick={() => setEtape("depart")} disabled={busy}>
              Retour au départ
            </SecondaryButton>
          </div>
          <Note className="text-[12.5px]">
            Itinéraire calculé une fois par un service gratuit (OSRM, données OpenStreetMap), avec des positions
            arrondies à 100 m environ.
          </Note>
        </>
      )}

      {etape === "horaires" && trace && (
        <>
          <div className="relative mt-3 h-[220px] overflow-hidden rounded-xl border border-line">
            <TrajetApercu trace={trace} surveille={surveille} />
          </div>
          {itineraire && (
            <Note className="mt-1">
              ≈ {longueurTexte(itineraire.distanceM || longueurLigne(itineraire.points))}
              {itineraire.dureeS ? ` · ≈ ${dureeTexte(itineraire.dureeS)}` : ""} en voiture. Les pointillés (500 m
              à chaque bout) restent sur ton téléphone : seule la ligne pleine est surveillée.
            </Note>
          )}
          {!itineraire && (
            <button
              type="button"
              onClick={nouveau}
              className="mt-2 min-h-[44px] w-full rounded-lg border border-line bg-panel-2 text-[14.5px] font-medium text-mist"
            >
              Changer le départ ou l&apos;arrivée
            </button>
          )}

          <p className="mt-3 text-[14px] font-medium">Tes heures de départ</p>
          <HeureDepart id="aller" label="Aller" actif={allerOn} heure={aller} onActif={setAllerOn} onHeure={setAller} />
          <HeureDepart
            id="retour"
            label="Retour"
            actif={retourOn}
            heure={retour}
            onActif={setRetourOn}
            onHeure={setRetour}
          />

          <p className="mt-3 text-[14px] font-medium">Les jours</p>
          <div className="mt-1.5 grid grid-cols-7 gap-1" role="group" aria-label="Jours du trajet">
            {JOURS_INITIALES.map((initiale, i) => {
              const coche = jourCoche(jours, i);
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={coche}
                  aria-label={JOURS_NOMS[i]}
                  onClick={() => setJours((j) => basculerJour(j, i))}
                  className={`min-h-[44px] rounded-lg border text-[15px] font-semibold ${
                    coche ? "border-primary bg-primary text-white" : "border-line bg-panel-2 text-mist-dim"
                  }`}
                >
                  {initiale}
                </button>
              );
            })}
          </div>
          <Note>
            {jours === 0 ? "Choisis au moins un jour." : `Trajet ${joursTexte(jours)}.`}{" "}
            {alertesActives
              ? `Alerte ${TRAJET_AVANCE_MIN} min avant chaque départ s'il y a un danger confirmé.`
              : "Active les alertes (ci-dessus) pour être prévenu avant de partir."}
          </Note>

          <label
            htmlFor="trajet-calme"
            className={`mt-2 flex min-h-[44px] items-start gap-2.5 rounded-lg border border-line bg-panel-2 px-3 py-2.5 text-[14.5px] ${
              alertesActives ? "" : "opacity-60"
            }`}
          >
            <input
              id="trajet-calme"
              type="checkbox"
              checked={calme}
              onChange={(e) => setCalme(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#167F78]"
            />
            <span>
              Me prévenir aussi quand tout est calme
              <span className="block text-[13px] text-mist-dim">
                « Trajet de 6 h 30 · Rien de signalé », {TRAJET_AVANCE_MIN} min avant chaque départ.
              </span>
            </span>
          </label>

          <div className="mt-3 flex flex-col gap-2">
            <PrimaryButton onClick={enregistrer} disabled={busy || jours === 0}>
              {busy ? "Un instant…" : "Enregistrer mon trajet"}
            </PrimaryButton>
            <SecondaryButton
              onClick={() => (itineraire ? setEtape("arrivee") : annuler())}
              disabled={busy}
            >
              {itineraire ? "Retour à l'arrivée" : "Annuler"}
            </SecondaryButton>
          </div>
        </>
      )}
      {messages}
    </Card>
  );
}
