"use client";

import { useEffect, useState } from "react";
import { demoActive } from "./demo";

/**
 * La démonstration Mont-Dore est-elle lancée dans cet onglet (lib/demo.ts) ?
 * Faux au premier affichage (même rendu que le serveur, qui ne voit pas
 * l'onglet), puis la vraie valeur.
 */
export function useDemo(): boolean {
  const [demo, setDemo] = useState(false);
  useEffect(() => setDemo(demoActive()), []);
  return demo;
}
