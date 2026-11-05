import type { Metadata } from "next";
import { DemoLanceur } from "@/components/DemoLanceur";
import { Logo } from "@/components/ui";
import { SITE_NAME } from "@/lib/site";

// Démonstration Mont-Dore (lib/demo.ts) : page d'entrée, à ouvrir avant
// une présentation. Rien ne mène ici depuis l'appli.
export const metadata: Metadata = {
  title: `Démonstration Mont-Dore · ${SITE_NAME}`,
  robots: { index: false, follow: false },
};

export default function DemoPage() {
  return (
    <main className="min-h-[100dvh] flex flex-col px-5 pt-8 pb-10">
      <Logo />
      <h1 className="mt-8 font-display font-semibold text-[24px] leading-tight">Démonstration Mont-Dore</h1>
      <p className="mt-3 text-[15.5px] leading-relaxed text-mist">
        Un scénario fictif : une matinée de fortes pluies au Mont-Dore, avec des signalements à différents niveaux de
        fiabilité, une annonce et des travaux « Vérifié par Ville du Mont-Dore (exemple) ».
      </p>
      <ul className="mt-5 flex flex-col gap-2.5 text-[14.5px] leading-relaxed text-mist-dim list-disc pl-5">
        <li>Tout reste sur cet appareil : rien n&apos;est envoyé ni enregistré, et la vraie carte ne change pas.</li>
        <li>La position est simulée à Boulari, près de la mairie.</li>
        <li>
          Tu peux signaler, confirmer ou dire « C&apos;est terminé » pour montrer les gestes : tout disparaît en
          quittant.
        </li>
        <li>Les alertes, le trajet favori et la modération ne fonctionnent pas pendant la démo.</li>
        <li>Pour quitter : « Quitter » dans le bandeau du haut, ou ferme l&apos;onglet.</li>
      </ul>
      <div className="mt-8">
        <DemoLanceur />
      </div>
    </main>
  );
}
