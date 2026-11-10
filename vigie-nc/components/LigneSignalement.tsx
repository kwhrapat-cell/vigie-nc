import { estChantier, libelleFinChantier } from "@/lib/chantier";
import { aEteReconfirme, estAncien } from "@/lib/fraicheur";
import { formatAgeShort, formatDistance } from "@/lib/geo";
import type { Report } from "@/lib/types";
import { ReliabilityBadge, TypeTile } from "./ui";

/**
 * Contenu d'une ligne de signalement, le même partout (liste de l'accueil,
 * fil de l'écran Alertes) : icône, type et fiabilité, puis l'heure en clair
 * (c'est elle qui dit si l'info vaut encore), puis le lieu et la distance.
 * Le cadre (bouton ou lien) est fourni par l'écran.
 */
export function ContenuLigneSignalement({ r, tailleIcone = 38 }: { r: Report; tailleIcone?: number }) {
  // Fraîcheur (lib/fraicheur.ts) : dernière confirmation, ou « ancien »
  const ancien = estAncien(r);
  const reconfirme = aEteReconfirme(r) && r.lastConfirmedAt;
  const dist = formatDistance(r.distanceM);
  const where = r.place ?? (dist ? dist.replace(/^à /, "À ") : null);
  return (
    <>
      <TypeTile type={r.type} size={tailleIcone} />
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5">
          <b className="font-semibold text-[15px] truncate">{r.type === "sos" ? "SOS — urgence" : r.label}</b>
          {r.type !== "sos" && <ReliabilityBadge report={r} />}
        </span>
        <span className="block text-[13.5px] text-mist">
          {estChantier(r) && r.endDate
            ? `Chantier ${libelleFinChantier(r.endDate)}`
            : `Il y a ${formatAgeShort(r.createdAt)}${reconfirme ? ` · revu il y a ${formatAgeShort(reconfirme)}` : ""}`}
          {ancien && <span className="font-medium text-warn"> · ancien</span>}
        </span>
        <span className="block text-[13px] text-mist-dim truncate">
          {[where, r.place && dist ? dist : null].filter(Boolean).join(" · ")}
        </span>
      </span>
    </>
  );
}
