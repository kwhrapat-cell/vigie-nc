"use client";

import { useEffect } from "react";

/**
 * Page d'un lien partagé (/s/<id>) : les robots d'aperçu (WhatsApp,
 * Facebook…) lisent la page sans exécuter ce code ; une personne est
 * envoyée tout de suite sur la carte.
 */
export function ShareRedirect({ href }: { href: string }) {
  useEffect(() => {
    window.location.replace(href);
  }, [href]);
  return null;
}
