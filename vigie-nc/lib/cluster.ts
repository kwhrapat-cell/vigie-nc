// Regroupement des signalements proches à l'écran (« pastilles chiffrées »),
// pour que la carte de toute la Calédonie reste lisible.

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface Cluster<T> {
  items: T[];
  lat: number;
  lng: number;
}

/**
 * Regroupe les éléments dont les positions à l'écran sont à moins de
 * `radiusPx` pixels du centre d'un groupe existant (méthode gloutonne, comme
 * les bibliothèques de regroupement classiques). `project` convertit une
 * position en pixels au niveau de zoom courant.
 */
export function clusterByDistance<T extends { lat: number; lng: number }>(
  items: T[],
  project: (item: T) => ScreenPoint,
  radiusPx: number,
): Cluster<T>[] {
  const groups: { items: T[]; x: number; y: number }[] = [];
  const r2 = radiusPx * radiusPx;

  for (const item of items) {
    const p = project(item);
    let best: (typeof groups)[number] | null = null;
    let bestD = Infinity;
    for (const g of groups) {
      const d = (g.x - p.x) ** 2 + (g.y - p.y) ** 2;
      if (d <= r2 && d < bestD) {
        best = g;
        bestD = d;
      }
    }
    if (best) {
      const n = best.items.length;
      best.x = (best.x * n + p.x) / (n + 1);
      best.y = (best.y * n + p.y) / (n + 1);
      best.items.push(item);
    } else {
      groups.push({ items: [item], x: p.x, y: p.y });
    }
  }

  return groups.map((g) => ({
    items: g.items,
    lat: g.items.reduce((s, i) => s + i.lat, 0) / g.items.length,
    lng: g.items.reduce((s, i) => s + i.lng, 0) / g.items.length,
  }));
}
