import type { Metadata } from "next";
import Link from "next/link";
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
          Vigie NC est une carte <strong>gratuite et citoyenne</strong>{" "}de l&apos;état des routes en
          Nouvelle-Calédonie. En l&apos;utilisant, tu acceptes ces règles simples.
        </p>
      }
    >
      <LegalSection title="1. Une information indicative">
        <p>
          Les signalements sont faits par des usagers. Sauf la mention <strong>« Vérifié »</strong>{" "}(source
          officielle), ils ne sont pas contrôlés : ils peuvent être faux, incomplets ou déjà dépassés. Une route
          affichée sans signalement n&apos;est pas forcément dégagée.
        </p>
        <p>
          Vigie NC <strong>ne remplace pas les consignes officielles</strong>{" "}(Sécurité civile, Météo-France
          Nouvelle-Calédonie, gendarmerie, police, communes). En cas de doute, ne t&apos;engage pas : adapte ta
          conduite et respecte le code de la route.
        </p>
        <p>
          Les alertes sur le téléphone peuvent arriver en retard ou pas du tout (téléphone éteint, économie de
          batterie, pas de réseau). Ne compte pas uniquement sur elles.
        </p>
        <p>
          Le point sur ton trajet (« Rien de signalé », « 2 dangers »…) ne dit que ce qui est signalé : l&apos;absence
          de signalement ne garantit pas que la route est dégagée. L&apos;itinéraire calculé peut différer de celui
          que tu prends vraiment.
        </p>
        <p>
          Les annonces pour toute la Calédonie (bandeau en haut de la carte) sont publiées par l&apos;équipe de
          Vigie NC. Quand elles citent une source, suis d&apos;abord les consignes de cette source.
        </p>
        <p>
          Quand plusieurs personnes décrivent le même événement, la fiche peut afficher un{" "}
          <strong>résumé automatique</strong>{" "}de leurs textes, écrit par une intelligence artificielle et
          présenté comme tel. Il reprend seulement ce que disent les témoins, mais il peut se tromper ou ne pas être à
          jour : vérifie sur place.
        </p>
      </LegalSection>

      <LegalSection title="2. Pas de téléphone en conduisant">
        <p>Signale à l&apos;arrêt, en sécurité, ou demande à un passager de le faire.</p>
        <p>
          Le mode conduite est fait pour ne rien toucher en roulant : lance-le avant de partir, avec le téléphone
          fixé sur un support ou tenu par un passager.
        </p>
      </LegalSection>

      <LegalSection title="3. Le mode conduite (annonces vocales)">
        <LegalList>
          <li>
            Seuls les <strong>dangers confirmés</strong>{" "}(par une 2e personne ou une source officielle) déjà
            signalés sur Vigie NC sont annoncés. Un danger non signalé ou pas encore confirmé n&apos;est pas annoncé :
            <strong> le silence ne veut pas dire que la route est libre</strong>.
          </li>
          <li>
            Les distances sont à vol d&apos;oiseau et « devant » est estimé d&apos;après ton sens de marche. Un danger
            sur une route voisine peut être annoncé, et un danger sur ta route peut l&apos;être en retard (virages,
            GPS, réseau).
          </li>
          <li>
            Sur le site, les annonces ne marchent que carte ouverte et écran allumé. Dans l&apos;appli Android, elles
            continuent écran éteint.
          </li>
          <li>
            Le <strong>point route</strong>{" "}(au démarrage, ou bouton « route ») cite ce qui est signalé sur
            Vigie NC sur les 10 km devant toi, confirmé ou non. Il peut être écrit par une intelligence artificielle :
            il peut se tromper ou oublier un détail, et ne remplace pas les annonces des dangers confirmés. « Rien de
            signalé » ne veut pas dire que la route est libre.
          </li>
          <li>
            Le <strong>démarrage tout seul en voiture</strong>{" "}(appli Android, à activer toi-même) peut se
            déclencher en bus ou en taxi, ou ne pas se déclencher (autorisations retirées, économie de batterie,
            téléphone qui coupe l&apos;appli, pas de réseau). Tu peux l&apos;arrêter à tout moment avec « Arrêter »
            ou le couper dans les Réglages.
          </li>
          <li>
            L&apos;appli Android est pour l&apos;instant une <strong>version de test</strong> : elle peut changer ou
            mal fonctionner.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="4. Urgences">
        <p>
          Vigie NC ne prévient pas les secours à ta place. En cas d&apos;urgence, appelle le{" "}
          <a href="tel:15">15</a> (SAMU), le <a href="tel:17">17</a> (gendarmerie, police) ou le{" "}
          <a href="tel:18">18</a> (pompiers).
        </p>
      </LegalSection>

      <LegalSection title="5. Ce que tu publies">
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

      <LegalSection title="6. Modération">
        <LegalList>
          <li>
            Chacun peut <strong>signaler un contenu</strong>{" "}depuis la fiche d&apos;un signalement. Après deux
            signalements, la photo et le texte (résumé automatique compris) sont masqués automatiquement.
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

      <LegalSection title="7. Responsabilité">
        <p>
          Vigie NC est fournie gratuitement, telle quelle. Nous faisons de notre mieux pour qu&apos;elle soit utile
          et disponible, sans pouvoir garantir l&apos;exactitude des signalements ni un fonctionnement sans
          interruption. Chacun reste responsable de ses décisions sur la route et de ce qu&apos;il publie.
        </p>
      </LegalSection>

      <LegalSection title="8. Évolution et contact">
        <p>
          Vigie NC est éditée par <strong>{LEGAL.editeur}</strong>
          {LEGAL.ridet && <> (RIDET {LEGAL.ridet})</>}. Identité complète dans les{" "}
          <Link href="/mentions-legales">mentions légales</Link>.
        </p>
        <p>
          Ces conditions peuvent évoluer ; la date de mise à jour est indiquée en haut de la page. Une question,
          un problème : <a href={CONTACT_MAILTO}>{LEGAL.contact}</a>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
