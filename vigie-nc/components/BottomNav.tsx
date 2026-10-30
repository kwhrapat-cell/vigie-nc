"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ASTUCE_SIGNALER_EVENT, ecrireAstuceSignaler, lireAstuceSignaler } from "@/lib/tuto";

type Tab = { href: string; label: string; icon: string };

const LEFT: Tab[] = [
  {
    href: "/",
    label: "Carte",
    icon: '<path d="M9 4L3.5 6v14L9 18l6 2 5.5-2V4L15 6z"/><path d="M9 4v14M15 6v14"/>',
  },
  {
    href: "/historique",
    label: "Historique",
    icon: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  },
];

const RIGHT: Tab[] = [
  {
    href: "/alertes",
    label: "Alertes",
    icon: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  },
  {
    href: "/profil",
    label: "Profil",
    icon: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  },
];

function NavTab({ tab, active }: { tab: Tab; active: boolean }) {
  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={`flex-1 flex flex-col items-center justify-center gap-1 h-full text-[12.5px] lg:flex-none lg:h-[72px] lg:mx-2 lg:rounded-xl lg:hover:bg-panel-2 ${
        active ? "text-lagoon lg:bg-panel-2" : "text-mist-dim lg:hover:text-mist"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-[22px] h-[22px]"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: tab.icon }}
      />
      {tab.label}
    </Link>
  );
}

/** L'astuce du « + » est-elle à montrer ? (suit l'accueil, sur ce téléphone) */
function useAstuceSignaler(): boolean {
  const [montrer, setMontrer] = useState(false);
  useEffect(() => {
    const maj = () => setMontrer(lireAstuceSignaler());
    maj();
    window.addEventListener(ASTUCE_SIGNALER_EVENT, maj);
    return () => window.removeEventListener(ASTUCE_SIGNALER_EVENT, maj);
  }, []);
  return montrer;
}

/**
 * Bulle « Touche ici pour signaler » au-dessus du « + », montrée une seule
 * fois aux nouveaux, juste après l'accueil. Disparaît dès qu'on touche le
 * « + », la bulle ou sa croix.
 */
function AstuceSignaler() {
  return (
    <div
      role="note"
      className="astuce-signaler absolute left-1/2 bottom-[calc(100%_+_34px)] lg:left-[calc(100%_+_10px)] lg:bottom-auto lg:top-1/2 flex items-stretch rounded-xl bg-mist text-void shadow-[0_10px_24px_-8px_rgba(0,0,0,0.8)]"
    >
      <Link
        href="/signaler"
        onClick={() => ecrireAstuceSignaler("vue")}
        className="flex items-center gap-1.5 min-h-[44px] pl-3.5 pr-1 whitespace-nowrap font-display font-semibold text-[14.5px]"
      >
        Touche ici pour signaler
      </Link>
      <button
        type="button"
        onClick={() => ecrireAstuceSignaler("vue")}
        aria-label="Fermer l'astuce"
        className="w-11 min-h-[44px] flex items-center justify-center text-void/70"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className="w-4 h-4" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      {/* pointe vers le « + » (en dessous ; à gauche sur le rail) */}
      <span
        className="absolute left-1/2 -bottom-[6px] -ml-[6px] lg:-left-[6px] lg:ml-0 lg:bottom-auto lg:top-1/2 lg:-mt-[6px] w-3 h-3 rotate-45 bg-mist"
        aria-hidden="true"
      />
    </div>
  );
}

/**
 * Barre du bas des maquettes : 4 onglets + bouton « + » central.
 * Sur ordinateur et tablette en paysage (960 px et plus), elle devient un
 * rail vertical à gauche de l'écran (largeur --rail de globals.css), avec
 * « Signaler » écrit sous le « + ».
 */
export function BottomNav({ rail = true }: { rail?: boolean }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const astuce = useAstuceSignaler();

  // rail = false (accueil) : sur ordinateur, le menu est dans le panneau de
  // gauche (NavOrdi), pas de barre à part.
  return (
    <nav
      aria-label="Navigation principale"
      className={`nav-principale fixed bottom-0 inset-x-0 z-[25] border-t border-line bg-panel/95 backdrop-blur lg:top-0 lg:right-auto lg:w-[var(--rail)] lg:border-t-0 lg:border-r lg:bg-panel ${
        rail ? "" : "lg:hidden"
      }`}
      style={{ paddingBottom: "min(env(safe-area-inset-bottom, 0px), 34px)" }}
    >
      <div className="relative mx-auto max-w-md md:max-w-2xl flex items-stretch h-[62px] lg:max-w-none lg:h-full lg:flex-col lg:justify-center lg:gap-1">
        {LEFT.map((t) => (
          <NavTab key={t.href} tab={t} active={isActive(t.href)} />
        ))}
        <div className="relative flex-1 flex justify-center lg:flex-none lg:flex-col lg:items-center lg:py-3">
          {astuce && <AstuceSignaler />}
          <Link
            href="/signaler"
            aria-label="Signaler un événement"
            onClick={() => {
              if (astuce) ecrireAstuceSignaler("vue");
            }}
            className="-mt-6 lg:mt-0 w-[58px] h-[58px] rounded-full bg-primary flex items-center justify-center shadow-[0_10px_24px_-6px_rgba(22,127,120,0.7)] border-4 border-void lg:border-panel lg:hover:bg-primary-strong animate-fab-in"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" className="w-6 h-6">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Link>
          {/* Sur le rail, le bouton se lit sans deviner : « Signaler » dessous */}
          <span className="hidden lg:block mt-1 text-[12.5px] font-medium text-mist pointer-events-none" aria-hidden="true">
            Signaler
          </span>
        </div>
        {RIGHT.map((t) => (
          <NavTab key={t.href} tab={t} active={isActive(t.href)} />
        ))}
      </div>
    </nav>
  );
}

/**
 * Menu de l'accueil sur ordinateur (960 px et plus), en haut du panneau de
 * gauche : les 4 onglets en texte, « + Signaler » à droite. Caché sur
 * téléphone et tablette, où la barre du bas sert de menu.
 */
export function NavOrdi() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <nav aria-label="Navigation principale" className="hidden lg:flex items-center gap-0.5 mx-4 mb-2 border-b border-line">
      {[...LEFT, ...RIGHT].map((t) => {
        const actif = isActive(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={actif ? "page" : undefined}
            className={`-mb-px px-2.5 pt-2.5 pb-3 text-[14px] border-b-2 ${
              actif ? "border-lagoon font-semibold text-mist" : "border-transparent text-mist-dim hover:text-mist"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
      <Link
        href="/signaler"
        className="ml-auto mb-1.5 flex items-center gap-1.5 h-9 px-3 rounded-full bg-primary hover:bg-primary-strong text-white text-[13.5px] font-semibold"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" className="w-3.5 h-3.5" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Signaler
      </Link>
    </nav>
  );
}
