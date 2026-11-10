import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { BandeauDemo } from "@/components/BandeauDemo";
import { ErreurReporter } from "@/components/ErreurReporter";
import { ServiceIndisponible } from "@/components/ServiceIndisponible";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { SessionInit } from "@/components/SessionInit";
import { EnvoiEnAttente } from "@/components/EnvoiEnAttente";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { demoBlocked } from "@/lib/supabase";

// L'image d'aperçu (app/opengraph-image.png) et les icônes (app/icon.png,
// app/apple-icon.png) sont ajoutées automatiquement par Next.js.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_NAME,
  description:
    "Voir, signaler, agir ensemble : l'état des routes en Nouvelle-Calédonie, en direct et anonyme.",
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — l'état des routes en direct`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — l'état des routes en direct`,
    description: SITE_DESCRIPTION,
  },
  // iPhone : ajoutée à l'écran d'accueil, Vigie NC s'ouvre comme une appli
  // (sans barre Safari). C'est la condition pour recevoir les alertes.
  // Cette appli garde ses propres données (contacts SOS, réglages), à part
  // de celles de Safari.
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "black",
  },
};

// Polices téléchargées à la construction du site et servies par Vigie NC :
// le téléphone ne contacte jamais Google Fonts (pas d'adresse IP envoyée
// à Google à chaque visite). Utilisées par Tailwind (font-display, font-body,
// font-mono), globals.css et le dessin du point route (lib/point-route-dessin.ts).
// Polices rangées DANS le site (assets/fonts, caractères latins, licence OFL) :
// la construction ne télécharge plus rien chez Google (le 10/11/2026, Google
// n'a pas répondu et la mise en ligne a échoué). Mêmes fichiers que Google
// Fonts « latin » (copie Fontsource), et le téléphone ne parle jamais à Google.
const policeTexte = localFont({
  src: [
    { path: "../assets/fonts/inter-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../assets/fonts/inter-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../assets/fonts/inter-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  variable: "--police-texte",
});
const policeTitre = localFont({
  src: [
    { path: "../assets/fonts/space-grotesk-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../assets/fonts/space-grotesk-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../assets/fonts/space-grotesk-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--police-titre",
});
const policeMono = localFont({
  src: [
    { path: "../assets/fonts/ibm-plex-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../assets/fonts/ibm-plex-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
  variable: "--police-mono",
  fallback: ["ui-monospace", "Menlo", "monospace"],
  adjustFontFallback: false,
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#081317",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${policeTexte.variable} ${policeTitre.variable} ${policeMono.variable}`}>
      <body>
        {/* Sans JavaScript (bloqué, vieux navigateur, lecteur de page) : la
            carte et la liste ne peuvent pas se charger, on le dit. */}
        <noscript>
          <div className="border-b border-warn/30 bg-warn/10 px-4 py-3 text-[14px] leading-relaxed text-mist">
            <p className="font-display font-semibold">Vigie NC a besoin de JavaScript pour fonctionner.</p>
            <p className="mt-1 text-mist-dim">
              Vigie NC est une carte gratuite et anonyme de l&apos;état des routes en Nouvelle-Calédonie (accidents,
              inondations, routes coupées, travaux), signalé en direct par les usagers. Pour voir la carte et les
              signalements, active JavaScript ou ouvre vigie-nc.com dans Chrome ou Safari.
            </p>
          </div>
        </noscript>
        <ServiceWorkerRegister />
        <ErreurReporter />
        {!demoBlocked && <SessionInit />}
        {!demoBlocked && <EnvoiEnAttente />}
        <BandeauDemo />
        <AppShell>{demoBlocked ? <ServiceIndisponible /> : children}</AppShell>
      </body>
    </html>
  );
}
