// Carte sans réseau : passerelle vers le fichier de la carte de la
// Calédonie, publié chaque mois dans la pré-version « carte-nc » du dépôt
// GitHub (.github/workflows/carte.yml). Le téléphone ne parle qu'à
// vigie-nc.com ; ce serveur va chercher le morceau demandé.
//   GET /api/carte?fiche=1                       fiche de la version en cours
//   GET /api/carte?f=nc-AAAAMMJJ.pmtiles&debut=N&fin=M   octets N à M (inclus)
// Un fichier daté ne change jamais : ses morceaux sont gardés en cache par
// le CDN de Vercel (une seule lecture chez GitHub pour tout le monde).

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEPOT = "https://github.com/kwhrapat-cell/vigie-nc/releases/download/carte-nc/";
const NOM_FICHIER = /^nc-\d{8}\.pmtiles$/;
/** Sous la limite de réponse des fonctions Vercel (4,5 Mo). */
const MORCEAU_MAX = 4_000_000;
const DELAI_MS = 25_000;

function erreur(message: string, status: number) {
  return NextResponse.json({ erreur: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function entier(v: string | null): number | null {
  if (v === null || !/^\d{1,12}$/.test(v)) return null;
  return Number(v);
}

async function chercher(url: string, init: RequestInit = {}): Promise<Response> {
  const controle = new AbortController();
  const minuteur = setTimeout(() => controle.abort(), DELAI_MS);
  try {
    return await fetch(url, { ...init, redirect: "follow", signal: controle.signal, cache: "no-store" });
  } finally {
    clearTimeout(minuteur);
  }
}

export async function GET(req: Request) {
  const u = new URL(req.url);

  if (u.searchParams.has("fiche")) {
    let r: Response;
    try {
      r = await chercher(`${DEPOT}nc.json`);
    } catch {
      return erreur("carte_indisponible", 502);
    }
    if (!r.ok) return erreur("carte_indisponible", 502);
    let fiche: Record<string, unknown>;
    try {
      fiche = (await r.json()) as Record<string, unknown>;
    } catch {
      return erreur("carte_indisponible", 502);
    }
    if (typeof fiche.fichier !== "string" || !NOM_FICHIER.test(fiche.fichier) || typeof fiche.octets !== "number") {
      return erreur("carte_indisponible", 502);
    }
    return NextResponse.json(
      { fichier: fiche.fichier, source: fiche.source, octets: fiche.octets, zoomMax: fiche.zoomMax, publieLe: fiche.publieLe },
      // Relue au plus une fois par heure (la carte change une fois par mois).
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
    );
  }

  const f = u.searchParams.get("f");
  const debut = entier(u.searchParams.get("debut"));
  const fin = entier(u.searchParams.get("fin"));
  if (!f || !NOM_FICHIER.test(f) || debut === null || fin === null || fin < debut || fin - debut + 1 > MORCEAU_MAX) {
    return erreur("demande_invalide", 400);
  }

  let r: Response;
  try {
    r = await chercher(DEPOT + f, { headers: { Range: `bytes=${debut}-${fin}` } });
  } catch {
    return erreur("carte_indisponible", 502);
  }
  if (r.status === 404) return erreur("version_retiree", 404);
  // 200 = le serveur a ignoré la plage : on ne renvoie pas tout le fichier.
  if (r.status !== 206) {
    await r.body?.cancel().catch(() => undefined);
    return erreur("carte_indisponible", 502);
  }
  const octets = await r.arrayBuffer();
  if (octets.byteLength !== fin - debut + 1) return erreur("carte_indisponible", 502);
  return new Response(octets, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
