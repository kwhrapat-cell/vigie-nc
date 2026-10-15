import type { Metadata } from "next";
import Link from "next/link";
import { ShareAffiche } from "@/components/ShareAffiche";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// Page à envoyer par lien (WhatsApp, Messenger, SMS…) : l'affiche de
// Vigie NC, avec de quoi ouvrir l'appli et enregistrer l'image.
// Images dans public/affiche/ (affiche entière + aperçu 1200×630).

const AFFICHE_URL = "/affiche/vigie-nc-affiche.jpg";

export const metadata: Metadata = {
  title: `L'affiche · ${SITE_NAME}`,
  description: "Vigie NC : informé en direct, serein sur la route ! Gratuit, sans compte, Android et iPhone.",
  openGraph: {
    type: "website",
    url: `${SITE_URL}/affiche`,
    title: `${SITE_NAME} : informé en direct, serein sur la route !`,
    description: "L'état des routes en Nouvelle-Calédonie, en direct. Gratuit, sans compte, Android et iPhone.",
    images: [
      {
        url: "/affiche/apercu.jpg",
        width: 1200,
        height: 630,
        alt: "Affiche Vigie NC : informé en direct, serein sur la route !",
      },
    ],
  },
  twitter: { card: "summary_large_image", images: ["/affiche/apercu.jpg"] },
};

export default function AffichePage() {
  return (
    <main className="min-h-[100dvh] pb-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={AFFICHE_URL}
        alt="Affiche Vigie NC : informé en direct, serein sur la route ! Accidents, routes bloquées, inondations, trafic dense. Une innovation 100 % calédonienne. Scanne le QR code ou ouvre vigie-nc.vercel.app."
        width={1440}
        height={2160}
        className="w-full h-auto"
      />

      <div className="mx-4 mt-4 flex flex-col gap-2.5">
        <Link
          href="/"
          className="w-full rounded-xl bg-primary py-3.5 text-center font-display font-semibold text-[14.5px] text-white"
        >
          Ouvrir Vigie NC
        </Link>
        <div className="grid grid-cols-2 gap-2.5">
          <a
            href={AFFICHE_URL}
            download="vigie-nc-affiche.jpg"
            className="rounded-xl border border-line bg-panel-2 py-3 text-center text-[13px] font-semibold"
          >
            Enregistrer l&apos;image
          </a>
          <ShareAffiche />
        </div>
        <p className="mt-1 text-center text-[11px] text-mist-dim">
          Gratuit, sans compte · Android et iPhone
        </p>
      </div>
    </main>
  );
}
