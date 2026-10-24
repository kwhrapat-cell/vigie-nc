"use client";

import { useEffect } from "react";
import { signalerErreur } from "@/lib/erreurs";

/** Écoute les erreurs de la page et les signale anonymement (lib/erreurs.ts). */
export function ErreurReporter() {
  useEffect(() => {
    const surErreur = (e: ErrorEvent) => signalerErreur(e.error ?? e.message, "page");
    const surPromesse = (e: PromiseRejectionEvent) => signalerErreur(e.reason, "promesse");
    window.addEventListener("error", surErreur);
    window.addEventListener("unhandledrejection", surPromesse);
    return () => {
      window.removeEventListener("error", surErreur);
      window.removeEventListener("unhandledrejection", surPromesse);
    };
  }, []);
  return null;
}
