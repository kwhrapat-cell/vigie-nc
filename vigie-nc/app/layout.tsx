import type { Metadata, Viewport } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vigie NC",
  description:
    "La route, le ciel et le terrain calédonien, réunis en direct — et une mémoire de ce qui revient trop souvent.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#071B21",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>
        <div className="max-w-md mx-auto min-h-screen flex flex-col bg-panel">
          {children}
        </div>
      </body>
    </html>
  );
}
