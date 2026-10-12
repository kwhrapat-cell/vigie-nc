import type { Metadata, Viewport } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { PwaSetup } from "@/components/PwaSetup";
import { INSTALL_CAPTURE_SCRIPT } from "@/lib/pwa";

export const metadata: Metadata = {
  title: "Vigie NC",
  applicationName: "Vigie NC",
  description:
    "Voir, signaler, agir ensemble : l'état des routes en Nouvelle-Calédonie, en direct et anonyme.",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  // iPhone : appli plein écran une fois ajoutée à l'écran d'accueil.
  appleWebApp: { capable: true, title: "Vigie NC", statusBarStyle: "black" },
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
      <head>
        {/* Manifeste écrit à la main plutôt que via `metadata` : avec
            « use-credentials », il reste lisible quand le site est protégé
            par la connexion Vercel (sinon l'installation échoue). */}
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
        <script dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE_SCRIPT }} />
      </head>
      <body>
        <div className="max-w-md mx-auto min-h-screen flex flex-col bg-void">
          {children}
        </div>
        <PwaSetup />
      </body>
    </html>
  );
}
