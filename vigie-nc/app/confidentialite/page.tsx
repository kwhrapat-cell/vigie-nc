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
          <li>
            Visages détectés floutés et position cachée des photos retirée, sur ton téléphone, avant l&apos;envoi.
            Photos effacées après 7 jours.
          </li>
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
          <li>
            Si tu les ajoutes : la description, le niveau de risque et la photo (visages détectés floutés, sans
            métadonnées). Le floutage automatique peut manquer un visage lointain : photographie la route, pas les
            gens.
          </li>
          <li>
            Pour une info relayée (Facebook, radio, SMS) : seulement le type, le lieu, l&apos;heure et la provenance.
            Le texte que tu colles reste sur ton téléphone.
          </li>
          <li>
            Quand plusieurs personnes décrivent le même événement : un résumé automatique de leurs textes (voir
            « Le résumé automatique » plus bas).
          </li>
        </LegalList>
        <p>Ces informations sont publiques : tout le monde peut les voir sur la carte. Jamais qui les a envoyées.</p>
        <p>
          Le <strong>SOS ne publie rien</strong> : ta position est seulement mise dans le message que tu envoies
          toi-même à tes contacts (SMS ou autre appli). Vigie NC ne la reçoit pas.
        </p>
      </LegalSection>

      <LegalSection title="Le résumé automatique (IA)">
        <p>
          Si le même événement est déjà signalé tout près, ton signalement compte comme une confirmation et ton
          texte est gardé à part, comme <strong>témoignage</strong>{" "}: personne ne peut le lire depuis
          l&apos;appli. Le premier texte reste affiché sur la fiche.
        </p>
        <p>
          Dès que 2 personnes au moins ont écrit, leurs textes sont envoyés à <strong>Anthropic</strong>{" "}
          (États-Unis), l&apos;entreprise qui fait l&apos;intelligence artificielle Claude, avec le type
          d&apos;événement, le nom du lieu et l&apos;heure, pour écrire le résumé d&apos;une ou deux phrases affiché
          sur la fiche. <strong>Jamais qui les a écrits</strong>, ni photo, ni position. Anthropic ne s&apos;en sert
          pas pour entraîner ses modèles et les efface sous 30 jours (plus longtemps seulement en cas d&apos;abus).
        </p>
        <p>
          Le résumé est public, comme la description, et présenté comme « résumé automatique ». Il est masqué en même
          temps que la photo et le texte si un contenu est signalé.
        </p>
      </LegalSection>

      <LegalSection title="L'identifiant anonyme de ton téléphone">
        <p>
          À la première utilisation, {LEGAL.base.nom} ouvre pour ton téléphone une <strong>session anonyme</strong>{" "}:
          un identifiant tiré au hasard, sans nom, sans e-mail, sans numéro de téléphone. Ton navigateur le garde.
          Les tables de Vigie NC n&apos;en gardent qu&apos;une <strong>empreinte</strong>{" "}(impossible à retourner),
          que personne ne peut lire depuis l&apos;appli.
        </p>
        <p>
          Elle sert uniquement à : limiter les abus (un signalement par minute et 20 par jour, 5 photos par heure),
          compter un seul vote par personne, reconnaître tes propres signalements pour que tu puisses les clore, et
          compter combien de téléphones utilisent l&apos;appli (voir « Chiffres d&apos;utilisation » plus bas).
        </p>
        <p>
          Comme pour toute connexion, {LEGAL.base.nom}{" "}note avec la session l&apos;adresse IP et le type de
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

      <LegalSection title="Chiffres d'utilisation">
        <p>
          Pour savoir si Vigie NC sert (et le montrer aux mairies et aux financeurs), l&apos;appli compte, dans sa
          propre base et sans outil extérieur, les jours où ton téléphone l&apos;ouvre et l&apos;heure de sa dernière
          activité, sous l&apos;empreinte de ta session anonyme. Jamais d&apos;adresse IP, jamais de position, aucun
          cookie.
        </p>
        <p>
          Si tu arrives par un lien suivi (une affiche, un signalement partagé…), sa provenance est comptée parmi les
          nouveaux visiteurs du jour, sans lien avec ton téléphone.
        </p>
        <p>Seuls des totaux sont affichés (aux modérateurs) : personne ne voit qui utilise l&apos;appli ni quand.</p>
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
            Rarement, une <strong>annonce importante pour toute la Calédonie</strong>{" "}(cyclone, évacuation…) part
            vers tous les téléphones abonnés : ton lieu n&apos;est pas utilisé pour elle.
          </li>
          <li>
            Tout est effacé dès que tu touches « Désactiver », ou quand ton téléphone n&apos;accepte plus les
            notifications.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Le mode conduite (si tu l'actives)">
        <p>
          Pendant le mode conduite, ta position est suivie <strong>sur ton téléphone</strong>{" "}pour savoir dans quel
          sens tu roules et quels dangers confirmés sont devant toi. Elle part seulement pour chercher les
          signalements autour de toi, comme sur la carte (environ toutes les 90 secondes ou tous les 1,5 km), et
          n&apos;est <strong>pas enregistrée</strong>. Le choix des dangers à annoncer et la voix se font sur le
          téléphone.
        </p>
        <LegalList>
          <li>
            Sur le site, tout s&apos;arrête quand tu touches « Arrêter » ou quittes la carte. L&apos;écran reste allumé
            pendant ce temps.
          </li>
          <li>
            Dans l&apos;appli Android, le mode conduite continue écran éteint. Une notification reste affichée tant
            qu&apos;il tourne, avec un bouton « Arrêter ».
          </li>
          <li>
            Si tu actives « Démarrer tout seul en voiture » (appli Android), la détection d&apos;activité des services
            Google du téléphone prévient l&apos;appli quand tu montes dans un véhicule ou en descends. Il faut alors
            autoriser la position « Toujours » et l&apos;« Activité physique ». La position n&apos;est utilisée que
            pendant que tu roules, de la même façon. L&apos;appli s&apos;arrête quand tu sors du véhicule, ou après 15
            minutes sans bouger. Tu peux couper ce réglage à tout moment.
          </li>
          <li>Tes réglages (voix, portée, trafic dense, démarrage tout seul) restent sur ton téléphone.</li>
          <li>
            <strong>Point route</strong>{" "}(site) : au démarrage, ou quand tu touches le bouton « route »,
            ton téléphone choisit les signalements sur les 10 km devant toi et envoie à notre serveur seulement
            leur identifiant et leur distance, avec ta session anonyme (pour limiter les abus : un par minute, 40 par
            jour). Le serveur demande à Anthropic (intelligence artificielle Claude) d&apos;en faire une phrase à
            lire, à partir d&apos;informations déjà publiques sur la carte : type, lieu, distance, fiabilité et
            résumé des témoins. <strong>Ta position ne part pas.</strong>
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Ce qui reste sur ton téléphone">
        <LegalList>
          <li>Tes contacts d&apos;urgence (SOS) : jamais envoyés à Vigie NC.</li>
          <li>Tes réglages (rayon, fond de carte) et le texte collé pour relayer une info.</li>
          <li>
            « Mon impact » : la liste de tes 30 derniers signalements (identifiant, type, lieu, heure), le nombre de
            tes réponses « Toujours là » / « C&apos;est terminé », les jours où tu as ouvert l&apos;appli et tes
            badges. Ça sert à te dire quand d&apos;autres confirment ce que tu as signalé : l&apos;appli relit ces
            signalements comme n&apos;importe quel signalement public. Rien de tout ça n&apos;est envoyé, et il
            n&apos;y a pas de classement entre utilisateurs. Aussi : les signalements pour lesquels l&apos;appli
            t&apos;a déjà demandé « Tu passes par là ? », pour ne pas te le redemander.
          </li>
          <li>
            Les derniers signalements et annonces affichés et quelques morceaux de carte, pour pouvoir les revoir
            sans réseau (ce sont des informations publiques), les annonces que tu as réduites et les travaux
            déjà montrés aujourd&apos;hui dans le bandeau (pour ne pas te les remontrer avant demain).
          </li>
          <li>
            Sur iPhone, l&apos;appli ajoutée à l&apos;écran d&apos;accueil garde ses propres réglages et contacts, à
            part de ceux de Safari.
          </li>
        </LegalList>
        <p>
          Pas de cookies, pas de publicité, pas d&apos;outil de mesure d&apos;audience extérieur (seulement le
          comptage anonyme décrit plus haut).
        </p>
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
            Les jours où ton téléphone a ouvert l&apos;appli : 35 jours, puis il ne reste que les totaux par jour. Le
            premier et le dernier jour de visite (pour reconnaître un nouveau visiteur) : effacés après 90 jours sans
            visite.
          </li>
          <li>
            Les photos sont effacées 7 jours après leur envoi. Pendant un épisode cyclonique, ce délai peut être
            allongé (90 jours au plus) pour suivre l&apos;évolution des zones touchées.
          </li>
          <li>
            Une photo ou un texte masqué par la modération n&apos;est plus affiché. Le texte est gardé à part 90 jours
            au plus, au cas où le masquage serait une erreur ; la photo est effacée comme les autres.
          </li>
          <li>
            Les témoignages (le texte de chaque personne, qui sert au résumé automatique) : effacés 7 jours après leur
            envoi. Le résumé reste avec le signalement, comme la description.
          </li>
          <li>
            La trace des points route demandés (empreinte de ta session anonyme et heure, pour limiter les abus) :
            effacée après 24 heures.
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
          <li>
            OpenStreetMap (ou MapTiler) : fonds de carte, et nom du lieu à partir de la position du repère
            (OpenStreetMap).
          </li>
          <li>Esri : fond de carte satellite si tu le choisis, et plan de secours si le plan habituel ne répond plus.</li>
          <li>Météo-France Nouvelle-Calédonie : vignette de vigilance sur l&apos;écran Alertes.</li>
          <li>
            jsDelivr et Google : téléchargement de l&apos;outil de floutage des visages, la première fois que tu
            ajoutes une photo. La photo, elle, est floutée sur ton téléphone et ne leur est pas envoyée.
          </li>
          <li>Google Maps : seulement si tu touches « Voir dans Maps ».</li>
          <li>
            Services Google du téléphone (appli Android) : détection « en voiture », seulement si tu actives le
            démarrage tout seul du mode conduite.
          </li>
          <li>WhatsApp : seulement si tu touches « WhatsApp » pour partager l&apos;appli.</li>
          <li>Google, Apple ou Mozilla : acheminent les alertes jusqu&apos;à ton téléphone, si tu les actives.</li>
          <li>Cloudflare (Turnstile) : vérifie qu&apos;une vraie personne ouvre la session anonyme, si cette protection est active.</li>
          <li>
            Anthropic (intelligence artificielle Claude) : écrit le résumé automatique à partir des textes des témoins,
            et le point route du mode conduite à partir des signalements devant toi, sans savoir qui tu es ni où tu
            es.
          </li>
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
