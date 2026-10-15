"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/push";

/** Installe le service worker des notifications dès l'ouverture de l'appli. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return null;
}
