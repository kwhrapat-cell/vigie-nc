import type { Metadata } from "next";
import Link from "next/link";
import { ShareRedirect } from "@/components/ShareRedirect";
import { TypeTile } from "@/components/ui";
import {
  fetchPublicReport,
  isReportId,
  quandLocal,
  shareDescription,
  shareReliability,
  shareTitle,
} from "@/lib/report-public";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

// Lien partagé d'un signalement (bouton « Partager » de la fiche) :
// vigie-nc.com/s/<id>?src=partage. WhatsApp, Facebook… lisent le titre et
// l'image d'aperçu de cette page (opengraph-image.tsx, à côté) ; une
// personne, elle, est envoyée tout de suite sur la carte, fiche ouverte.

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const r = await fetchPublicReport(id);
  const title = r ? shareTitle(r) : `Signalement · ${SITE_NAME}`;
  const description = r ? shareDescription(r) : SITE_DESCRIPTION;
  return {
    title: `${title} · ${SITE_NAME}`,
    description,
    // Page de passage : pas dans les moteurs de recherche
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      locale: "fr_FR",
      siteName: SITE_NAME,
      url: `${SITE_URL}/s/${encodeURIComponent(id)}`,
      title,
      description,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedReportPage({ params }: Props) {
  const { id } = await params;
  const r = await fetchPublicReport(id);
  const carte = isReportId(id) ? `/?signalement=${id}&src=partage` : "/?src=partage";

  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center">
      <ShareRedirect href={carte} />
      {r ? (
        <>
          <TypeTile type={r.type} size={56} />
          <h1 className="mt-3 font-display font-semibold text-[20px] leading-tight">{shareTitle(r)}</h1>
          <p className="mt-1 text-[14.5px] text-mist-dim">
            {r.actif ? shareReliability(r) : "Terminé"} · signalé {quandLocal(r.createdAt)}
          </p>
        </>
      ) : (
        <h1 className="font-display font-semibold text-[18px]">Ce signalement n&apos;est plus disponible</h1>
      )}
      <p className="mt-4 text-[14px] text-mist-dim">Ouverture de la carte…</p>
      <Link href={carte} className="mt-3 rounded-xl bg-primary px-5 py-3 text-[15.5px] font-semibold text-white">
        Voir sur la carte
      </Link>
    </main>
  );
}
