"use client";

import Link from "next/link";
import { useState } from "react";
import { lancerDemo, quitterDemo } from "@/lib/demo";
import { useDemo } from "@/lib/useDemo";

/** Boutons de la page /demo : lancer, reprendre ou quitter la démonstration. */
export function DemoLanceur() {
  const demo = useDemo();
  const [erreur, setErreur] = useState(false);

  if (demo) {
    return (
      <div className="flex flex-col gap-3">
        <Link
          href="/"
          className="min-h-[52px] rounded-2xl bg-primary text-white font-display font-semibold text-[16px] flex items-center justify-center"
        >
          Retourner à la démo
        </Link>
        <button
          type="button"
          onClick={quitterDemo}
          className="min-h-[48px] rounded-2xl border border-line bg-panel-2 text-mist font-medium text-[15px]"
        >
          Quitter la démo
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setErreur(!lancerDemo())}
        className="min-h-[52px] rounded-2xl bg-primary text-white font-display font-semibold text-[16px]"
      >
        Lancer la démo
      </button>
      {erreur && (
        <p className="text-[14px] text-danger">
          Ce navigateur bloque le stockage de l&apos;onglet (navigation privée ?). Ouvre la démo dans un onglet normal.
        </p>
      )}
    </div>
  );
}
