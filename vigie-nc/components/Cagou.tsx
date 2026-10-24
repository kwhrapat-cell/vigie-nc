import { CAGOU_SVG_INTERIEUR, CAGOU_VIEWBOX } from "@/lib/cagou";

// Mascotte de Vigie NC : un cagou, l'oiseau de la Calédonie, qui veille
// sur la route. Dessin original d'après le vrai oiseau (huppe, gros œil
// rouge-brun, bec et pattes orange), dans lib/cagou.ts. Décoratif : caché
// aux lecteurs d'écran, sauf `titre`.

export function Cagou({ size = 64, titre, className = "" }: { size?: number; titre?: string; className?: string }) {
  return (
    <svg
      viewBox={CAGOU_VIEWBOX}
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      role={titre ? "img" : undefined}
      aria-label={titre}
      aria-hidden={titre ? undefined : true}
      // Dessin fixe défini dans lib/cagou.ts (aucune donnée saisie).
      dangerouslySetInnerHTML={{ __html: CAGOU_SVG_INTERIEUR }}
    />
  );
}
