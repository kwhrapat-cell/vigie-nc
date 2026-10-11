"use client";

// Nom lisible d'une position (« RT1, Dumbéa ») à partir d'OpenStreetMap
// (service Nominatim). Appelé une seule fois par signalement, au moment de
// l'étape « Localisation » : usage modéré, conforme aux règles du service.
// En cas d'échec, l'appli affiche simplement les coordonnées.

interface NominatimResult {
  name?: string;
  namedetails?: Record<string, string>;
  address?: Record<string, string>;
}

const cache = new Map<string, string | null>();

function shortRoad(name: string | undefined, ref: string | undefined): string | null {
  // Les routes territoriales sont connues par leur numéro : « RT1 ».
  if (ref && /^RT\s?\d+/i.test(ref)) return ref.replace(/\s+/g, "").toUpperCase();
  if (!name) return null;
  const rt = name.match(/^Route Territoriale\s*(?:n°\s*)?(\d+)/i);
  if (rt) return `RT${rt[1]}`;
  const rp = name.match(/^Route Provinciale\s*(?:n°\s*)?(\d+)/i);
  if (rp) return `RP${rp[1]}`;
  return name;
}

export async function reversePlace(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (cache.has(key)) return cache.get(key) ?? null;

  const url =
    "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&namedetails=1" +
    `&accept-language=fr&lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    clearTimeout(timer);
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as NominatimResult;
    const a = data.address ?? {};

    const road = shortRoad(a.road ?? data.name, data.namedetails?.ref);
    const locality =
      a.suburb ?? a.village ?? a.town ?? a.city ?? a.municipality ?? a.county ?? null;

    const parts = [road, locality].filter(
      (p, i, arr): p is string => Boolean(p) && arr.indexOf(p) === i,
    );
    const place = parts.length ? parts.join(", ").slice(0, 80) : null;
    cache.set(key, place);
    return place;
  } catch {
    return null;
  }
}

/**
 * Cherche un lieu en Nouvelle-Calédonie à partir de son nom (« Radier de la
 * Coulée, Mont-Dore »). Essaie les recherches dans l'ordre et renvoie la
 * première trouvée. Seul le nom du lieu est envoyé, jamais un texte copié.
 */
export async function searchPlace(queries: string[]): Promise<{ lat: number; lng: number; query: string } | null> {
  for (const q of queries.slice(0, 4)) {
    const url =
      "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=nc&accept-language=fr" +
      `&viewbox=163.5,-19.5,168.2,-22.8&bounded=1&q=${encodeURIComponent(q)}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
      clearTimeout(timer);
      if (res.ok) {
        const data = (await res.json()) as { lat: string; lon: string }[];
        if (data[0]) return { lat: Number(data[0].lat), lng: Number(data[0].lon), query: q };
      }
    } catch {
      // réseau : on essaie la recherche suivante
    }
    // Règle du service : pas plus d'une requête par seconde
    await new Promise((r) => setTimeout(r, 1100));
  }
  return null;
}
