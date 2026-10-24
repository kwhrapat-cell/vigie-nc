// Mise en page commune aux pages légales (mentions, confidentialité,
// conditions) : titre, sections courtes, liens entre les trois pages.

import Link from "next/link";
import type { ReactNode } from "react";
import { ScreenHeader } from "./ui";
import { LEGAL } from "@/lib/legal";

const PAGES = [
  { href: "/conditions", label: "Conditions d'utilisation" },
  { href: "/confidentialite", label: "Confidentialité" },
  { href: "/mentions-legales", label: "Mentions légales" },
];

export function LegalPage({
  title,
  intro,
  current,
  children,
}: {
  title: string;
  intro?: ReactNode;
  current: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-[100dvh] pb-10">
      <ScreenHeader title={title} subtitle={`Mis à jour le ${LEGAL.miseAJour}`} backHref="/profil" />
      {intro && <div className="mx-4 mt-1 mb-4 text-[15px] leading-relaxed text-mist">{intro}</div>}
      <div className="flex flex-col gap-3">{children}</div>
      <nav aria-label="Autres pages légales" className="mx-4 mt-6 flex flex-wrap gap-2">
        {PAGES.filter((p) => p.href !== current).map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className="rounded-full border border-line bg-panel-2 px-3 py-2 text-[14px] text-mist-dim"
          >
            {p.label}
          </Link>
        ))}
      </nav>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mx-4 rounded-xl border border-line bg-panel px-4 py-3.5">
      <h2 className="font-display font-semibold text-[15px] mb-2">{title}</h2>
      <div className="flex flex-col gap-2 text-[14.5px] leading-relaxed text-mist-dim [&_strong]:text-mist [&_strong]:font-medium [&_a]:text-lagoon [&_a]:underline">
        {children}
      </div>
    </section>
  );
}

export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col gap-1.5 list-disc pl-4">{children}</ul>;
}
