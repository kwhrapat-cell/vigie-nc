"use client";

import { useEffect, useState } from "react";
import { avatarSvg } from "@/lib/avatar";
import { BADGES, Impact, lireImpact } from "@/lib/impact";
import { badgesManquants, ecrireCagouSurCarte, lireCagouSurCarte, NIVEAUX, rangActuel } from "@/lib/niveaux";

// Carte « Mon impact » du Profil : ce que ce téléphone a apporté, et les
// badges. Tout vient du téléphone (lib/impact.ts) : pas de nom, pas de
// classement entre utilisateurs.

export function MonImpact() {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [cagouCarte, setCagouCarte] = useState(true);

  useEffect(() => {
    setImpact(lireImpact());
    setCagouCarte(lireCagouSurCarte());
  }, []);

  if (!impact) return null;
  const obtenus = BADGES.filter((b) => b.obtenu(impact));
  // Niveau du cagou (lib/niveaux.ts) : il monte avec les badges, jamais ne redescend.
  const rang = rangActuel(obtenus.length);
  const niveau = NIVEAUX[rang];
  const suivant = NIVEAUX[rang + 1];
  const manque = badgesManquants(rang, obtenus.length);
  const progression = suivant
    ? Math.min(1, (obtenus.length - niveau.badgesMin) / Math.max(1, suivant.badgesMin - niveau.badgesMin))
    : 1;
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
        <span
          className="shrink-0"
          // Dessin fixe de lib/avatar.ts (aucune donnée saisie).
          dangerouslySetInnerHTML={{ __html: avatarSvg(rang, 56) }}
        />
      </div>

      {/* Mon cagou : niveau, progression, et le choix de l'afficher sur la carte */}
      <div className="mt-3 rounded-lg bg-void/40 border border-line px-3 py-3">
        <p className="font-display font-semibold text-[16px]">
          Mon cagou : <span className={rang >= 3 ? "text-ochre" : "text-lagoon"}>{niveau.nom}</span>
        </p>
        <p className="text-[13.5px] text-mist-dim">
          {suivant && manque != null
            ? `Encore ${manque} badge${manque > 1 ? "s" : ""} pour devenir ${suivant.nom}.`
            : "Tu es une Légende de la route. Merci !"}
        </p>
        <div
          className="mt-2 h-2 rounded-full bg-line overflow-hidden"
          role="progressbar"
          aria-label={suivant ? `Vers le niveau ${suivant.nom}` : "Niveau maximum"}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progression * 100)}
        >
          <div
            className={`h-full rounded-full ${rang >= 3 ? "bg-ochre" : "bg-lagoon"}`}
            style={{ width: `${Math.round(progression * 100)}%` }}
          />
        </div>

        <ol className="mt-3 -mx-2 grid grid-cols-5" aria-label="Les niveaux du cagou">
          {NIVEAUX.map((n, i) => (
            <li key={n.id} className={`flex flex-col items-center ${i > rang ? "opacity-35 grayscale" : ""}`}>
              <span
                aria-hidden="true"
                // Dessin fixe de lib/avatar.ts (aucune donnée saisie).
                dangerouslySetInnerHTML={{ __html: avatarSvg(i, 40) }}
              />
              <span
                className={`mt-0.5 whitespace-nowrap text-[12px] tracking-[-0.01em] ${
                  i === rang ? (rang >= 3 ? "text-ochre" : "text-lagoon") : "text-mist-dim"
                }`}
              >
                {n.nom}
                <span className="sr-only">
                  {i < rang ? " : atteint" : i === rang ? " : ton niveau" : ` : ${n.badgesMin} badges`}
                </span>
              </span>
            </li>
          ))}
        </ol>

        <button
          type="button"
          role="switch"
          aria-checked={cagouCarte}
          onClick={() => {
            setCagouCarte(!cagouCarte);
            ecrireCagouSurCarte(!cagouCarte);
          }}
          className="mt-3 w-full min-h-[44px] flex items-center justify-between gap-3 text-left"
        >
          <span className="text-[14.5px]">
            Mon cagou sur la carte
            <span className="block text-[12.5px] text-mist-dim">
              {cagouCarte ? "Il marque ta position." : "Point bleu simple à la place."}
            </span>
          </span>
          <span
            className={`relative shrink-0 w-12 h-7 rounded-full border transition-colors ${
              cagouCarte ? "bg-primary border-primary" : "bg-panel-2 border-line"
            }`}
            aria-hidden="true"
          >
            <span
              className={`absolute top-[3px] w-5 h-5 rounded-full bg-mist transition-all ${cagouCarte ? "left-[23px]" : "left-[3px]"}`}
            />
          </span>
        </button>
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
        Tout reste sur ton téléphone : pas de nom, pas de classement. Ton cagou, toi seul le vois.
      </p>
    </section>
  );
}
