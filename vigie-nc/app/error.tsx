"use client";

import { useEffect } from "react";
import { EcranErreur } from "@/components/EcranErreur";
import { signalerErreur } from "@/lib/erreurs";

// Un écran a planté : au lieu d'une page blanche, le cagou, « Réessayer »
// et les numéros d'urgence. L'erreur est signalée (anonyme, lib/erreurs.ts).
export default function Erreur({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    signalerErreur(error, "ecran");
  }, [error]);
  return <EcranErreur onReessayer={reset} />;
}
