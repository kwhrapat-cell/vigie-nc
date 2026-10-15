/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
