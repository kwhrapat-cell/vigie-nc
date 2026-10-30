/**
 * Vigilance météo officielle de Météo-France Nouvelle-Calédonie.
 *
 * On affiche la vignette que meteo.nc met à disposition pour être intégrée
 * dans d'autres sites (meteo.nc/fr/widgets-vigilance) : pas de clé, pas de
 * compte, et Météo-France la met à jour toute seule (toutes les 5 minutes).
 * La vignette ne reçoit aucune position, seulement la visite de la page.
 *
 * La météo des téléphones n'est pas utilisable ici : un site web n'a pas
 * accès à l'appli Météo du téléphone, et ce n'est pas la vigilance officielle.
 */
const WIDGET_URL = "https://meteo.nc/fr/widget-vigilance/vigilance";
export const VIGILANCE_PAGE_URL = "https://meteo.nc/fr/vigilance";

export function VigilanceMeteo({ className = "" }: { className?: string }) {
  return (
    <section
      className={`rounded-xl border border-line bg-panel px-3 pt-2.5 pb-1 ${className}`}
      aria-labelledby="vigilance-titre"
    >
      {/* Sur la carte (ordinateur), la vignette est plus étroite : la source
          passe proprement à la ligne au lieu de couper le titre. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <h2 id="vigilance-titre" className="font-display font-semibold text-[15.5px]">
          Vigilance météo
        </h2>
        <span className="text-[12.5px] text-mist-dim">Source officielle · Météo-France</span>
      </div>

      <div className="mt-2 flex justify-center">
        {/* Fond clair : la vignette est faite pour des pages blanches. */}
        <div className="w-[302px] max-w-full h-[122px] overflow-hidden rounded-lg bg-white">
          <iframe
            src={WIDGET_URL}
            title="Vigilance météo de Météo-France Nouvelle-Calédonie"
            width={302}
            height={122}
            loading="lazy"
            referrerPolicy="no-referrer"
            // La vignette a besoin de ses scripts ; elle ne peut pas faire
            // quitter l'appli (pas de navigation de la page principale).
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            className="block w-full h-full border-0"
          />
        </div>
      </div>

      <a
        href={VIGILANCE_PAGE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 flex min-h-[44px] items-center justify-between gap-2 text-[14px] font-medium text-lagoon"
      >
        <span>Détail par phénomène et conseils sur meteo.nc</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 shrink-0" aria-hidden>
          <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
    </section>
  );
}
