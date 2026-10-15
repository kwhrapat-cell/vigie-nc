import type { Metadata } from "next";

// Écran réservé aux modérateurs : pas de référencement dans les moteurs.
export const metadata: Metadata = {
  title: "Modération · Vigie NC",
  robots: { index: false, follow: false },
};

export default function ModerationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
