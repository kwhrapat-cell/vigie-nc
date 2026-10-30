"use client";

import { usePathname } from "next/navigation";

/**
 * Cadre de l'appli. Sur téléphone : une colonne de 448 px au plus.
 * Sur tablette et ordinateur (dès 768 px) : colonne plus large (672 px)
 * pour les écrans de lecture et de saisie, et la carte de l'accueil prend
 * toute la largeur. Les tailles sont dans globals.css (« .app-shell »).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const carte = pathname === "/";
  return (
    <div className={`app-shell${carte ? " app-shell--carte" : ""} mx-auto min-h-screen flex flex-col bg-void`}>
      {children}
    </div>
  );
}
