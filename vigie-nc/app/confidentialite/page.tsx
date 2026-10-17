import type { Metadata } from "next";
import { LegalList, LegalPage, LegalSection } from "@/components/LegalPage";
import { CONTACT_MAILTO, LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Confidentialité · Vigie NC" };

export default function ConfidentialitePage() {
  return (
    <LegalPage
      title="Confidentialité"
      current="/confidentialite"
      intro={
        <LegalList>
          <li>Pas de compte, pas de nom : personne ne sait qui a signalé quoi.</li>
          <li>Visages floutés et position cachée des photos retirée, sur ton téléphone, avant l&apos;envoi.</li>
          <li>Aucune publicité, aucune revente, aucune exploitation commerciale des données.</li>
        </LegalList>
      }
    >
      <LegalSection title="Qui est responsable ?">
        <p>
          {LEGAL.editeur} ({LEGAL.porteur}), {LEGAL.lieu}. Contact :{" "}
          <a href={CONTACT_MAILTO}>{LEGAL.contact}</a>
        </p>
      </LegalSection>

      <LegalSection title="Ce qui est publié quand tu signales">
        <LegalList>
          <li>Le type d&apos;événement, la position du repère, le nom du lieu et l&apos;heure.</li>
          <li>Si tu les ajoutes : la description, le niveau de risque et la photo (visages floutés, sans métadonnées).</li>
          <li>
            Pour une info relayée (Facebook, radio, SMS) : seulement le type, le lieu, l&apos;heure et la provenance.
            Le texte que tu colles reste sur ton téléphone.
          </li>
          <li>
            Pour un SOS : ta position, visible sur la carte pendant 2 heures au plus (ou jusqu&apos;à ce que tu
            indiques ne plus avoir besoin d&apos;aide), sans ton nom.
          </li>
        </LegalList>
        <p>Ces informations sont publiques : tout le monde peut les voir sur la carte. Jamais qui les a envoyées.</p>
      </LegalSection>

      <LegalSection title="L'identifiant anonyme de ton téléphone">
        <p>
          À la première utilisation, {LEGAL.base.nom} ouvre pour ton téléphone une <strong>session anonyme</strong> :
          un identifiant tiré au hasard, sans nom, sans e-mail, sans numéro de téléphone. Ton navigateur le garde.
          Les tables de Vigie NC n&apos;en gardent qu&apos;une <strong>empreinte</strong> (impossible à retourner),
          que personne ne peut lire depuis l&apos;appli.
        </p>
        <p>
          Elle sert uniquement à : limiter les abus (un signalement par minute et 20 par jour, 5 photos par heure),
          compter un seul vote par personne, et reconnaître tes propres signalements pour que tu puisses les clore.
        </p>
        <p>
          Comme pour toute connexion, {LEGAL.base.nom} note avec la session l&apos;adresse IP et le type de
          navigateur, pour bloquer les ouvertures de sessions en rafale. Si la protection Cloudflare Turnstile est
          active, Cloudflare vérifie en plus qu&apos;il s&apos;agit d&apos;une vraie personne, sans te demander qui tu
          es.
        </p>
      </LegalSection>

      <LegalSection title="Ta position">
        <p>
          Pour afficher les signalements autour de toi, ta position est envoyée à la base au moment de la
          recherche. Quand tu confirmes ou déclares terminé un signalement, elle est envoyée pour vérifier que tu es à
          moins de 5 km. Dans les deux cas, elle n&apos;est <strong>pas enregistrée</strong>. Seule la position
          d&apos;un signalement que tu publies est conservée.
        </p>
      </LegalSection>

      <LegalSection title="Les alertes (si tu les actives)">
        <LegalList>
          <li>
            Sont enregistrés : le lieu choisi, <strong>arrondi à environ 1 km</strong>, la distance (3, 5 ou 10 km),
            le nom que tu lui donnes si tu en mets un, et l&apos;adresse d&apos;envoi créée par ton navigateur. Rien
            qui dise qui tu es.
          </li>
          <li>
            Les alertes passent par le service de notifications de ton téléphone : Google (Android), Apple (iPhone)
            ou Mozilla (Firefox). Leur contenu est chiffré : ces services le transmettent sans pouvoir le lire.
          </li>
          <li>
            Pour ne jamais envoyer deux fois la même alerte, la base note quelle alerte est partie vers quelle
            adresse. Cette trace est effacée au bout de 7 jours.
          </li>
          <li>
            Tout est effacé dès que tu touches « Désactiver », ou quand ton téléphone n&apos;accepte plus les
            notifications.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Ce qui reste sur ton téléphone">
        <LegalList>
          <li>Tes contacts d&apos;urgence (SOS) : jamais envoyés à Vigie NC.</li>
          <li>Tes réglages (rayon, fond de carte) et le texte collé pour relayer une info.</li>
          <li>
            Sur iPhone, l&apos;appli ajoutée à l&apos;écran d&apos;accueil garde ses propres réglages et contacts, à
            part de ceux de Safari.
          </li>
        </LegalList>
        <p>Pas de cookies publicitaires, pas de mesure d&apos;audience.</p>
      </LegalSection>

      <LegalSection title="Combien de temps ?">
        <LegalList>
          <li>
            Un signalement disparaît de la carte quand il expire ou que la communauté le déclare terminé. Il est
            ensuite gardé, anonyme, pour la « mémoire du territoire » (historique des zones à risque).
          </li>
          <li>
            Le lien entre l&apos;empreinte de ton téléphone et tes signalements, votes et signalements de contenu est
            effacé 30 jours après la fin du signalement.
          </li>
          <li>
            Ta session anonyme : supprimée après 90 jours sans utilisation (avec son adresse IP). Le journal de
            sécurité des connexions est gardé 30 jours.
          </li>
          <li>Ton lieu d&apos;alerte : jusqu&apos;à ce que tu désactives les alertes.</li>
          <li>
            Une photo ou un texte masqué par la modération n&apos;est plus affiché. Il est gardé à part 90 jours au
            plus, au cas où le masquage serait une erreur.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Où sont les données ?">
        <p>
          Signalements et photos : {LEGAL.base.nom}, serveurs à {LEGAL.base.lieu}. Site : {LEGAL.hebergeur.nom}{" "}
          (États-Unis). Comme pour tout site web, ces hébergeurs voient techniquement ton adresse IP pour
          t&apos;afficher les pages.
        </p>
      </LegalSection>

      <LegalSection title="Services extérieurs utilisés par l'appli">
        <LegalList>
          <li>OpenStreetMap : fonds de carte, et nom du lieu à partir de la position du repère.</li>
          <li>Esri : fond de carte satellite, si tu le choisis.</li>
          <li>Météo-France Nouvelle-Calédonie : vignette de vigilance sur l&apos;écran Alertes.</li>
          <li>
            jsDelivr et Google : téléchargement de l&apos;outil de floutage des visages, la première fois que tu
            ajoutes une photo. La photo, elle, est floutée sur ton téléphone et ne leur est pas envoyée.
          </li>
          <li>Google Maps : seulement si tu touches « Voir dans Maps ».</li>
          <li>WhatsApp : seulement si tu touches « WhatsApp » pour partager l&apos;appli.</li>
          <li>Google, Apple ou Mozilla : acheminent les alertes jusqu&apos;à ton téléphone, si tu les actives.</li>
          <li>Cloudflare (Turnstile) : vérifie qu&apos;une vraie personne ouvre la session anonyme, si cette protection est active.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Tes droits">
        <p>
          Comme les signalements sont anonymes, nous ne pouvons pas retrouver « tes » données à partir de ton nom.
          Pour faire retirer un signalement, une photo ou un texte, envoie son lien (bouton « Partager ») à{" "}
          <a href={CONTACT_MAILTO}>{LEGAL.contact}</a>.
        </p>
        <p>
          Cette politique suit la loi Informatique et Libertés, applicable en Nouvelle-Calédonie. En cas de
          désaccord, tu peux saisir la CNIL (
          <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">
            cnil.fr
          </a>
          ).
        </p>
      </LegalSection>
    </LegalPage>
  );
}
