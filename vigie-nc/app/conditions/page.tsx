import type { Metadata } from "next";
import { LegalList, LegalPage, LegalSection } from "@/components/LegalPage";
import { CONTACT_MAILTO, LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Conditions d'utilisation · Vigie NC" };

export default function ConditionsPage() {
  return (
    <LegalPage
      title="Conditions d'utilisation"
      current="/conditions"
      intro={
        <p>
          Vigie NC est une carte <strong>gratuite et citoyenne</strong> de l&apos;état des routes en
          Nouvelle-Calédonie. En l&apos;utilisant, tu acceptes ces règles simples.
        </p>
      }
    >
      <LegalSection title="1. Une information indicative">
        <p>
          Les signalements sont faits par des usagers. Sauf la mention <strong>« Vérifié »</strong> (source
          officielle), ils ne sont pas contrôlés : ils peuvent être faux, incomplets ou déjà dépassés. Une route
          affichée sans signalement n&apos;est pas forcément dégagée.
        </p>
        <p>
          Vigie NC <strong>ne remplace pas les consignes officielles</strong> (Sécurité civile, Météo-France
          Nouvelle-Calédonie, gendarmerie, police, communes). En cas de doute, ne t&apos;engage pas : adapte ta
          conduite et respecte le code de la route.
        </p>
        <p>
          Les alertes sur le téléphone peuvent arriver en retard ou pas du tout (téléphone éteint, économie de
          batterie, pas de réseau). Ne compte pas uniquement sur elles.
        </p>
        <p>
          Les annonces pour toute la Calédonie (bandeau en haut de la carte) sont publiées par l&apos;équipe de
          Vigie NC. Quand elles citent une source, suis d&apos;abord les consignes de cette source.
        </p>
      </LegalSection>

      <LegalSection title="2. Pas de téléphone en conduisant">
        <p>Signale à l&apos;arrêt, en sécurité, ou demande à un passager de le faire.</p>
      </LegalSection>

      <LegalSection title="3. Urgences">
        <p>
          Vigie NC ne prévient pas les secours à ta place. En cas d&apos;urgence, appelle le{" "}
          <a href="tel:15">15</a> (SAMU), le <a href="tel:17">17</a> (gendarmerie, police) ou le{" "}
          <a href="tel:18">18</a> (pompiers).
        </p>
      </LegalSection>

      <LegalSection title="4. Ce que tu publies">
        <p>En publiant, tu t&apos;engages à :</p>
        <LegalList>
          <li>signaler ce que tu as vu sur place, ou relayer une info en indiquant d&apos;où elle vient ;</li>
          <li>décrire la route, pas les personnes : ni nom, ni plaque, ni visage reconnaissable, ni numéro de téléphone ;</li>
          <li>ne pas publier d&apos;insultes, d&apos;accusations, d&apos;images choquantes ni de publicité ;</li>
          <li>ne pas lancer de fausse alerte.</li>
        </LegalList>
        <p>
          Vigie NC s&apos;en tient aux informations sur la route et la météo : pas d&apos;incivilités, pas de
          véhicules volés.
        </p>
      </LegalSection>

      <LegalSection title="5. Modération">
        <LegalList>
          <li>
            Chacun peut <strong>signaler un contenu</strong> depuis la fiche d&apos;un signalement. Après deux
            signalements, la photo et le texte sont masqués automatiquement.
          </li>
          <li>
            Un événement fini ou faux disparaît grâce aux votes « C&apos;est terminé » des personnes à moins de 5 km.
            Pour un danger (accident, route coupée, inondation, danger, météo), il faut l&apos;avis d&apos;au moins 2
            personnes ; un signalement « Vérifié » ne se retire que par la modération.
          </li>
          <li>
            {LEGAL.editeur} peut masquer ou retirer tout contenu qui ne respecte pas ces règles.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="6. Responsabilité">
        <p>
          Vigie NC est fournie gratuitement, telle quelle. Nous faisons de notre mieux pour qu&apos;elle soit utile
          et disponible, sans pouvoir garantir l&apos;exactitude des signalements ni un fonctionnement sans
          interruption. Chacun reste responsable de ses décisions sur la route et de ce qu&apos;il publie.
        </p>
      </LegalSection>

      <LegalSection title="7. Évolution et contact">
        <p>
          Ces conditions peuvent évoluer ; la date de mise à jour est indiquée en haut de la page. Une question,
          un problème : <a href={CONTACT_MAILTO}>{LEGAL.contact}</a>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
