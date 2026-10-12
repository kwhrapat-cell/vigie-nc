"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/pwa";

/** Enregistre le service worker une fois la page chargée. N'affiche rien. */
export function PwaSetup() {
  useEffect(() => {
    if (document.readyState === "complete") registerServiceWorker();
    else window.addEventListener("load", registerServiceWorker, { once: true });
  }, []);
  return null;
}
