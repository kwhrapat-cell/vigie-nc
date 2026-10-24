"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScreenHeader } from "@/components/ui";
import { getEmergencyContacts } from "@/lib/emergency-contacts";
import { useGeolocation } from "@/lib/useGeolocation";

const HOLD_MS = 3000;
const RING_R = 92;
const RING_LEN = 2 * Math.PI * RING_R;

type Phase = "idle" | "holding" | "sending" | "done" | "error";

const messageFor = (link: string) => `SOS — j'ai besoin d'aide, voici ma position : ${link}`;

/**
 * Écran SOS — « Je suis en danger ». Appui long de 3 secondes pour éviter
 * les déclenchements accidentels (poche, enfant…).
 * Vigie NC n'alerte PAS les secours automatiquement et NE PUBLIE RIEN :
 * la position d'une personne en danger ne va jamais sur la carte publique
 * (personne ne la surveille 24 h sur 24, et elle pourrait être lue par
 * quelqu'un que la personne fuit). L'écran prépare un SMS avec la position
 * pour les contacts d'urgence, permet de l'envoyer à qui on veut, et
 * propose d'appeler le 15, 17 ou 18.
 */
export default function SosPage() {
  const { locate, error: geoError } = useGeolocation();
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [contactsCount, setContactsCount] = useState(0);
  const [mapsLink, setMapsLink] = useState<string | null>(null);
  const [smsHref, setSmsHref] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const startRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    setContactsCount(getEmergencyContacts().length);
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const trigger = useCallback(async () => {
    setPhase("sending");
    try {
      const pos = await locate();
      const link = `https://maps.google.com/?q=${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`;
      setMapsLink(link);

      const contacts = getEmergencyContacts();
      if (contacts.length > 0) {
        const href = `sms:${contacts.map((c) => c.phone).join(",")}?body=${encodeURIComponent(messageFor(link))}`;
        setSmsHref(href);
        // Ouvre l'appli SMS, message pré-rempli : l'envoi reste un geste
        // volontaire de la personne, jamais automatique.
        window.location.href = href;
      }
      setPhase("done");
    } catch {
      setPhase("error");
    }
  }, [locate]);

  const sharePosition = useCallback(async () => {
    if (!mapsLink) return;
    try {
      await navigator.share({ title: "SOS", text: messageFor(mapsLink) });
    } catch {
      // partage annulé : rien à faire
    }
  }, [mapsLink]);

  const stopHold = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    startRef.current = null;
    setPhase((p) => (p === "holding" ? "idle" : p));
    setProgress((p) => (p < 1 ? 0 : p));
  }, []);

  const startHold = useCallback(() => {
    if (phase !== "idle" && phase !== "error") return;
    setPhase("holding");
    startRef.current = performance.now();
    const tick = (t: number) => {
      if (startRef.current === null) return;
      const p = Math.min(1, (t - startRef.current) / HOLD_MS);
      setProgress(p);
      if (p >= 1) {
        startRef.current = null;
        if (navigator.vibrate) navigator.vibrate(200);
        trigger();
      } else {
        frameRef.current = requestAnimationFrame(tick);
      }
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [phase, trigger]);

  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
  }, []);

  const secondsLeft = Math.ceil((1 - progress) * (HOLD_MS / 1000));

  return (
    <main className="min-h-[100dvh] flex flex-col pb-6">
      <ScreenHeader title="SOS — Je suis en danger" backHref="/" />

      <section className="flex-1 flex flex-col items-center px-5 pt-4">
        <div className="relative w-[210px] h-[210px] select-none">
          <svg viewBox="0 0 210 210" className="absolute inset-0 -rotate-90" aria-hidden="true">
            <circle cx="105" cy="105" r={RING_R} fill="none" stroke="#3A1416" strokeWidth="8" />
            <circle
              cx="105"
              cy="105"
              r={RING_R}
              fill="none"
              stroke="#F26A6E"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={RING_LEN}
              strokeDashoffset={RING_LEN * (1 - progress)}
              className="sos-ring"
            />
          </svg>
          <button
            type="button"
            aria-label="Déclencher le SOS : maintenir appuyé 3 secondes"
            disabled={phase === "sending" || phase === "done"}
            onPointerDown={startHold}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onPointerCancel={stopHold}
            onContextMenu={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !e.repeat) startHold();
            }}
            onKeyUp={stopHold}
            className="absolute inset-[18px] rounded-full flex flex-col items-center justify-center text-white font-display font-bold text-[44px] tracking-wide disabled:opacity-80 touch-none"
            style={{
              background: "radial-gradient(circle at 35% 30%, #F26A6E, #C92F35)",
              boxShadow: "0 0 0 10px rgba(229,72,77,0.15), 0 18px 40px -10px rgba(229,72,77,0.7)",
            }}
          >
            SOS
            <span className="font-body font-medium text-[13px] tracking-normal opacity-90 mt-1">
              {phase === "holding" ? `Encore ${secondsLeft} s…` : phase === "sending" ? "Envoi…" : phase === "done" ? "Déclenché" : "Appui long 3 sec."}
            </span>
          </button>
        </div>

        {phase === "error" && (
          <p className="mt-4 text-center text-[14.5px] text-danger" role="alert">
            {geoError ?? "Impossible d'obtenir ta position."} Appelle directement les secours ci-dessous.
          </p>
        )}

        <ul className="mt-6 w-full flex flex-col gap-2">
          <li className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-3 text-[14.5px]">
            <p className="mb-2">Appeler les secours</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { n: "15", l: "SAMU" },
                { n: "17", l: "Police / gend." },
                { n: "18", l: "Pompiers" },
              ].map((s) => (
                <a key={s.n} href={`tel:${s.n}`} className="min-h-[44px] rounded-lg bg-danger py-2 text-center text-white">
                  <span className="block font-display font-bold text-[18px] leading-tight">{s.n}</span>
                  <span className="block text-[12px] opacity-90">{s.l}</span>
                </a>
              ))}
            </div>
          </li>
          <li className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-3 text-[14.5px]">
            <span className={`w-2.5 h-2.5 rounded-full ${smsHref ? "bg-ok" : "bg-line"}`} />
            <span className="flex-1">
              {contactsCount > 0
                ? `SMS prêt pour ${contactsCount} contact${contactsCount > 1 ? "s" : ""} d'urgence`
                : "Aucun contact d'urgence enregistré"}
              {smsHref && (
                <a href={smsHref} className="block text-[13px] text-lagoon underline">Rouvrir le SMS</a>
              )}
            </span>
            <Link href="/contacts" className="text-[13px] text-lagoon underline shrink-0">
              {contactsCount > 0 ? "Gérer" : "Ajouter"}
            </Link>
          </li>
          {mapsLink && (
            <li className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-3 text-[14.5px]">
              <span className="w-2.5 h-2.5 rounded-full bg-ok" />
              <span className="flex-1">
                Ta position est prête à envoyer
                <a href={mapsLink} target="_blank" rel="noopener noreferrer" className="block text-[13px] text-lagoon underline">
                  Voir ma position
                </a>
              </span>
              {canShare && (
                <button type="button" onClick={sharePosition} className="min-h-[44px] text-[13px] text-lagoon underline shrink-0">
                  Envoyer à quelqu&apos;un
                </button>
              )}
            </li>
          )}
        </ul>

        <p className="mt-5 text-center text-[13px] text-mist-dim leading-relaxed">
          Vigie NC ne prévient pas les secours à ta place : appelle-les. Ta position n&apos;est jamais publiée sur la
          carte : elle ne va qu&apos;aux personnes à qui tu envoies le message.
        </p>
      </section>
    </main>
  );
}
