"use client";

import { useEffect, useState } from "react";
import {
  ENVOI_AUTO_MAX_MIN,
  EN_ATTENTE_ENVOYE_EVENT,
  EN_ATTENTE_EVENT,
  etatEnAttente,
  heureVu,
  lireEnAttente,
  majEnAttente,
  retirerEnAttente,
  SignalementEnAttente,
} from "@/lib/en-attente";
import { REPORT_TYPE_LABELS } from "@/lib/types";
import { TypeTile } from "./ui";

// Relecture : l'état change avec le temps (au bout de 15 min, on demande).
const RELECTURE_MS = 30_000;
const PARTI_MS = 10_000;

/**
 * Accueil, dans la liste : les signalements faits sans réseau, encore sur
 * le téléphone (lib/en-attente.ts). « Parti » quand l'un d'eux arrive sur
 * la carte. Rien si la file est vide.
 */
export function EnAttenteCarte() {
  const [file, setFile] = useState<SignalementEnAttente[]>([]);
  const [maintenant, setMaintenant] = useState(0);
  const [parti, setParti] = useState<SignalementEnAttente | null>(null);

  useEffect(() => {
    const relire = () => {
      setFile(lireEnAttente());
      setMaintenant(Date.now());
    };
    const surEnvoi = (e: Event) => {
      const detail = (e as CustomEvent<SignalementEnAttente>).detail;
      if (detail) setParti(detail);
    };
    relire();
    const minuteur = window.setInterval(relire, RELECTURE_MS);
    window.addEventListener(EN_ATTENTE_EVENT, relire);
    window.addEventListener(EN_ATTENTE_ENVOYE_EVENT, surEnvoi);
    return () => {
      window.clearInterval(minuteur);
      window.removeEventListener(EN_ATTENTE_EVENT, relire);
      window.removeEventListener(EN_ATTENTE_ENVOYE_EVENT, surEnvoi);
    };
  }, []);

  useEffect(() => {
    if (!parti) return;
    const t = window.setTimeout(() => setParti(null), PARTI_MS);
    return () => window.clearTimeout(t);
  }, [parti]);

  if (file.length === 0 && !parti) return null;

  return (
    <div className="mt-2.5 flex flex-col gap-2" aria-live="polite">
      {parti && (
        <p className="rounded-xl border border-lagoon/40 bg-lagoon/10 px-3 py-2 text-[14px] text-mist" role="status">
          <b className="font-semibold text-lagoon">Parti :</b> ton signalement « {REPORT_TYPE_LABELS[parti.type]} » de{" "}
          {heureVu(parti)} est sur la carte.
        </p>
      )}
      {file.map((s) => {
        const etat = etatEnAttente(s, maintenant || Date.now());
        const aConfirmer = etat === "a_confirmer";
        const refuse = etat === "refuse";
        return (
          <div
            key={s.id}
            className={`rounded-xl border px-3 py-2.5 ${
              aConfirmer ? "border-warn/40 bg-warn/10" : refuse ? "border-danger/40 bg-danger/10" : "border-line bg-void/40"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <TypeTile type={s.type} size={30} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-semibold">
                  {REPORT_TYPE_LABELS[s.type]} <span className="font-normal text-mist-dim">· vu à {heureVu(s)}</span>
                </p>
                <p className="text-[13px] text-mist-dim">
                  {refuse
                    ? s.erreur
                    : aConfirmer
                      ? `Pas parti dans les ${ENVOI_AUTO_MAX_MIN} minutes. Publie-le seulement si tu sais que c'est encore là.`
                      : "Gardé sur ton téléphone : il partira tout seul dès que ça capte."}
                </p>
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap justify-end gap-2">
              {aConfirmer && (
                <button
                  type="button"
                  onClick={() => majEnAttente(s.id, { vuA: Date.now(), essais: 0 })}
                  className="min-h-[44px] rounded-lg bg-primary px-3 text-[14px] font-medium text-white"
                >
                  C&apos;est encore là, publier
                </button>
              )}
              <button
                type="button"
                onClick={() => retirerEnAttente(s.id)}
                className="min-h-[44px] rounded-lg border border-line px-3 text-[14px] font-medium text-mist-dim"
              >
                Effacer
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
