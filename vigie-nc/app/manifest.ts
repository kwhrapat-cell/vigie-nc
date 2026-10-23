import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

// Rend Vigie NC installable (Android : « Installer l'application »).
// display « standalone » : l'appli installée s'ouvre dans sa propre
// fenêtre. Sur Android, elle partage ses données avec Chrome (contacts
// SOS, réglages). Sur iPhone, c'est indispensable pour les alertes, mais
// l'appli de l'écran d'accueil a ses propres données, à part de Safari.
const RACCOURCI_ICONE = { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" };

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: `${SITE_NAME} — l'état des routes`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#081317",
    theme_color: "#081317",
    categories: ["navigation", "travel", "weather"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Appui long sur l'icône de l'appli installée (Android) : accès direct.
    // Le téléphone les prend en compte à la mise à jour de l'appli (jusqu'à
    // un jour) ou en la réinstallant.
    shortcuts: [
      { name: "Signaler un événement", short_name: "Signaler", url: "/signaler", icons: [RACCOURCI_ICONE] },
      { name: "Mes alertes", short_name: "Alertes", url: "/alertes", icons: [RACCOURCI_ICONE] },
      { name: "SOS — je suis en danger", short_name: "SOS", url: "/sos", icons: [RACCOURCI_ICONE] },
    ],
  };
}
