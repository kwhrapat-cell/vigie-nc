import type { Metadata, Viewport } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { BandeauDemo } from "@/components/BandeauDemo";
import { ErreurReporter } from "@/components/ErreurReporter";
import { ServiceIndisponible } from "@/components/ServiceIndisponible";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { SessionInit } from "@/components/SessionInit";
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
    <html lang="fr">
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
        <BandeauDemo />
        <AppShell>{demoBlocked ? <ServiceIndisponible /> : children}</AppShell>
      </body>
    </html>
  );
}
