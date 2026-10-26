import type { Metadata } from "next";
import { NOM_APPLI } from "@/lib/territoire";

// Écran réservé aux modérateurs : pas de référencement dans les moteurs.
export const metadata: Metadata = {
  title: `Modération · ${NOM_APPLI}`,
  robots: { index: false, follow: false },
};

export default function ModerationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
