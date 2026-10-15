/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // L'ancienne adresse renvoie vers le nom de domaine (liens et QR codes
  // déjà partagés). Sauf le service worker et /api : les notifications
  // activées sur l'ancienne adresse continuent d'arriver.
  async redirects() {
    const host = [{ type: "host", value: "vigie-nc.vercel.app" }];
    return [
      { source: "/", has: host, destination: "https://vigie-nc.com/", permanent: false },
      {
        source: "/:path((?!api/|sw\\.js).*)",
        has: host,
        destination: "https://vigie-nc.com/:path",
        permanent: false,
      },
    ];
  },
  // Le service worker (notifications) ne doit jamais rester en cache :
  // une nouvelle version doit être prise en compte tout de suite.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
