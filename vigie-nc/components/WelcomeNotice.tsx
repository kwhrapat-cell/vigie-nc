"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type TouchEvent } from "react";
import { couleurSur } from "@/lib/contraste";
import { RELIABILITY_HEX } from "@/lib/reliability";
import { NOM_APPLI, PHRASES, URGENCES } from "@/lib/territoire";
import {
  cartePrecedente,
  carteSuivante,
  directionGlisse,
  ecrireAstuceSignaler,
  TUTO_CARTES,
  TUTO_DERNIERE,
  type TutoCarte,
} from "@/lib/tuto";
import { REPORT_TYPE_HEX, REPORT_TYPE_ICON, REPORT_TYPE_LABELS, type ReportType } from "@/lib/types";
import { Logo, PrimaryButton, TypeIcon, TypeTile } from "./ui";
import { Cagou } from "./Cagou";

// Changer la version si le texte change de façon importante : l'écran
// sera montré à nouveau à tout le monde.
const STORAGE_KEY = "vigie-nc:avertissement-v1";

function alreadySeen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // stockage indisponible : l'écran reviendra à la prochaine visite
  }
}

// Les trois règles, une ligne chacune (dernière carte). Dans les textes de
// la démo, « \u00a0 » = espace insécable (les guillemets et les « : » ne
// partent pas seuls à la ligne).
const REGLES = [
  { texte: "Info des usagers : elle peut se tromper, vérifie sur place.", urgent: false },
  { texte: "Au volant, pas de téléphone en main : le mode conduite parle pour toi.", urgent: false },
  {
    texte: `Urgence : ${NOM_APPLI} ne prévient pas les secours, appelle le ${URGENCES.samu}, le ${URGENCES.police} ou le ${URGENCES.pompiers}.`,
    urgent: true,
  },
];

/**
 * Accueil montré une seule fois : une démo des gestes de base en 3 cartes
 * animées (voir, signaler, confirmer), puis les règles et les conditions.
 * En le fermant, l'astuce « Touche ici pour signaler » s'affiche sur le « + ».
 */
export function WelcomeNotice() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!alreadySeen()) setOpen(true);
  }, []);

  if (!open) return null;

  return (
    <Tutoriel
      mode="accueil"
      onFermer={() => {
        markSeen();
        ecrireAstuceSignaler("a-montrer");
        setOpen(false);
      }}
    />
  );
}

/**
 * La démo elle-même. « accueil » : 1re ouverture, « Passer » mène aux règles
 * (à lire avant d'utiliser l'appli). « revoir » : depuis le Profil, « Passer »
 * ferme tout de suite.
 */
