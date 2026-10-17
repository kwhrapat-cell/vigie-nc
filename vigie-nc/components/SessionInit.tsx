"use client";

import { useEffect } from "react";
import { ensureSession } from "@/lib/session";

/**
 * Ouvre la session anonyme dès l'arrivée sur l'appli, sans bloquer
 * l'affichage : elle est prête quand on signale ou qu'on vote.
 */
export function SessionInit() {
  useEffect(() => {
    ensureSession().catch(() => undefined);
  }, []);
  return null;
}
