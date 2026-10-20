import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { fetchPublicReport, quandNoumea, shareReliability } from "@/lib/report-public";
import { getReliability, RELIABILITY_HEX } from "@/lib/reliability";
import { REPORT_TYPE_HEX, REPORT_TYPE_ICON } from "@/lib/types";

// Image d'aperçu d'un signalement partagé (WhatsApp, Facebook, SMS…) :
// type, lieu, fiabilité et heure, comme sur la fiche. Ni photo ni texte
// saisi (ils peuvent être masqués par la modération ensuite, alors que
// l'aperçu reste en cache chez WhatsApp).

export const alt = "Signalement sur Vigie NC, la carte en direct de l'état des routes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

const FOND = "#081317";
const TEXTE = "#EAF6F4";
const TEXTE_DOUX = "#93B0AD";
const LAGON = "#22B8B0";

type Font = { name: string; data: Buffer; weight: 400 | 600; style: "normal" };

// Inter réduite aux caractères latins (assets/fonts, licence OFL.txt).
// Lue une seule fois ; si la lecture échoue, l'image garde la police par
// défaut plutôt que de ne pas s'afficher.
let fontsPromise: Promise<Font[]> | null = null;
function loadFonts(): Promise<Font[]> {
  fontsPromise ??= Promise.all([
    readFile(join(process.cwd(), "assets/fonts/Inter-Regular.otf")),
    readFile(join(process.cwd(), "assets/fonts/Inter-SemiBold.otf")),
  ])
    .then(([regular, semiBold]): Font[] => [
      { name: "Inter", data: regular, weight: 400, style: "normal" },
      { name: "Inter", data: semiBold, weight: 600, style: "normal" },
    ])
    .catch(() => []);
  return fontsPromise;
}

function iconSrc(paths: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function court(texte: string, max: number): string {
  return texte.length > max ? `${texte.slice(0, max - 1).trimEnd()}…` : texte;
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await fetchPublicReport(id);
  const fonts = await loadFonts();

  const entete = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ width: 16, height: 16, borderRadius: 8, background: LAGON, marginRight: 14 }} />
        <div style={{ fontSize: 32, fontWeight: 600 }}>Vigie NC</div>
      </div>
      <div style={{ fontSize: 26, color: TEXTE_DOUX }}>L&apos;état des routes en direct</div>
    </div>
  );

  const pied = (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        marginTop: "auto",
        fontSize: 24,
        color: TEXTE_DOUX,
      }}
    >
      <div>Info citoyenne, à vérifier sur place</div>
      <div>vigie-nc.com · gratuit et anonyme</div>
    </div>
  );

  if (!r) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            background: FOND,
            color: TEXTE,
            padding: "56px 64px",
            fontFamily: "Inter",
          }}
        >
          {entete}
          <div style={{ display: "flex", flexDirection: "column", marginTop: 110 }}>
            <div style={{ fontSize: 64, fontWeight: 600 }}>Signalement terminé</div>
            <div style={{ fontSize: 34, color: TEXTE_DOUX, marginTop: 16 }}>
              Ouvre la carte pour voir l&apos;état des routes maintenant.
            </div>
          </div>
          {pied}
        </div>
      ),
      { ...size, ...(fonts.length ? { fonts } : {}) },
    );
  }

  const rel = getReliability({
    confirmations: r.confirmations,
    infirmations: r.infirmations,
    officialSource: r.sourceOfficielle,
    relaySource: r.relaisSource,
  });
  const etatCouleur = r.actif ? RELIABILITY_HEX[rel.level] : TEXTE_DOUX;
  const etat = r.actif ? shareReliability(r) : "Terminé";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: FOND,
          color: TEXTE,
          padding: "56px 64px",
          fontFamily: "Inter",
        }}
      >
        {entete}
        <div style={{ display: "flex", alignItems: "center", marginTop: 64 }}>
          <div
            style={{
              width: 184,
              height: 184,
              borderRadius: 40,
              background: REPORT_TYPE_HEX[r.type],
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 44,
              flexShrink: 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={iconSrc(REPORT_TYPE_ICON[r.type])} width={112} height={112} alt="" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ fontSize: 76, fontWeight: 600, lineHeight: 1.05 }}>{r.label}</div>
            {r.lieu && (
              <div style={{ fontSize: 40, marginTop: 12, lineHeight: 1.2 }}>{court(r.lieu, 70)}</div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 44 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "10px 22px",
              borderRadius: 999,
              border: `2px solid ${etatCouleur}88`,
              background: `${etatCouleur}22`,
              fontSize: 28,
              fontWeight: 600,
              color: etatCouleur,
              marginRight: 22,
            }}
          >
            <div style={{ width: 12, height: 12, borderRadius: 6, background: etatCouleur, marginRight: 12 }} />
            {etat}
          </div>
          {/* Un seul texte par bloc : l'outil d'image refuse plusieurs morceaux sans « display: flex » */}
          <div style={{ fontSize: 28, color: TEXTE_DOUX }}>{`Signalé ${quandNoumea(r.createdAt)}`}</div>
        </div>
        {pied}
      </div>
    ),
    { ...size, ...(fonts.length ? { fonts } : {}) },
  );
}
