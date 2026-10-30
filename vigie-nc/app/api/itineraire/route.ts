// Calcul d'itinéraire du trajet favori (écran Alertes → « Mon trajet »).
// Le téléphone envoie son départ et son arrivée ARRONDIS à ~100 m, avec sa
// session anonyme : la base vérifie la session et les limites (20 calculs
// par jour, trajet_itineraire_autoriser). Le calcul est fait par un service
// OSRM gratuit sur les données OpenStreetMap (celui d'OpenStreetMap
// France/FOSSGIS, puis celui du projet OSRM en secours), appelé d'ici : ce
// service ne voit ni l'adresse IP ni l'identité du téléphone. Rien n'est
// gardé, rien n'est écrit dans les journaux.

import { NextResponse } from "next/server";
import { distanceM } from "@/lib/geo";
import { SITE_URL } from "@/lib/site";
import { isSupabaseConfigured, supabaseAvecJeton } from "@/lib/supabase";
import { arrondirPosition, dansNc, limiterPoints, Point, TRAJET_DISTANCE_MIN_M } from "@/lib/trajet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 25;

// Services OSRM (même interface) : le premier qui répond.
const SERVICES = [
  "https://routing.openstreetmap.de/routed-car/route/v1/driving/",
  "https://router.project-osrm.org/route/v1/driving/",
];
const DELAI_MS = 9_000;
// Politique d'usage des services : un nom d'appli et un contact.
const USER_AGENT = `VigieNC/1.0 (+${SITE_URL})`;

const ERREURS_BASE: Record<string, number> = {
  connexion_requise: 401,
  itineraire_trop: 429,
};

interface ReponseOsrm {
  code?: string;
  routes?: { distance?: number; duration?: number; geometry?: { coordinates?: unknown } }[];
}

function lirePosition(v: unknown): { lat: number; lng: number } | null {
  const o = (v ?? {}) as { lat?: unknown; lng?: unknown };
  if (typeof o.lat !== "number" || typeof o.lng !== "number") return null;
  if (!Number.isFinite(o.lat) || !Number.isFinite(o.lng)) return null;
  const p = arrondirPosition({ lat: o.lat, lng: o.lng });
  return dansNc(p) ? p : null;
}

/** Ligne [lat, lng] d'une réponse OSRM (GeoJSON : [lng, lat]). */
function lireLigne(coords: unknown): Point[] | null {
  if (!Array.isArray(coords) || coords.length < 2 || coords.length > 50_000) return null;
  const out: Point[] = [];
  for (const c of coords) {
    if (!Array.isArray(c) || typeof c[0] !== "number" || typeof c[1] !== "number") return null;
    out.push([c[1], c[0]]);
  }
  return out;
}

type Resultat =
  | { ok: true; points: Point[]; distanceM: number; dureeS: number | null }
  | { ok: false; raison: "introuvable" | "indisponible" };

async function demander(service: string, depart: Point, arrivee: Point): Promise<Resultat> {
  const url =
    `${service}${depart[1]},${depart[0]};${arrivee[1]},${arrivee[0]}` +
    "?overview=full&geometries=geojson&alternatives=false&steps=false";
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(DELAI_MS),
      cache: "no-store",
    });
    const corps = (await res.json().catch(() => null)) as ReponseOsrm | null;
    if (corps?.code === "NoRoute" || corps?.code === "NoSegment") return { ok: false, raison: "introuvable" };
    if (!res.ok || corps?.code !== "Ok") return { ok: false, raison: "indisponible" };
    const route = corps.routes?.[0];
    const points = lireLigne(route?.geometry?.coordinates);
    if (!route || !points) return { ok: false, raison: "indisponible" };
    return {
      ok: true,
      points,
      distanceM: typeof route.distance === "number" ? route.distance : 0,
      dureeS: typeof route.duration === "number" ? route.duration : null,
    };
  } catch {
    return { ok: false, raison: "indisponible" };
  }
}

export async function POST(req: Request) {
  let corps: { depart?: unknown; arrivee?: unknown };
  try {
    corps = (await req.json()) as typeof corps;
  } catch {
    return NextResponse.json({ erreur: "demande_invalide" }, { status: 400 });
  }
  const depart = lirePosition(corps.depart);
  const arrivee = lirePosition(corps.arrivee);
  if (!depart || !arrivee) {
    return NextResponse.json({ erreur: "trajet_hors_nc" }, { status: 400 });
  }
  if (distanceM(depart, arrivee) < TRAJET_DISTANCE_MIN_M) {
    return NextResponse.json({ erreur: "trajet_longueur" }, { status: 400 });
  }

  // Session anonyme et limites (sans base branchée, en développement : pas de contrôle).
  if (isSupabaseConfigured) {
    const jeton = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const client = jeton && jeton.length <= 4000 ? supabaseAvecJeton(jeton) : null;
    if (!client) {
      return NextResponse.json({ erreur: "connexion_requise" }, { status: 401 });
    }
    const { error } = await client.rpc("trajet_itineraire_autoriser");
    if (error) {
      const code = Object.keys(ERREURS_BASE).find((k) => error.message.includes(k)) ?? "itineraire_indisponible";
      return NextResponse.json({ erreur: code }, { status: ERREURS_BASE[code] ?? 503 });
    }
  }

  const a: Point = [depart.lat, depart.lng];
  const b: Point = [arrivee.lat, arrivee.lng];
  let introuvable = false;
  for (const service of SERVICES) {
    const r = await demander(service, a, b);
    if (r.ok) {
      return NextResponse.json(
        {
          // simplifié à ~10 m : moins lourd pour le téléphone, même tracé
          points: limiterPoints(r.points, 2_000, 10).map((p) => [
            Math.round(p[0] * 1e5) / 1e5,
            Math.round(p[1] * 1e5) / 1e5,
          ]),
          distanceM: Math.round(r.distanceM),
          dureeS: r.dureeS == null ? null : Math.round(r.dureeS),
        },
        { headers: { "cache-control": "no-store" } },
      );
    }
    if (r.raison === "introuvable") introuvable = true;
  }
  return NextResponse.json(
    { erreur: introuvable ? "itineraire_introuvable" : "itineraire_indisponible" },
    { status: introuvable ? 404 : 503 },
  );
}
