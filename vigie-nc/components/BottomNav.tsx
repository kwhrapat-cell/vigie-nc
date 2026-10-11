"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
      className={`flex-1 flex flex-col items-center justify-center gap-1 h-full text-[10.5px] ${
        active ? "text-lagoon" : "text-mist-dim"
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

/** Barre du bas des maquettes : 4 onglets + bouton « + » central. */
export function BottomNav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed bottom-0 inset-x-0 z-[25] mx-auto max-w-md border-t border-line bg-panel/95 backdrop-blur"
      style={{ paddingBottom: "min(env(safe-area-inset-bottom, 0px), 34px)" }}
    >
      <div className="relative flex items-stretch h-[62px]">
        {LEFT.map((t) => (
          <NavTab key={t.href} tab={t} active={isActive(t.href)} />
        ))}
        <div className="flex-1 flex justify-center">
          <Link
            href="/signaler"
            aria-label="Signaler un événement"
            className="-mt-6 w-[58px] h-[58px] rounded-full bg-primary flex items-center justify-center shadow-[0_10px_24px_-6px_rgba(28,152,144,0.7)] border-4 border-void animate-fab-in"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" className="w-6 h-6">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Link>
        </div>
        {RIGHT.map((t) => (
          <NavTab key={t.href} tab={t} active={isActive(t.href)} />
        ))}
      </div>
    </nav>
  );
}
