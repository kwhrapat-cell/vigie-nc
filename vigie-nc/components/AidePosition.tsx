"use client";

import { useEffect, useRef } from "react";
import { PIN_ZONE_SVG } from "./LiveMap";
import type { WatchStatus } from "@/lib/useWatchPosition";

/**
 * Position refusée ou introuvable (souvent sur un ordinateur : Windows ou le
 * navigateur bloque la localisation, ou pas de Wi-Fi pour se repérer) :
 * explique comment l'autoriser et propose « Choisir ma zone sur la carte ».
 * S'ouvre depuis « Activer ma position » ou un rayon (1 / 3 / 5 km) touché
 * sans position ; se ferme toute seule dès que la position arrive.
 */
export function AidePosition({
  geoStatus,
  ordi,
  onChoisir,
  onReessayer,
  onFermer,
}: {
  geoStatus: WatchStatus;
  /** Ordinateur à souris (lib/preferences estOrdiSouris) : consignes Windows / Mac. */
  ordi: boolean;
  onChoisir: () => void;
  onReessayer: () => void;
  onFermer: () => void;
}) {
  const boutonRef = useRef<HTMLButtonElement>(null);
  // Le clavier arrive sur le bouton principal ; Échap ferme.
  useEffect(() => {
    boutonRef.current?.focus();
    const touche = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFermer();
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [onFermer]);

  const titre =
    geoStatus === "denied"
      ? "Position bloquée"
      : geoStatus === "unavailable"
        ? "Position introuvable"
        : geoStatus === "unsupported"
          ? "Pas de position sur cet appareil"
          : "Recherche de ta position…";

  const texte =
    geoStatus === "denied"
      ? ordi
        ? "Le navigateur ou l'ordinateur bloque la localisation de Vigie NC."
        : "Le navigateur ou le téléphone bloque la localisation de Vigie NC."
      : geoStatus === "unavailable"
        ? ordi
          ? "Un ordinateur n'a pas de GPS : il se repère grâce aux réseaux Wi-Fi autour de lui. Vérifie que le Wi-Fi est allumé."
          : "Vérifie que la localisation du téléphone est activée."
        : geoStatus === "unsupported"
          ? "Cet appareil ne donne pas sa position."
          : "Si rien ne vient, tu peux choisir ta zone sur la carte.";

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="aide-position-titre"
      className="absolute inset-x-3 top-14 z-20 mx-auto max-w-[440px] max-h-[calc(100dvh_-_9rem)] overflow-y-auto rounded-2xl border border-line bg-panel/95 backdrop-blur p-4 shadow-[0_16px_36px_-14px_rgba(0,0,0,0.9)]"
    >
      <div className="flex items-start gap-2">
        <h2 id="aide-position-titre" className="flex-1 font-display font-semibold text-[16px] leading-snug pt-2">
          {titre}
        </h2>
        <button
          type="button"
          onClick={onFermer}
          aria-label="Fermer"
          className="-mr-2 -mt-1 w-11 h-11 shrink-0 flex items-center justify-center text-mist-dim"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <p className="mt-1 text-[14px] text-mist-dim leading-relaxed">{texte}</p>

      {(geoStatus === "denied" || geoStatus === "unavailable") && (
        <div className="mt-3">
          <h3 className="text-[14px] font-medium text-mist">Pour autoriser la position :</h3>
          <ol className="mt-1.5 flex flex-col gap-1.5 list-decimal pl-5 text-[14px] text-mist-dim leading-relaxed marker:text-lagoon">
            {ordi ? (
              <>
                <li>
                  <b className="text-mist font-medium">Navigateur</b> : clique sur l&apos;icône à gauche de l&apos;adresse
                  du site, puis Localisation → Autoriser.
                </li>
                <li>
                  <b className="text-mist font-medium">Windows</b> : Paramètres → Confidentialité et sécurité →
                  Localisation. Active « Services de localisation » et « Autoriser les applications de bureau à
                  accéder à votre localisation ».
                </li>
                <li>
                  <b className="text-mist font-medium">Mac</b> : Réglages Système → Confidentialité et sécurité →
                  Service de localisation, puis coche ton navigateur.
                </li>
              </>
            ) : (
              <>
                <li>Active la localisation du téléphone (menu du haut de l&apos;écran).</li>
                <li>
                  Dans le navigateur : touche l&apos;icône à gauche de l&apos;adresse du site, puis Autorisations →
                  Position → Autoriser.
                </li>
              </>
            )}
            <li>Recharge ensuite la page.</li>
          </ol>
          {ordi && (
            <p className="mt-2 text-[12.5px] text-mist-dim opacity-80">
              Sur un ordinateur de travail, ces réglages sont parfois bloqués par le service informatique.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          ref={boutonRef}
          type="button"
          onClick={onChoisir}
          className="flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-primary px-3 font-display font-semibold text-[15px] text-white active:bg-primary-strong"
        >
          <span
            className="w-[17px] h-[22px] shrink-0 [&_svg]:w-full [&_svg]:h-full"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: PIN_ZONE_SVG }}
          />
          Choisir ma zone sur la carte
        </button>
        {geoStatus !== "unsupported" && geoStatus !== "pending" && (
          <button
            type="button"
            onClick={onReessayer}
            className="min-h-[44px] rounded-xl border border-line bg-panel-2 px-4 font-display font-semibold text-[15px] text-mist"
          >
            Réessayer
          </button>
        )}
      </div>
    </section>
  );
}
