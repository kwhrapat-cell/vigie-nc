import { Logo } from "./ui";

/**
 * Affiché à la place de l'appli quand la base n'est pas branchée sur le
 * site en ligne (variables d'environnement manquantes). Surtout pas de
 * mode démo ici : de faux signalements tromperaient le public.
 */
export function ServiceIndisponible() {
  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center">
      <Logo />
      <h1 className="mt-8 font-display font-semibold text-[20px]">Service momentanément indisponible</h1>
      <p className="mt-3 text-[15px] text-mist-dim leading-relaxed max-w-[320px]">
        La carte ne peut pas être affichée pour le moment. Réessaie dans quelques minutes.
      </p>
      <p className="mt-6 text-[14.5px] leading-relaxed max-w-[320px]">
        En cas d&apos;urgence, appelle le <a href="tel:15" className="underline font-semibold">15</a> (SAMU), le{" "}
        <a href="tel:17" className="underline font-semibold">17</a> (gendarmerie, police) ou le{" "}
        <a href="tel:18" className="underline font-semibold">18</a> (pompiers).
      </p>
      <a
        href="https://meteo.nc/fr/vigilance"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 min-h-[44px] flex items-center text-[14.5px] text-lagoon underline"
      >
        Vigilance météo officielle sur meteo.nc
      </a>
    </main>
  );
}
