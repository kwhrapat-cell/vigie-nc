"use client";

import Link from "next/link";
import { Cagou } from "./Cagou";

// Écran affiché quand l'appli plante (app/error.tsx, app/global-error.tsx)
// ou qu'une page n'existe pas (app/not-found.tsx). Les numéros d'urgence
// restent toujours à portée de doigt : c'est une appli de sécurité.

const URGENCES = [
  { numero: "15", nom: "SAMU" },
  { numero: "17", nom: "Police" },
  { numero: "18", nom: "Pompiers" },
];

export function EcranErreur({
  titre = "Oups, l'appli a eu un souci",
  texte = "Ce n'est pas de ta faute. Le problème nous est signalé, sans ton nom ni ta position.",
  onReessayer,
}: {
  titre?: string;
  texte?: string;
  onReessayer?: () => void;
}) {
  return (
    <main className="min-h-[100dvh] flex flex-col px-5 pt-14 pb-8 bg-void text-mist">
      <div className="flex-1 flex flex-col items-center text-center">
        <Cagou size={104} />
        <h1 className="mt-5 font-display font-bold text-[24px] leading-tight">{titre}</h1>
        <p className="mt-2 text-[15px] text-mist-dim leading-relaxed max-w-[320px]">{texte}</p>

        <div className="mt-6 w-full flex flex-col gap-2.5">
          {onReessayer && (
            <button
              type="button"
              onClick={onReessayer}
              className="w-full rounded-xl bg-primary py-3.5 font-display font-semibold text-[15.5px] text-white"
            >
              Réessayer
            </button>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full rounded-xl border border-line bg-panel-2 py-3.5 font-display font-semibold text-[15px] text-mist"
          >
            Recharger la page
          </button>
          <Link href="/" className="min-h-[44px] flex items-center justify-center text-[15px] text-lagoon underline">
            Retour à la carte
          </Link>
        </div>
      </div>

      <section aria-label="Numéros d'urgence" className="mt-6 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3">
        <p className="text-[14px] font-semibold">Une urgence ? Vigie NC ne prévient pas les secours :</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {URGENCES.map((u) => (
            <a
              key={u.numero}
              href={`tel:${u.numero}`}
              className="min-h-[56px] rounded-xl bg-danger flex flex-col items-center justify-center text-white"
            >
              <span className="font-display font-bold text-[20px] leading-none">{u.numero}</span>
              <span className="text-[12px] mt-0.5">{u.nom}</span>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
