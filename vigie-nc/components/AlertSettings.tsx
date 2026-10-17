"use client";

import { useEffect, useState } from "react";
import { InstallApp } from "@/components/InstallApp";
import { PositionPicker } from "@/components/PositionPicker";
import { PrimaryButton, SecondaryButton } from "@/components/ui";
import { LatLng } from "@/lib/geo";
import {
  currentSubscription,
  hasSecurityAlarmFlag,
  pushSupport,
  PushSupport,
  sendTestPush,
  subscribePush,
  SubscriptionKeys,
  unsubscribePush,
} from "@/lib/push";
import {
  ALERT_RADII_KM,
  AlertRadiusKm,
  AlertZone,
  errorMessage,
  notifAvailable,
  notifGetZone,
  notifRemove,
  notifSaveZone,
  ReportsApiError,
} from "@/lib/reports-api";
import { useGeolocation } from "@/lib/useGeolocation";

type Phase = "chargement" | "inactif" | "edition" | "actif";

function BellIcon({ className }: { className?: string }) {
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

function Card({ children, active = false }: { children: React.ReactNode; active?: boolean }) {
  return (
    <section
      className={`mx-4 mb-3 rounded-xl border bg-panel px-4 py-3 ${active ? "border-primary/60" : "border-line"}`}
      aria-label="Alertes sur ton téléphone"
    >
      {children}
    </section>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-[13px] font-semibold">
      <BellIcon className="w-[18px] h-[18px] text-lagoon shrink-0" />
      {children}
    </p>
  );
}

function Note({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`mt-1.5 text-[11.5px] text-mist-dim leading-relaxed ${className}`}>{children}</p>;
}

/** Ce qui déclenche une alerte (rappel dans l'éditeur). */
function WhatTriggers() {
  return (
    <ul className="mt-2 flex flex-col gap-1 text-[11.5px] text-mist-dim leading-relaxed">
      <li>• Accident, route coupée, inondation, danger, météo.</li>
      <li>• Seulement quand une 2e personne confirme, ou qu&apos;une source officielle vérifie.</li>
      <li>• 5 alertes par heure au maximum.</li>
    </ul>
  );
}

/**
 * Notifications « danger confirmé » autour d'un lieu choisi (maison,
 * travail…), même l'appli fermée. Le lieu est enregistré arrondi à ~1 km.
 */
export function AlertSettings() {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [phase, setPhase] = useState<Phase>("chargement");
  const [keys, setKeys] = useState<SubscriptionKeys | null>(null);
  const [zone, setZone] = useState<AlertZone | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Brouillon de l'éditeur
  const [pin, setPin] = useState<LatLng | null>(null);
  const [rayon, setRayon] = useState<AlertRadiusKm>(5);
  const [nom, setNom] = useState("");
  const { position: gps, status: geoStatus, error: geoError, locate } = useGeolocation();

  useEffect(() => {
    const s = pushSupport();
    setSupport(s);
    if (s !== "ok" || !notifAvailable) {
      setPhase("inactif");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const k = await currentSubscription();
        if (cancelled) return;
        if (!k) {
          setPhase("inactif");
          return;
        }
        setKeys(k);
        const z = await notifGetZone(k.endpoint);
        if (cancelled) return;
        setZone(z);
        setPhase(z ? "actif" : "inactif");
      } catch {
        if (!cancelled) setPhase("inactif");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function pickMyPosition() {
    setError(null);
    locate()
      .then((p) => setPin({ lat: p.lat, lng: p.lng }))
      .catch(() => {
        // message affiché via geoError
      });
  }

  function startEdit() {
    setError(null);
    setNotice(null);
    setPin(zone ? { lat: zone.lat, lng: zone.lng } : null);
    setRayon(zone?.rayonKm ?? 5);
    setNom(zone?.nom ?? "");
    setPhase("edition");
    if (!zone) {
      locate()
        .then((p) => setPin((prev) => prev ?? { lat: p.lat, lng: p.lng }))
        .catch(() => {
          // pas de position : la personne touche la carte
        });
    }
  }

  async function save() {
    if (!pin) {
      setError("Choisis un lieu : touche la carte ou utilise ta position.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      // La demande d'autorisation doit partir directement du bouton.
      const k = keys ?? (await subscribePush());
      const z: AlertZone = { lat: pin.lat, lng: pin.lng, rayonKm: rayon, nom: nom.trim() || null };
      await notifSaveZone(k, z);
      setKeys(k);
      // Même arrondi que la base (~1 km)
      setZone({ ...z, lat: Math.round(pin.lat * 100) / 100, lng: Math.round(pin.lng * 100) / 100 });
      setNotice(zone ? "Zone d'alerte mise à jour." : "Alertes activées. Touche « Tester » pour vérifier.");
      setPhase("actif");
    } catch (e) {
      if (typeof Notification !== "undefined" && Notification.permission === "denied") setSupport("bloque");
      const code = e instanceof ReportsApiError ? e.code : "";
      setError(
        code === "position_hors_nc"
          ? "Choisis un lieu en Nouvelle-Calédonie."
          : errorMessage(e, "Impossible d'activer les alertes sur ce téléphone pour le moment. Réessaie plus tard."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (!keys) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const ok = await sendTestPush(keys);
    setBusy(false);
    if (ok) setNotice("Notification de test envoyée : elle arrive dans quelques secondes.");
    else setError("Le test n'a pas pu être envoyé. Réessaie dans un moment.");
  }

  async function disable() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (keys) await notifRemove(keys.endpoint);
    } catch {
      // sans réseau : l'adresse sera effacée au premier envoi refusé
    }
    try {
      // L'alarme de sécurité des modérateurs passe par le même abonnement :
      // on le garde si elle est active sur ce téléphone.
      if (!hasSecurityAlarmFlag()) await unsubscribePush();
    } catch {
      // rien à faire
    }
    setKeys(null);
    setZone(null);
    setBusy(false);
    setPhase("inactif");
    setNotice("Alertes désactivées : ton lieu d'alerte a été effacé.");
  }

  const messages = (
    <>
      {notice && <p className="mt-2 text-[12px] text-ok">{notice}</p>}
      {error && (
        <p className="mt-2 text-[12px] text-danger" role="alert">
          {error}
        </p>
      )}
    </>
  );

  if (support === null || phase === "chargement") {
    return (
      <Card>
        <Title>Alertes sur ton téléphone</Title>
        <Note>Chargement…</Note>
      </Card>
    );
  }

  // ---- Cas où les alertes ne peuvent pas marcher ici ----
  if (support === "iphone-a-installer") {
    return (
      <Card>
        <Title>Alertes sur ton iPhone</Title>
        <Note>
          Sur iPhone, les alertes marchent seulement dans l&apos;appli ajoutée à l&apos;écran d&apos;accueil :
          ajoute Vigie NC, ouvre-la depuis sa nouvelle icône, puis reviens ici (onglet Alertes).
        </Note>
        <div className="mt-2.5">
          <InstallApp />
        </div>
        <Note>
          Bon à savoir : l&apos;appli de l&apos;écran d&apos;accueil garde ses propres réglages. Ajoute aussi tes
          contacts SOS dedans.
        </Note>
      </Card>
    );
  }
  if (support === "iphone-trop-ancien") {
    return (
      <Card>
        <Title>Alertes sur ton iPhone</Title>
        <Note>
          Ton iPhone doit être à jour pour recevoir les alertes (iOS 16.4 ou plus récent) : Réglages → Général →
          Mise à jour logicielle.
        </Note>
      </Card>
    );
  }
  if (support === "non-supporte") {
    return (
      <Card>
        <Title>Alertes sur ton téléphone</Title>
        <Note>
          Ce navigateur ne peut pas recevoir d&apos;alertes. Ouvre Vigie NC dans <strong className="text-mist">Chrome</strong>{" "}
          (Android) ou depuis l&apos;écran d&apos;accueil (iPhone).
        </Note>
      </Card>
    );
  }
  if (support === "non-configure" || !notifAvailable) {
    return (
      <Card>
        <Title>Alertes sur ton téléphone</Title>
        <Note>Les alertes ne sont pas encore disponibles sur cette version de l&apos;appli.</Note>
      </Card>
    );
  }
  if (support === "bloque") {
    return (
      <Card>
        <Title>Alertes bloquées</Title>
        <Note>
          Les notifications de Vigie NC sont refusées sur ce téléphone. Pour les réactiver : dans les réglages du
          navigateur (ou de l&apos;appli), ouvre <strong className="text-mist">Notifications</strong>, autorise Vigie
          NC, puis recharge cette page.
        </Note>
        {messages}
      </Card>
    );
  }

  // ---- Alertes actives ----
  if (phase === "actif" && zone) {
    return (
      <Card active>
        <Title>
          Alertes activées
          <span className="ml-auto rounded-full bg-primary/20 px-2 py-0.5 text-[10.5px] font-medium text-lagoon">
            ✓ Actives
          </span>
        </Title>
        <Note>
          Dangers confirmés à moins de <strong className="text-mist">{zone.rayonKm} km</strong> de{" "}
          <strong className="text-mist">{zone.nom ? `« ${zone.nom} »` : "ton lieu d'alerte"}</strong>, même
          l&apos;appli fermée.
        </Note>
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          {(
            [
              ["Modifier", startEdit],
              ["Tester", test],
              ["Désactiver", disable],
            ] as [string, () => void][]
          ).map(([label, action]) => (
            <button
              key={label}
              type="button"
              disabled={busy}
              onClick={action}
              className={`min-h-[44px] rounded-lg border border-line bg-panel-2 text-[12.5px] font-medium disabled:opacity-40 ${
                label === "Désactiver" ? "text-mist-dim" : "text-mist"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {messages}
        <Note>
          Chrome parle de « spam » ? Choisis d&apos;afficher la notification, puis{" "}
          <strong className="text-mist">Toujours autoriser</strong> : l&apos;avertissement ne reviendra plus. Ne te
          désabonne pas, sinon les alertes s&apos;arrêtent.
        </Note>
      </Card>
    );
  }

  // ---- Éditeur : lieu, distance, nom ----
  if (phase === "edition") {
    const askPermission = typeof Notification !== "undefined" && Notification.permission !== "granted";
    return (
      <Card active>
        <Title>{zone ? "Modifier ma zone d'alerte" : "Activer les alertes"}</Title>
        <WhatTriggers />

        <p className="mt-3 text-[12px] font-medium">1. Le lieu à surveiller</p>
        <div className="relative mt-1.5 h-[240px] rounded-xl overflow-hidden border border-line">
          <PositionPicker
            value={pin}
            gps={gps}
            onChange={setPin}
            radiusM={rayon * 1000}
            label="Lieu d'alerte"
          />
        </div>
        <button
          type="button"
          onClick={pickMyPosition}
          disabled={geoStatus === "locating"}
          className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-line bg-panel-2 text-[12.5px] font-medium text-mist disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} className="w-4 h-4" aria-hidden="true">
            <circle cx="12" cy="12" r="3.5" />
            <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" strokeLinecap="round" />
          </svg>
          {geoStatus === "locating" ? "Recherche de ta position…" : "Utiliser ma position actuelle"}
        </button>
        {geoError && <p className="mt-1.5 text-[11.5px] text-warn">{geoError}</p>}
        <Note>
          Ou touche la carte / fais glisser le repère. Le lieu est enregistré arrondi à environ 1 km.
        </Note>

        <p className="mt-3 text-[12px] font-medium">2. La distance</p>
        <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-xl border border-line bg-panel-2 p-1" role="radiogroup">
          {ALERT_RADII_KM.map((km) => (
            <button
              key={km}
              type="button"
              role="radio"
              aria-checked={rayon === km}
              onClick={() => setRayon(km)}
              className={`min-h-[40px] rounded-lg text-[13px] font-medium ${
                rayon === km ? "bg-primary text-white" : "text-mist-dim"
              }`}
            >
              {km} km
            </button>
          ))}
        </div>

        <label className="mt-3 block text-[12px] font-medium" htmlFor="alerte-nom">
          3. Un nom <span className="font-normal text-mist-dim">(facultatif)</span>
        </label>
        <input
          id="alerte-nom"
          type="text"
          value={nom}
          maxLength={30}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Maison, Travail, École…"
          className="mt-1.5 w-full rounded-lg border border-line bg-panel-2 px-3 py-2.5 text-[13px] text-mist placeholder:text-mist-dim/70 focus:border-primary focus:outline-none"
        />
        <Note>Il apparaît dans la notification. Écris un lieu, jamais le nom d&apos;une personne.</Note>

        {!zone && (
          <Note>
            <strong className="font-semibold text-warn">Un seul endroit par téléphone :</strong> dans l&apos;appli
            installée si tu l&apos;as, sinon dans le navigateur. Activées aux deux endroits, chaque alerte arrive deux
            fois.
          </Note>
        )}

        <div className="mt-3 flex flex-col gap-2">
          <PrimaryButton onClick={save} disabled={busy || !pin}>
            {busy ? "Un instant…" : zone ? "Enregistrer" : "Activer les alertes"}
          </PrimaryButton>
          <SecondaryButton
            onClick={() => {
              setError(null);
              setPhase(zone ? "actif" : "inactif");
            }}
            disabled={busy}
          >
            Annuler
          </SecondaryButton>
        </div>
        {askPermission && (
          <Note className="text-center">
            Ton téléphone va demander l&apos;autorisation d&apos;afficher des notifications : réponds
            « Autoriser ».
          </Note>
        )}
        {messages}
      </Card>
    );
  }

  // ---- Pas encore activées ----
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <Title>Être prévenu sur ce téléphone</Title>
          <Note className="mt-1">Dangers confirmés près d&apos;un lieu que tu choisis, même l&apos;appli fermée.</Note>
        </div>
        <button
          type="button"
          onClick={startEdit}
          className="min-h-[44px] shrink-0 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white active:bg-primary-strong"
        >
          Activer
        </button>
      </div>
      {messages}
    </Card>
  );
}
