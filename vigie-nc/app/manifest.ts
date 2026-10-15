import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

// Rend Vigie NC installable (Android : « Installer l'application »).
// display « minimal-ui » : sur Android, l'appli installée s'ouvre dans sa
// propre fenêtre et partage ses données avec Chrome (contacts SOS,
// réglages). L'iPhone ne connaît pas ce mode : il continue d'ouvrir
// l'icône dans Safari, avec les mêmes données que Safari.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: `${SITE_NAME} — l'état des routes`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "minimal-ui",
    orientation: "portrait",
    background_color: "#081317",
    theme_color: "#081317",
    categories: ["navigation", "travel", "weather"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
