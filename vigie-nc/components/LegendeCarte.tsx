"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { couleurSur } from "@/lib/contraste";
import { LEGENDE, SOS_EXPLICATION, texteDerniereMiseAJour, texteTypesCategorie, TYPE_EXEMPLE } from "@/lib/legende";
import { RELIABILITY_HEX, RELIABILITY_LEVELS } from "@/lib/reliability";
import { Category, CATEGORY_HEX, CATEGORY_LABELS, REPORT_TYPE_ICON } from "@/lib/types";
import { PIN_ZONE_SVG } from "./LiveMap";
import { RoundButton } from "./MapControls";
import { PrimaryButton } from "./ui";

const CATEGORIES: Category[] = ["danger", "perturbation", "meteo"];

/** Bouton « ? » de la carte : ouvre la légende. */
export function BoutonLegende({ ouverte, onClick }: { ouverte: boolean; onClick: () => void }) {
  return (
    <RoundButton active={ouverte} label="Légende de la carte, SOS et ta position" onClick={onClick} expanded={ouverte}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M9.4 9.3a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.4-2.6 4" />
        <circle cx="12" cy="17.6" r="0.6" fill="currentColor" />
      </svg>
    </RoundButton>
  );
}

/** Le cercle en pointillés de la zone, en petit (même couleurs que LiveMap). */
function IconeCercle({ taille = 30 }: { taille?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={taille} height={taille} aria-hidden="true" className="shrink-0">
      <circle cx="16" cy="16" r="13.5" fill="rgba(34,184,176,0.12)" stroke="#1C9890" strokeWidth="2" strokeDasharray="4 4" />
      <circle cx="16" cy="16" r="4" fill="#3B82F6" stroke="#EAF6F4" strokeWidth="2" />
    </svg>
  );
}

/** Le bouton SOS de la carte, en petit. */
function PastilleSos({ taille = 30 }: { taille?: number }) {
  return (
    <span
      aria-hidden="true"
      className="shrink-0 rounded-full flex items-center justify-center font-display font-bold text-white border-2 border-void"
      style={{
        width: taille,
        height: taille,
        fontSize: Math.round(taille * 0.32),
        background: "radial-gradient(circle at 35% 30%, #F26A6E, #D3343A)",
      }}
    >
      SOS
    </span>
  );
}

/** Repère de la carte (mêmes classes que LiveMap : vigie-marker, ring, core). */
function Repere({
  categorie,
  recent = false,
  pale = false,
  ancien = false,
}: {
  categorie: Category;
  recent?: boolean;
  pale?: boolean;
  ancien?: boolean;
}) {
  const color = CATEGORY_HEX[categorie];
  return (
    <span aria-hidden="true" className={`vigie-marker block ${pale ? "is-faint" : ""} ${ancien ? "is-ancien" : ""}`}>
      {recent && <span className="ring" style={{ background: `${color}22`, border: `1px solid ${color}` }} />}
      <span className="core" style={{ background: color, color: couleurSur(color) }}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          // Chaînes statiques de lib/types.ts (aucune donnée saisie).
          dangerouslySetInnerHTML={{ __html: REPORT_TYPE_ICON[TYPE_EXEMPLE[categorie]] }}
        />
      </span>
    </span>
  );
}

function Ligne({ visuel, large = false, children }: { visuel: ReactNode; large?: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className={`${large ? "min-w-[2.5rem]" : "w-10"} min-h-[30px] shrink-0 flex items-center justify-center`}>{visuel}</span>
      <span className="flex-1 min-w-0 pt-1 text-[14px] text-mist-dim leading-relaxed">{children}</span>
    </li>
  );
}

function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="font-display font-semibold text-[15px] text-mist">{titre}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/**
 * Légende de la carte : ce que veulent dire la zone (NC, 1 / 3 / 5 km et
 * le cercle), les couleurs, les repères, la fiabilité, le bouton SOS, ce
 * que devient ta position et l'heure de la dernière mise à jour. Textes
 * dans lib/legende.ts. Feuille du bas sur téléphone, fenêtre centrée dès
 * 768 px (comme la fiche d'un signalement).
 */
