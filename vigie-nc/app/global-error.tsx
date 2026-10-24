"use client";

import { useEffect } from "react";
import "./globals.css";
import { EcranErreur } from "@/components/EcranErreur";
import { signalerErreur } from "@/lib/erreurs";

// Plantage de la mise en page elle-même (rare) : cet écran remplace toute
// la page, d'où <html> et <body> ici.
export default function ErreurGenerale({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    signalerErreur(error, "general");
  }, [error]);
  return (
    <html lang="fr">
      <body className="bg-void">
        <div className="max-w-md mx-auto">
          <EcranErreur onReessayer={reset} />
        </div>
      </body>
    </html>
  );
}
