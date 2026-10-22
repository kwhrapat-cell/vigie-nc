import type { Metadata } from "next";
import Link from "next/link";
import { LegalList, LegalPage, LegalSection } from "@/components/LegalPage";
import { CONTACT_MAILTO, LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Mentions légales · Vigie NC" };

export default function MentionsLegalesPage() {
  return (
    <LegalPage title="Mentions légales" current="/mentions-legales">
      <LegalSection title="Éditeur">
        <p>
          Vigie NC est éditée par <strong>{LEGAL.editeur}</strong>, projet porté par {LEGAL.porteur},{" "}
          {LEGAL.lieu}.
        </p>
        {LEGAL.ridet && <p>RIDET : {LEGAL.ridet}</p>}
        <p>Directeur de la publication : {LEGAL.porteur}</p>
        <p>
          Contact : <a href={CONTACT_MAILTO}>{LEGAL.contact}</a>
        </p>
      </LegalSection>

      <LegalSection title="Hébergement">
        <p>
          Site hébergé par <strong>{LEGAL.hebergeur.nom}</strong>, {LEGAL.hebergeur.adresse} —{" "}
          <a href={LEGAL.hebergeur.site} target="_blank" rel="noopener noreferrer">
            vercel.com
          </a>
        </p>
        <p>
          Signalements et photos stockés par <strong>{LEGAL.base.nom}</strong>, sur des serveurs situés à{" "}
          {LEGAL.base.lieu} —{" "}
          <a href={LEGAL.base.site} target="_blank" rel="noopener noreferrer">
            supabase.com
          </a>
        </p>
      </LegalSection>

      <LegalSection title="Nature du service">
        <p>
          Vigie NC est un service <strong>gratuit et citoyen</strong>{" "}d&apos;information sur l&apos;état des routes en
          Nouvelle-Calédonie. Ce n&apos;est pas un service officiel : il n&apos;est rattaché ni au gouvernement, ni
          aux communes, ni aux services de secours.
        </p>
        <p>
          Les signalements sont publiés par les usagers, de façon anonyme. Ils sont indicatifs et ne remplacent pas
          les consignes officielles. Voir les{" "}
          <Link href="/conditions">conditions d&apos;utilisation</Link>.
        </p>
      </LegalSection>

      <LegalSection title="Signaler un contenu">
        <p>
          Une photo ou un texte pose problème (visage, plaque, nom, insulte…) ? Utilise le bouton{" "}
          <strong>« Signaler un contenu »</strong> sur la fiche du signalement, ou écris à{" "}
          <a href={CONTACT_MAILTO}>{LEGAL.contact}</a> avec le lien du signalement (bouton « Partager »). Le contenu
          est retiré au plus vite.
        </p>
      </LegalSection>

      <LegalSection title="Crédits">
        <LegalList>
          <li>
            Fonds de carte © contributeurs{" "}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
              OpenStreetMap
            </a>{" "}
            ; imagerie satellite © Esri.
          </li>
          <li>Noms de lieux : Nominatim (OpenStreetMap).</li>
          <li>Vigilance météo : vignette officielle de Météo-France Nouvelle-Calédonie (meteo.nc).</li>
        </LegalList>
      </LegalSection>
    </LegalPage>
  );
}
