import type { Metadata, Viewport } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

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
        <ServiceWorkerRegister />
        <div className="max-w-md mx-auto min-h-screen flex flex-col bg-void">
          {children}
        </div>
      </body>
    </html>
  );
}
