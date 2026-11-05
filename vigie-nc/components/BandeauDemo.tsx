"use client";

import { useEffect } from "react";
import { quitterDemo } from "@/lib/demo";
import { useDemo } from "@/lib/useDemo";

/**
 * Bandeau en haut de TOUS les écrans pendant la démonstration Mont-Dore
 * (lib/demo.ts) : personne ne peut prendre le scénario pour de vraies
 * informations. Sa hauteur (--demo-h de globals.css) est retirée de la
 * carte de l'accueil, qui garde ainsi la hauteur de l'écran.
 */
export function BandeauDemo() {
  const demo = useDemo();
  useEffect(() => {
    document.documentElement.classList.toggle("mode-demo", demo);
  }, [demo]);
  if (!demo) return null;
  return (
    <div
      role="status"
      className="h-[30px] flex items-center justify-center gap-3 px-3 bg-ochre/15 border-b border-ochre/40 text-ochre text-[13px] font-semibold"
    >
      <span>Démonstration · données fictives</span>
      <button
        type="button"
        onClick={quitterDemo}
        className="relative underline underline-offset-2 before:absolute before:-inset-x-2 before:-inset-y-2 before:content-['']"
      >
        Quitter
      </button>
    </div>
  );
}
