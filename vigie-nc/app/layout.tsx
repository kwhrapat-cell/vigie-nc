import type { Metadata, Viewport } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";
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
  // Nom affiché sous l'icône quand on l'ajoute à l'écran d'accueil (iPhone)
  appleWebApp: {
    title: SITE_NAME,
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
        <div className="max-w-md mx-auto min-h-screen flex flex-col bg-void">
          {children}
        </div>
      </body>
    </html>
  );
}
