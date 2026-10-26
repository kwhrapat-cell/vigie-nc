import { TERRITOIRE } from "./territoire";

export interface LatLng {
  lat: number;
  lng: number;
}

// Vue par défaut quand la position est inconnue (Grand Nouméa en
// Calédonie) : centre du territoire, lib/territoire.ts.
export const CENTRE_PAR_DEFAUT: LatLng = TERRITOIRE.centre;

const EARTH_RADIUS_M = 6_371_008.8;

export function distanceM(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Décale un point de `northKm` vers le nord et `eastKm` vers l'est. */
export function offsetKm(origin: LatLng, northKm: number, eastKm: number): LatLng {
  const lat = origin.lat + northKm / 111.32;
  const lng = origin.lng + eastKm / (111.32 * Math.cos((origin.lat * Math.PI) / 180));
  return { lat, lng };
}

/** « à 850 m », « à 2,4 km » */
export function formatDistance(m: number | null | undefined): string | null {
  if (m == null || !Number.isFinite(m)) return null;
  if (m < 1000) return `à ${Math.max(50, Math.round(m / 50) * 50)} m`;
  const km = m / 1000;
  return `à ${km < 10 ? km.toFixed(1).replace(".", ",") : Math.round(km)} km`;
}

/** « il y a 3 min », « il y a 2 h », « il y a 3 j » */
export function formatAge(iso: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

/** Version courte pour les listes : « 3 min », « 2 h », « 3 j » */
export function formatAgeShort(iso: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.round(h / 24)} j`;
}

/** « 1 h 40 », « 25 min », « 2 jours » */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  if (m < 24 * 60) {
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest >= 5 ? `${h} h ${String(rest).padStart(2, "0")}` : `${h} h`;
  }
  const d = Math.round(m / (24 * 60));
  return `${d} jour${d > 1 ? "s" : ""}`;
}