export function Tutoriel({ mode, onFermer }: { mode: "accueil" | "revoir"; onFermer: () => void }) {
  const [index, setIndex] = useState(0);
  const [sens, setSens] = useState<"suivante" | "precedente">("suivante");
  const dialogRef = useRef<HTMLDivElement>(null);
  const toucher = useRef<{ x: number; y: number } | null>(null);
  const carte: TutoCarte = TUTO_CARTES[index];
  const derniere = index === TUTO_DERNIERE;

  // Le lecteur d'écran arrive directement dans la démo.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const aller = (cible: number) => {
    if (cible === index) return;
    setSens(cible > index ? "suivante" : "precedente");
    setIndex(cible);
  };
  const suivante = () => (derniere ? onFermer() : aller(carteSuivante(index)));
  const precedente = () => aller(cartePrecedente(index));
  const passer = () => (mode === "accueil" ? aller(TUTO_DERNIERE) : onFermer());

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      if (!derniere) aller(carteSuivante(index));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      precedente();
    } else if (e.key === "Escape" && mode === "revoir") {
      onFermer();
    }
  };

  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    toucher.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    const debut = toucher.current;
    const t = e.changedTouches[0];
    toucher.current = null;
    if (!debut || !t) return;
    const d = directionGlisse(t.clientX - debut.x, t.clientY - debut.y);
    if (d === "suivante" && !derniere) aller(carteSuivante(index));
    else if (d === "precedente") precedente();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-void/75">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={mode === "accueil" ? `Bienvenue sur ${NOM_APPLI}` : "Les gestes de base"}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="w-full max-w-md rounded-t-[22px] bg-panel border-t border-line px-5 pt-3 max-h-[92dvh] overflow-y-auto overflow-x-hidden outline-none"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between min-h-[44px]">
          <Logo />
          {!derniere && (
            <button
              type="button"
              onClick={passer}
              className="-mr-3 min-h-[44px] px-3 text-[15px] font-medium text-mist-dim"
            >
              Passer
            </button>
          )}
        </div>

        {/* La zone « aria-live » reste en place : le lecteur d'écran lit chaque
            nouvelle carte ; seul son contenu change (et rejoue l'entrée). */}
        <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="mt-2" aria-live="polite">
          {/* Hauteur minimale : la feuille ne saute pas d'une carte à l'autre */}
          <div
            key={carte}
            className={`min-h-[352px] ${sens === "suivante" ? "tuto-entree-suivante" : "tuto-entree-precedente"}`}
          >
            {carte === "voir" && (
              <CarteDemo
                scene={<SceneVoir />}
                titre="Sache ce qui t'attend sur la route"
                texte={`Accidents, inondations, routes coupées, travaux\u00a0: signalés en direct par les ${PHRASES.habitants}, autour de toi (1, 3 ou 5\u00a0km). Gratuit et sans compte.`}
              />
            )}
            {carte === "signaler" && (
              <CarteDemo
                scene={<SceneSignaler />}
                titre="Signale en 2 étapes"
                texte={"Touche le +, choisis ce que tu vois, puis «\u00a0Publier\u00a0». Ta position est ajoutée toute seule, jamais ton nom."}
              />
            )}
            {carte === "confirmer" && (
              <CarteDemo
                scene={<SceneConfirmer />}
                titre="Confirme en passant"
                texte={"Tu passes devant\u00a0? Réponds «\u00a0Toujours là\u00a0» ou «\u00a0C'est terminé\u00a0». Plus il y a de réponses, plus la carte est fiable pour tout le monde."}
              />
            )}
            {carte === "regles" && <CarteRegles mode={mode} />}
            <p className="sr-only">
              Carte {index + 1} sur {TUTO_CARTES.length}
            </p>
          </div>
        </div>

        {/* Points de progression (décoratifs : le numéro est lu plus haut) */}
        <div className="mt-4 flex items-center justify-center gap-1.5" aria-hidden="true">
          {TUTO_CARTES.map((c, i) => (
            <span
              key={c}
              className={`h-2 rounded-full transition-all ${i === index ? "w-5 bg-lagoon" : "w-2 bg-line"}`}
            />
          ))}
        </div>

        <div className="mt-4 flex gap-2.5">
          {index > 0 && (
            <button
              type="button"
              onClick={precedente}
              className="shrink-0 rounded-xl border border-line bg-panel-2 px-4 py-3.5 font-display font-semibold text-[15px] text-mist"
            >
              Précédent
            </button>
          )}
          <PrimaryButton className="flex-1" onClick={suivante}>
            {!derniere ? "Suivant" : mode === "accueil" ? "C'est parti" : "Compris"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function CarteDemo({ scene, titre, texte }: { scene: ReactNode; titre: string; texte: string }) {
  return (
    <>
      <div
        className="relative h-[176px] rounded-2xl border border-line bg-[#0b1d22] overflow-hidden"
        aria-hidden="true"
      >
        {scene}
      </div>
      <h2 className="mt-4 font-display font-bold text-[22px] leading-tight">{titre}</h2>
      <p className="mt-1.5 text-[15.5px] text-mist leading-relaxed">{texte}</p>
    </>
  );
}

function CarteRegles({ mode }: { mode: "accueil" | "revoir" }) {
  return (
    <>
      <div className="flex items-center gap-3">
        <h2 className="flex-1 font-display font-bold text-[22px] leading-tight">Avant de prendre la route</h2>
        <Cagou size={72} titre={`Le cagou de ${NOM_APPLI}`} />
      </div>
      <ul className="mt-3 flex flex-col gap-2.5" aria-label="Les règles">
        {REGLES.map((r) => (
          <li key={r.texte} className="flex items-start gap-2.5 text-[15px] leading-snug">
            <span
              className={`mt-[7px] w-2 h-2 shrink-0 rounded-full ${r.urgent ? "bg-danger" : "bg-lagoon"}`}
              aria-hidden="true"
            />
            <span className={r.urgent ? "text-mist" : "text-mist-dim"}>{r.texte}</span>
          </li>
        ))}
      </ul>
      {mode === "accueil" && (
        <p className="mt-4 text-[13px] text-mist-dim leading-relaxed">
          En continuant, tu acceptes les{" "}
          <Link href="/conditions" className="text-lagoon underline">
            conditions d&apos;utilisation
          </Link>{" "}
          et la{" "}
          <Link href="/confidentialite" className="text-lagoon underline">
            politique de confidentialité
          </Link>
          .
        </p>
      )}
    </>
  );
}

/* ------------------------------------------------------------------------
   Scènes animées (CSS dans app/globals.css, classes « tuto-* »). Décoratives :
   le texte sous chaque scène dit la même chose.
   ------------------------------------------------------------------------ */

/** Repère rond d'un type, dessiné dans le SVG de la carte. */
function Repere({ type, x, y, delai }: { type: ReportType; x: number; y: number; delai: string }) {
  return (
    <g className="tuto-repere" style={{ animationDelay: delai }}>
      <circle cx={x} cy={y} r={13} fill={REPORT_TYPE_HEX[type]} stroke="#081317" strokeWidth={2.5} />
      <g
        transform={`translate(${x - 8.4} ${y - 8.4}) scale(0.7)`}
        fill="none"
        stroke={couleurSur(REPORT_TYPE_HEX[type])}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        // Chaînes statiques définies dans lib/types.ts (aucune donnée saisie).
        dangerouslySetInnerHTML={{ __html: REPORT_TYPE_ICON[type] }}
      />
    </g>
  );
}

function SceneVoir() {
  return (
    <>
      <svg viewBox="0 0 320 176" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
        {/* lagon et routes */}
        <path d="M0 0h120c-20 30-60 40-120 44z" fill="#0f2a33" />
        <g fill="none" stroke="#1E363D" strokeLinecap="round">
          <path d="M-10 132C60 112 110 152 170 122S280 72 340 92" strokeWidth={10} />
          <path d="M126 -10C146 50 134 100 166 124S192 168 202 190" strokeWidth={8} />
          <path d="M214 -10C208 40 244 60 330 50" strokeWidth={6} />
        </g>
        {/* ta zone */}
        <circle
          className="tuto-zone"
          cx={160}
          cy={96}
          r={64}
          fill="rgba(34,184,176,0.08)"
          stroke="#22B8B0"
          strokeOpacity={0.6}
          strokeDasharray="4 5"
          strokeWidth={1.5}
        />
        {/* toi */}
        <circle cx={160} cy={96} r={14} fill="rgba(59,130,246,0.25)" />
        <circle cx={160} cy={96} r={7} fill="#3B82F6" stroke="#EAF6F4" strokeWidth={3} />
        {/* ce qui est signalé autour */}
        <Repere type="inondation" x={112} y={70} delai="0.3s" />
        <Repere type="accident" x={205} y={62} delai="1.1s" />
        <Repere type="travaux" x={196} y={136} delai="1.9s" />
      </svg>
      <div className="absolute top-2.5 left-2.5 flex items-center gap-0.5 rounded-full bg-void/90 border border-line p-1">
        {["1 km", "3 km", "5 km"].map((z) => (
          <span
            key={z}
            className={`rounded-full px-2 py-1 text-[12.5px] font-medium ${z === "3 km" ? "bg-primary text-white" : "text-mist-dim"}`}
          >
            {z}
          </span>
        ))}
      </div>
    </>
  );
}

const TYPES_DEMO: ReportType[] = ["accident", "inondation", "route_coupee", "travaux"];

function SceneSignaler() {
  return (
    <>
      {/* 1. la barre du bas et le « + » */}
      <div className="tuto-s-a absolute inset-0">
        <div className="absolute inset-x-0 top-0 bottom-[46px] bg-[radial-gradient(circle_at_50%_40%,rgba(34,184,176,0.10),transparent_60%)]" />
        <div className="absolute inset-x-0 bottom-0 h-[46px] border-t border-line bg-panel flex items-center justify-around px-6">
          <span className="w-5 h-1.5 rounded-full bg-line" />
          <span className="w-5 h-1.5 rounded-full bg-line" />
          <span className="w-11" />
          <span className="w-5 h-1.5 rounded-full bg-line" />
          <span className="w-5 h-1.5 rounded-full bg-line" />
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 bottom-[13px]">
          <div className="tuto-s-plus w-11 h-11 rounded-full bg-primary border-4 border-void flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.8} strokeLinecap="round" className="w-5 h-5">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
        </div>
      </div>

      {/* 2. le choix du type */}
      <div className="tuto-s-b absolute inset-0 p-3 grid grid-cols-2 grid-rows-2 gap-2">
        {TYPES_DEMO.map((t) => (
          <span
            key={t}
            className={`rounded-xl flex flex-col items-center justify-center gap-1 text-[13px] font-semibold ${
              t === "inondation" ? "tuto-s-choix" : ""
            }`}
            style={{ background: REPORT_TYPE_HEX[t], color: couleurSur(REPORT_TYPE_HEX[t]) }}
          >
            <TypeIcon type={t} className="w-6 h-6" />
            {REPORT_TYPE_LABELS[t]}
          </span>
        ))}
      </div>

      {/* 3. vérifier et publier */}
      <div className="tuto-s-c absolute inset-0 p-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-line bg-panel px-2.5 py-2">
          <TypeTile type="inondation" size={34} />
          <span className="font-display font-semibold text-[15px]">{REPORT_TYPE_LABELS.inondation}</span>
        </div>
        <p className="mt-2 flex items-center gap-1.5 px-1 text-[13px] text-lagoon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 shrink-0">
            <path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z" />
            <circle cx="12" cy="10" r="2.3" />
          </svg>
          Position trouvée toute seule
        </p>
        <div className="tuto-s-publier absolute left-3 right-3 bottom-[13px] h-11 rounded-xl bg-primary flex items-center justify-center font-display font-semibold text-[15px] text-white">
          Publier
        </div>
      </div>

      {/* 4. merci */}
      <div className="tuto-s-d absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="w-14 h-14 rounded-full bg-primary/20 border border-primary/50 flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="#22B8B0" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <span className="mt-2 font-display font-bold text-[16px]">Merci !</span>
        <span className="text-[13px] text-mist-dim">Visible tout de suite sur la carte</span>
      </div>

      <span className="tuto-doigt tuto-doigt-signaler" />
    </>
  );
}

function Pastille({ couleur, texte }: { couleur: string; texte: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[12px] font-medium whitespace-nowrap"
      style={{ color: couleur, borderColor: `${couleur}66`, background: `${couleur}1a` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: couleur }} />
      {texte}
    </span>
  );
}

function SceneConfirmer() {
  return (
    <div className="absolute inset-0 p-3">
      <div className="flex items-center gap-2.5 rounded-xl border border-line bg-panel px-2.5 py-2">
        <TypeTile type="inondation" size={38} />
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-[15px]">{REPORT_TYPE_LABELS.inondation}</span>
          <span className="relative mt-0.5 block h-[20px]">
            <span className="tuto-c-avant absolute left-0 top-0">
              <Pastille couleur={RELIABILITY_HEX.signalement} texte="Signalement · 1 personne" />
            </span>
            <span className="tuto-c-apres absolute left-0 top-0">
              <Pastille couleur={RELIABILITY_HEX.a_confirmer} texte="À confirmer · 2 personnes" />
            </span>
          </span>
        </span>
        <span className="tuto-c-plus self-start font-display font-bold text-[14px] text-ok">+1</span>
      </div>
      <p className="mt-2.5 px-1 text-[13px] text-mist-dim">Tu es sur place ?</p>
      <div className="absolute left-3 right-3 bottom-[13px] grid grid-cols-2 gap-2">
        <span className="tuto-c-oui h-11 rounded-xl border border-ok/40 flex items-center justify-center text-[14.5px] font-semibold">
          Toujours là
        </span>
        <span className="h-11 rounded-xl border border-line bg-panel-2 flex items-center justify-center text-[14.5px] font-semibold text-mist">
          C&apos;est terminé
        </span>
      </div>
      <span className="tuto-doigt tuto-doigt-confirmer" />
    </div>
  );
}
