"use client";

import { useEffect, useState } from "react";
import { Cagou } from "./Cagou";
import { BADGES, Impact, lireImpact } from "@/lib/impact";

// Carte « Mon impact » du Profil : ce que ce téléphone a apporté, et les
// badges. Tout vient du téléphone (lib/impact.ts) : pas de nom, pas de
// classement entre utilisateurs.

export function MonImpact() {
  const [impact, setImpact] = useState<Impact | null>(null);

  useEffect(() => {
    setImpact(lireImpact());
  }, []);

  if (!impact) return null;
  const obtenus = BADGES.filter((b) => b.obtenu(impact));
  const chiffres = [
    { n: impact.nbSignalements, texte: impact.nbSignalements > 1 ? "signalements" : "signalement" },
    {
      n: impact.nbConfirmationsRecues,
      texte: impact.nbConfirmationsRecues > 1 ? "confirmations reçues" : "confirmation reçue",
    },
    { n: impact.nbVotes, texte: impact.nbVotes > 1 ? "réponses données" : "réponse donnée" },
    { n: impact.nbRoutesRouvertes, texte: impact.nbRoutesRouvertes > 1 ? "routes rouvertes" : "route rouverte" },
  ];

  return (
    <section className="mx-4 mb-3 rounded-xl border border-lagoon/40 bg-panel px-4 py-3.5">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="font-display font-semibold text-[16px]">Mon impact</h2>
          <p className="text-[13.5px] text-mist-dim">
            {impact.nbSignalements === 0 && impact.nbVotes === 0
              ? "Signale ce que tu vois ou confirme ce qui est sur la carte : chaque info aide la route."
              : `${obtenus.length} badge${obtenus.length > 1 ? "s" : ""} sur ${BADGES.length}. Merci pour la route !`}
          </p>
        </div>
        <Cagou size={56} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {chiffres.map((c) => (
          <div key={c.texte} className="rounded-lg bg-void/40 border border-line px-3 py-2">
            <span className="block font-display font-bold text-[22px] leading-none text-lagoon">{c.n}</span>
            <span className="block mt-1 text-[13px] text-mist-dim">{c.texte}</span>
          </div>
        ))}
      </div>

      <h3 className="mt-4 mb-2 text-[14px] font-semibold">Badges</h3>
      <ul className="grid grid-cols-2 gap-2">
        {BADGES.map((b) => {
          const ok = b.obtenu(impact);
          return (
            <li
              key={b.id}
              className={`rounded-lg border px-2.5 py-2 ${ok ? "border-lagoon/50 bg-lagoon/10" : "border-line bg-void/30"}`}
            >
              <span className={`block text-[22px] leading-none ${ok ? "" : "grayscale opacity-40"}`} aria-hidden="true">
                {b.emoji}
              </span>
              <span className={`block mt-1 text-[14px] font-semibold ${ok ? "text-mist" : "text-mist-dim"}`}>
                {b.nom}
                <span className="sr-only">{ok ? " : obtenu" : " : pas encore"}</span>
              </span>
              {!ok && <span className="block text-[12px] leading-snug text-mist-dim">{b.comment}</span>}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-[12px] text-mist-dim">
        Tout reste sur ton téléphone : pas de nom, pas de classement. Juste pour toi.
      </p>
    </section>
  );
}
