"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScreenHeader } from "@/components/ui";
import { getEmergencyContacts } from "@/lib/emergency-contacts";
import { SOS_EXPLICATION } from "@/lib/legende";
import { lienPosition, lienSms, messageSos } from "@/lib/sos";
import { useGeolocation } from "@/lib/useGeolocation";

const HOLD_MS = 3000;
const RING_R = 92;
const RING_LEN = 2 * Math.PI * RING_R;

type Phase = "idle" | "holding" | "sending" | "done" | "error";


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
  const [numeros, setNumeros] = useState<string[]>([]);
  const [mapsLink, setMapsLink] = useState<string | null>(null);
  const [smsHref, setSmsHref] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const startRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const contacts = getEmergencyContacts();
    setContactsCount(contacts.length);
    setNumeros(contacts.map((c) => c.phone));
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const trigger = useCallback(async () => {
    setPhase("sending");
    try {
      const pos = await locate();
      const link = lienPosition(pos.lat, pos.lng);
      setMapsLink(link);

      const href = lienSms(
        getEmergencyContacts().map((c) => c.phone),
        messageSos(link),
      );
      if (href) {
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
      await navigator.share({ title: "SOS", text: messageSos(mapsLink) });
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

        {/* Ce que fait le bouton, dit AVANT de l'utiliser (détails plus bas) */}
        {phase === "idle" || phase === "holding" ? (
          <p className="mt-3 max-w-[320px] text-center text-[14px] leading-relaxed text-mist-dim">
            Prépare un SMS avec ta position pour tes contacts d&apos;urgence. Ne prévient pas les secours : pour
            eux, appelle ci-dessous.
          </p>
        ) : null}

        {phase === "error" && (
          <div className="mt-4 w-full text-center" role="alert">
            <p className="text-[14.5px] text-danger">
              {geoError ?? "Impossible d'obtenir ta position."} Appelle directement les secours ci-dessous.
            </p>
            {/* Sans position, les contacts peuvent quand même être prévenus */}
            {lienSms(numeros, messageSos(null)) && (
              <a
                href={lienSms(numeros, messageSos(null)) ?? undefined}
                className="mt-2 inline-flex min-h-[44px] items-center rounded-xl border border-danger/40 bg-danger/10 px-4 text-[14.5px] font-semibold text-mist"
              >
                Prévenir mes contacts sans position
              </a>
            )}
            <p className="mt-1.5 text-[13px] text-mist-dim">Tu peux aussi réessayer : garde le doigt 3 secondes.</p>
          </div>
        )}

        {phase === "done" && (
          <p className="mt-4 max-w-[340px] text-center text-[14px] leading-relaxed text-mist" role="status">
            {smsHref
              ? "Le SMS est prêt : vérifie qu'il est bien parti. S'il ne s'est pas ouvert, rouvre-le ci-dessous. Pas de réponse ? Appelle les secours."
              : "Aucun SMS préparé : tu n'as pas de contact d'urgence. Envoie ta position à quelqu'un ci-dessous, ou appelle les secours."}
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

        {/* Le parcours complet, sans ambiguïté (mêmes textes que la légende de la carte) */}
        <section aria-labelledby="sos-comment" className="mt-5 w-full rounded-xl border border-line bg-panel px-3 py-3">
          <h2 id="sos-comment" className="font-display font-semibold text-[15px]">
            Comment marche le SOS
          </h2>
          <dl className="mt-2 flex flex-col gap-2.5 text-[14px] leading-relaxed">
            {SOS_EXPLICATION.map((q) => (
              <div key={q.titre}>
                <dt className="font-semibold text-mist">{q.titre}</dt>
                <dd className="text-mist-dim">{q.texte}</dd>
              </div>
            ))}
          </dl>
        </section>
      </section>
    </main>
  );
}
