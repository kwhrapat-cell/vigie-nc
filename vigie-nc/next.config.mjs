// En-têtes de sécurité. La politique d'images (CSP img-src) n'autorise que
// l'appli, les photos de NOTRE projet Supabase et les fonds de carte : une
// image posée par quelqu'un sur son propre serveur ne s'affiche pas (elle
// pourrait servir à relever l'adresse IP de chaque personne qui ouvre une
// fiche). À compléter si un nouveau fond de carte est ajouté.
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
  } catch {
    return "";
  }
})();

const imageSources = [
  "'self'",
  "data:",
  "blob:",
  supabaseHost && `https://${supabaseHost}`,
  "https://tile.openstreetmap.org",
  "https://server.arcgisonline.com",
  "https://api.maptiler.com",
]
  .filter(Boolean)
  .join(" ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      `img-src ${imageSources}`,
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()" },
];

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
      { source: "/:path*", headers: securityHeaders },
      // Outil de floutage : le chemin contient la version, il ne change jamais.
      {
        source: "/mediapipe/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
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