export function LegendeCarte({
  onFermer,
  updatedAt,
  demo = false,
}: {
  onFermer: () => void;
  updatedAt: Date | null;
  /** Démonstration Mont-Dore : la vue d'ensemble est la commune. */
  demo?: boolean;
}) {
  const fermerRef = useRef<HTMLButtonElement>(null);
  // Le clavier arrive sur « Fermer » ; Échap ferme.
  useEffect(() => {
    fermerRef.current?.focus();
    const touche = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFermer();
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [onFermer]);

  return (
    <div
      className="fixed inset-0 z-[40] flex items-end justify-center bg-void/60 md:items-center md:p-6"
      onClick={onFermer}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="legende-titre"
        className="w-full max-w-md rounded-t-[22px] bg-panel border-t border-line px-4 pt-3 max-h-[88dvh] overflow-y-auto md:rounded-[22px] md:border md:max-h-[90dvh] lg:shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)]"
        style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-9 h-1 rounded-full bg-white/15 mx-auto mb-3 md:hidden" />
        <div className="flex items-start gap-3">
          <h2 id="legende-titre" className="flex-1 font-display font-semibold text-[18px] leading-tight pt-2">
            {LEGENDE.titre}
          </h2>
          <button
            ref={fermerRef}
            type="button"
            onClick={onFermer}
            aria-label="Fermer la légende"
            className="-mt-1 -mr-1 w-11 h-11 flex items-center justify-center text-mist-dim text-xl"
          >
            ✕
          </button>
        </div>

        <Section titre={LEGENDE.zone.titre}>
          <ul className="flex flex-col gap-2.5">
            <Ligne
              large={demo}
              visuel={
                <span className="rounded-full bg-void border border-line px-2 py-1 font-display font-bold text-[12px] tracking-wide text-mist">
                  {demo ? "Mont-Dore" : "NC"}
                </span>
              }
            >
              {demo ? LEGENDE.zone.ncDemo : LEGENDE.zone.nc}
            </Ligne>
            <Ligne visuel={<IconeCercle />}>{LEGENDE.zone.rayon}</Ligne>
          </ul>
          <p className="mt-2 text-[13px] text-mist-dim opacity-80 leading-relaxed">{LEGENDE.zone.sansPosition}</p>
        </Section>

        <Section titre={LEGENDE.couleurs.titre}>
          <ul className="flex flex-col gap-2.5">
            {CATEGORIES.map((c) => (
              <Ligne key={c} visuel={<Repere categorie={c} />}>
                <b className="font-semibold" style={{ color: CATEGORY_HEX[c] }}>
                  {CATEGORY_LABELS[c].one}
                </b>{" "}
                : {texteTypesCategorie(c)}.
              </Ligne>
            ))}
          </ul>
        </Section>

        <Section titre={LEGENDE.reperes.titre}>
          <ul className="flex flex-col gap-2.5">
            <Ligne visuel={<Repere categorie="danger" recent />}>{LEGENDE.reperes.recent}</Ligne>
            <Ligne visuel={<Repere categorie="perturbation" pale />}>{LEGENDE.reperes.pale}</Ligne>
            <Ligne visuel={<Repere categorie="danger" ancien />}>{LEGENDE.reperes.ancien}</Ligne>
            <Ligne
              visuel={
                <span
                  aria-hidden="true"
                  className="vigie-cluster"
                  style={{
                    width: 30,
                    height: 30,
                    fontSize: 13,
                    background: CATEGORY_HEX.danger,
                    color: couleurSur(CATEGORY_HEX.danger),
                  }}
                >
                  3
                </span>
              }
            >
              {LEGENDE.reperes.pastille}
            </Ligne>
            <Ligne visuel={<span aria-hidden="true" className="user-dot block" />}>{LEGENDE.reperes.toi}</Ligne>
            <Ligne
              visuel={
                <span
                  aria-hidden="true"
                  className="block [&_svg]:block [&_svg]:w-[22px] [&_svg]:h-[28px]"
                  dangerouslySetInnerHTML={{ __html: PIN_ZONE_SVG }}
                />
              }
            >
              {LEGENDE.reperes.maZone}
            </Ligne>
          </ul>
        </Section>

        <Section titre={LEGENDE.fiabilite.titre}>
          <ul className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-[14px]">
            {[
              { label: "Relayé", couleur: RELIABILITY_HEX.signalement, regle: LEGENDE.fiabilite.relaye },
              ...RELIABILITY_LEVELS.map((n) => ({ label: n.label, couleur: RELIABILITY_HEX[n.level], regle: n.rule })),
              // Gris neutre (mist-dim) : ni danger ni « tout va bien ».
              { label: "Ancien", couleur: "#93B0AD", regle: LEGENDE.fiabilite.ancien },
              { label: "Terminé", couleur: "#93B0AD", regle: LEGENDE.fiabilite.termine },
            ].map((n) => (
              <li key={n.label} className="contents">
                <span
                  className="justify-self-start inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[13px] font-medium"
                  style={{ color: n.couleur, borderColor: `${n.couleur}66`, background: `${n.couleur}1A` }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: n.couleur }} />
                  {n.label}
                </span>
                <span className="text-mist-dim">{n.regle}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section titre={LEGENDE.confiance.titre}>
          <ul className="flex flex-col gap-1.5 text-[14px] leading-relaxed text-mist-dim list-disc pl-5 marker:text-lagoon">
            {LEGENDE.confiance.lignes.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Section>

        <Section titre={LEGENDE.sos.titre}>
          <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-3">
            <PastilleSos taille={36} />
            <div className="flex-1 min-w-0 text-[14px] leading-relaxed text-mist">
              <p className="font-medium">{LEGENDE.sos.ouvre}</p>
              <dl className="mt-1.5 flex flex-col gap-1.5">
                {SOS_EXPLICATION.map((q) => (
                  <div key={q.titre}>
                    <dt className="font-semibold">{q.titre}</dt>
                    <dd className="text-mist-dim">{q.texte}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </Section>

        <Section titre={LEGENDE.position.titre}>
          <div className="flex flex-col gap-1.5 text-[14px] leading-relaxed text-mist-dim">
            {LEGENDE.position.lignes.map((l, i) => (
              <p key={l} className={i === 0 ? "text-mist" : ""}>
                {l}
              </p>
            ))}
          </div>
          <Link
            href="/confidentialite"
            className="mt-1 inline-flex min-h-[44px] items-center text-[14px] font-medium text-lagoon underline underline-offset-2"
          >
            {LEGENDE.position.lien}
          </Link>
        </Section>

        <Section titre={LEGENDE.miseAJour.titre}>
          <div className="flex flex-col gap-1.5 text-[14px] leading-relaxed text-mist-dim">
            <p className="flex items-center gap-2 text-mist">
              <span className="w-2 h-2 rounded-full bg-lagoon animate-blink shrink-0" aria-hidden="true" />
              {LEGENDE.miseAJour.direct}
            </p>
            <p>{texteDerniereMiseAJour(updatedAt)}</p>
            <p>{LEGENDE.miseAJour.prudence}</p>
          </div>
        </Section>

        <PrimaryButton className="mt-6" onClick={onFermer}>
          {LEGENDE.astuce.compris}
        </PrimaryButton>
      </div>
    </div>
  );
}

/**
 * Astuce montrée une fois (lib/legende.ts) : ce que veut dire le cercle et
 * ce que fait le SOS, avec un lien vers la légende. « carte » : à côté du
 * bouton SOS, sur ordinateur seulement (dès 960 px) ; « liste » : dans le
 * panneau du bas, sur téléphone et tablette, où la carte est trop petite
 * pour être recouverte.
 */
export function AstuceCarte({
  variante,
  onLegende,
  onFermer,
}: {
  variante: "carte" | "liste";
  onLegende: () => void;
  onFermer: () => void;
}) {
  return (
    <section
      aria-label="Astuce pour lire la carte"
      className={
        variante === "carte"
          ? "hidden lg:block absolute left-[4.5rem] right-3 bottom-7 z-[11] max-w-[380px] rounded-2xl border border-line bg-panel/95 backdrop-blur px-3 pt-2.5 pb-2 shadow-[0_16px_36px_-14px_rgba(0,0,0,0.9)] animate-pop-in"
          : "lg:hidden mt-2.5 rounded-xl border border-lagoon/30 bg-lagoon/10 px-3 pt-2.5 pb-1.5"
      }
    >
      <ul className="flex flex-col gap-1.5 text-[13.5px] leading-snug text-mist">
        <li className="flex items-start gap-2">
          <IconeCercle taille={22} />
          <span className="flex-1 min-w-0">{LEGENDE.astuce.cercle}</span>
        </li>
        <li className="flex items-start gap-2">
          <PastilleSos taille={22} />
          <span className="flex-1 min-w-0">{LEGENDE.astuce.sos}</span>
        </li>
      </ul>
      <div className="mt-1.5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onLegende}
          className="min-h-[44px] rounded-xl border border-line bg-panel-2 px-3 text-[14px] font-medium text-mist"
        >
          {LEGENDE.astuce.legende}
        </button>
        <button
          type="button"
          onClick={onFermer}
          className="min-h-[44px] rounded-xl bg-primary px-4 text-[14px] font-semibold text-white active:bg-primary-strong"
        >
          {LEGENDE.astuce.compris}
        </button>
      </div>
    </section>
  );
}
