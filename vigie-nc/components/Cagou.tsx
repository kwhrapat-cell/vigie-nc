// Mascotte de Vigie NC : un cagou, l'oiseau de la Calédonie, qui veille
// sur la route. Dessin original (bec et pattes couleur terre rouge, comme
// le logo). Décoratif : caché aux lecteurs d'écran, sauf `titre`.

export function Cagou({ size = 64, titre, className = "" }: { size?: number; titre?: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      role={titre ? "img" : undefined}
      aria-label={titre}
      aria-hidden={titre ? undefined : true}
    >
      {/* huppe */}
      <g fill="none" stroke="#B9C6CA" strokeWidth="2.6" strokeLinecap="round">
        <path d="M27 15 C21 11 15 11 9 14" />
        <path d="M28 17 C22 15 16 16 11 19.5" />
        <path d="M29 19.5 C24 19 19 21 15 24.5" />
      </g>
      {/* pattes */}
      <g stroke="#E8622F" strokeWidth="2.4" strokeLinecap="round" fill="none">
        <path d="M30 50 L28.5 59 M28.5 59 L25 60.5 M28.5 59 L31 60.8" />
        <path d="M37 50 L38 59 M38 59 L35 60.8 M38 59 L41.5 60.3" />
      </g>
      {/* corps */}
      <path d="M20 37 C20 27 27 23 34 23 C43 23 49 30 49 39 C49 47 43 52 34 52 C26 52 20 46 20 37 Z" fill="#D5DEE1" />
      {/* aile rayée */}
      <path
        d="M27 36 C29 31 36 30 41 33 C46 36 48 42 46 47 C41 49 34 48 30 44 C27.5 41.5 26.5 38.5 27 36 Z"
        fill="#9DAEB4"
      />
      <g stroke="#7F9198" strokeWidth="1.6" strokeLinecap="round" fill="none">
        <path d="M32 36.5 C35 36 38 37 40.5 39" />
        <path d="M31.5 40.5 C35 40 38.5 41.5 41.5 43.5" />
      </g>
      {/* tête, bec, œil */}
      <circle cx="34" cy="21" r="9.5" fill="#D5DEE1" />
      <path d="M42 19.5 C47 19.8 51 21 53.5 22.6 C50.5 23.6 46.5 24 42.3 23.4 Z" fill="#E8622F" />
      <circle cx="37.6" cy="19.6" r="3" fill="#B5402A" />
      <circle cx="37.6" cy="19.6" r="1.5" fill="#1A1A1A" />
      <circle cx="38.4" cy="18.8" r="0.7" fill="#fff" />
    </svg>
  );
}
