"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";
import { InstallApp } from "@/components/InstallApp";
import { MonImpact } from "@/components/MonImpact";
import { ShareApp } from "@/components/ShareApp";
import { Logo, ScreenHeader, SecondaryButton } from "@/components/ui";
import { Tutoriel } from "@/components/WelcomeNotice";
import { getEmergencyContacts } from "@/lib/emergency-contacts";
import { CONTACT_MAILTO, LEGAL } from "@/lib/legal";
import { MAP_STYLES } from "@/lib/map-styles";
import {
  MapStyle,
  RADIUS_OPTIONS_KM,
  RadiusKm,
  readMapStyle,
  readRadiusKm,
  saveMapStyle,
  saveRadiusKm,
} from "@/lib/preferences";
import { RELIABILITY_HEX, RELIABILITY_LEVELS } from "@/lib/reliability";
import { isSupabaseConfigured } from "@/lib/supabase";
import { NOM_APPLI } from "@/lib/territoire";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mx-4 mb-3 rounded-xl border border-line bg-panel px-4 py-3.5">
      <h2 className="font-display font-semibold text-[15px] mb-2">{title}</h2>
      {children}
    </section>
  );
}

/** Profil — pas de compte : uniquement des réglages gardés sur le téléphone. */
export default function ProfilPage() {
  const [radius, setRadius] = useState<RadiusKm>(5);
  const [contacts, setContacts] = useState(0);
  const [fond, setFond] = useState<MapStyle>("plan");
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    setRadius(readRadiusKm());
    setFond(readMapStyle());
    setContacts(getEmergencyContacts().length);
  }, []);

  return (
    <main className="min-h-[100dvh] pb-nav">
      <ScreenHeader title="Profil" subtitle="Sans compte · anonyme" />

      <MonImpact />

      <Card title="Ma zone surveillée">
        <p className="text-[13.5px] text-mist-dim mb-2.5">
          Rayon autour de toi pour la carte et les alertes. Pour la route, 3 à 5 km permettent de voir ce qui est
          signalé sur les prochains kilomètres.
        </p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Rayon par défaut">
          {RADIUS_OPTIONS_KM.map((km) => (
            <button
              key={km}
              type="button"
              role="radio"
              aria-checked={radius === km}
              onClick={() => {
                setRadius(km);
                saveRadiusKm(km);
              }}
              className={`rounded-lg py-2.5 text-[15px] font-medium border ${
                radius === km ? "bg-primary border-primary text-white" : "border-line bg-panel-2 text-mist-dim"
              }`}
            >
              {km} km
            </button>
          ))}
        </div>
      </Card>

      {/* Rangé ici pour alléger la carte de l'accueil */}
      <Card title="Fond de carte">
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Fond de carte">
          {(Object.keys(MAP_STYLES) as MapStyle[]).map((st) => {
            const choisi = fond === st;
            return (
              <button
                key={st}
                type="button"
                role="radio"
                aria-checked={choisi}
                onClick={() => {
                  setFond(st);
                  saveMapStyle(st);
                }}
                className={`min-h-[48px] rounded-lg border px-3 py-2 text-left ${
                  choisi ? "bg-primary/15 border-primary" : "border-line bg-panel-2"
                }`}
              >
                <span className={`block text-[15px] font-semibold ${choisi ? "text-mist" : "text-mist-dim"}`}>
                  {MAP_STYLES[st].label}
                </span>
                <span className="block text-[13.5px] text-mist-dim">{MAP_STYLES[st].hint}</span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card title="Contacts d'urgence (SOS)">
        <p className="text-[13.5px] text-mist-dim">
          {contacts > 0
            ? `${contacts} contact${contacts > 1 ? "s" : ""} enregistré${contacts > 1 ? "s" : ""}, uniquement sur ce téléphone.`
            : "Aucun contact pour l'instant. En cas de SOS, un SMS avec ta position leur est préparé."}
        </p>
        <div className="mt-2.5 flex gap-2">
          <Link href="/contacts" className="flex-1 rounded-lg border border-line bg-panel-2 py-2.5 text-center text-[14.5px] font-medium">
            {contacts > 0 ? "Gérer mes contacts" : "Ajouter un contact"}
          </Link>
          <Link href="/sos" className="rounded-lg bg-danger px-4 py-2.5 text-center text-[14.5px] font-semibold text-white">
            SOS
          </Link>
        </div>
      </Card>

      <Card title="Niveaux de fiabilité">
        <ul className="flex flex-col gap-2">
          {RELIABILITY_LEVELS.map((l) => (
            <li key={l.level} className="flex items-center gap-2.5 text-[14.5px]">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: RELIABILITY_HEX[l.level] }} />
              <span className="font-medium" style={{ color: RELIABILITY_HEX[l.level] }}>
                {l.label}
              </span>
              <span className="text-mist-dim">· {l.rule}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[13px] text-mist-dim">Plus c&apos;est confirmé, plus c&apos;est mis en avant.</p>
      </Card>

      <Card title="Installer l'appli">
        <p className="text-[13.5px] text-mist-dim mb-2.5">
          Une icône sur ton écran d&apos;accueil pour ouvrir {NOM_APPLI} en un geste, comme une appli. Rien à télécharger
          sur le Play Store ou l&apos;App Store.
        </p>
        <InstallApp />
      </Card>

      <Card title="Les gestes de base">
        <p className="text-[13.5px] text-mist-dim mb-2.5">
          Voir ce qui est signalé, signaler en 2 étapes, confirmer en passant : la petite démo de l&apos;accueil.
        </p>
        <SecondaryButton onClick={() => setDemo(true)}>Revoir la démo</SecondaryButton>
      </Card>

      <Card title={`Fais connaître ${NOM_APPLI}`}>
        <p className="text-[13.5px] text-mist-dim mb-2.5">
          Plus on est nombreux à signaler, plus la carte est fiable. Envoie l&apos;appli à ta famille, tes collègues,
          ton quartier.
        </p>
        <ShareApp />
        <Link href="/affiche" className="mt-2.5 inline-block text-[14px] text-lagoon underline">
          Voir et partager l&apos;affiche
        </Link>
      </Card>

      <Card title="Confidentialité">
        <ul className="flex flex-col gap-1.5 text-[13.5px] text-mist-dim leading-relaxed list-disc pl-4">
          <li>Pas de compte, pas de nom : les signalements sont anonymes.</li>
          <li>Ta position sert à chercher les signalements autour de toi, sans être enregistrée. Seule celle d&apos;un signalement que tu publies est gardée.</li>
          <li>
            Les visages détectés sont floutés et la position cachée dans les photos est retirée avant l&apos;envoi ;
            les photos sont effacées après 7 jours.
          </li>
          <li>L&apos;identifiant de ton téléphone n&apos;est jamais public : la base n&apos;en garde qu&apos;une empreinte.</li>
          <li>Aucune exploitation commerciale des données.</li>
        </ul>
        <Link href="/confidentialite" className="mt-2.5 inline-block text-[14px] text-lagoon underline">
          Lire la politique de confidentialité
        </Link>
      </Card>

      <Card title="À savoir">
        <p className="text-[13.5px] text-mist-dim leading-relaxed">
          Les signalements viennent des usagers : ils sont indicatifs et ne remplacent pas les consignes
          officielles. En cas d&apos;urgence, appelle le 15, le 17 ou le 18.
        </p>
        <nav aria-label="Informations légales" className="mt-2.5 flex flex-col divide-y divide-line border-y border-line">
          {[
            { href: "/conditions", label: "Conditions d'utilisation" },
            { href: "/confidentialite", label: "Confidentialité" },
            { href: "/mentions-legales", label: "Mentions légales" },
          ].map((l) => (
            <Link key={l.href} href={l.href} className="flex items-center justify-between py-3 text-[15px]">
              {l.label}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-mist-dim" aria-hidden="true">
                <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          ))}
        </nav>
        <p className="mt-2.5 text-[13px] text-mist-dim">
          Contact : <a href={CONTACT_MAILTO} className="text-lagoon underline">{LEGAL.contact}</a>
        </p>
      </Card>

      <section className="mx-4 mt-5 mb-4 flex flex-col items-center text-center">
        <Logo withTagline />
        <p className="mt-2 text-[12.5px] text-mist-dim">
          Gratuit pour tous · développé en Nouvelle-Calédonie par {LEGAL.editeur}
          <br />
          {isSupabaseConfigured ? "Données en direct" : "Mode démo : rien n'est enregistré"}
        </p>
        <Link href="/moderation" className="mt-3 px-3 py-2 text-[13px] text-mist-dim/70 underline">
          Espace modérateur
        </Link>
      </section>

      {demo && <Tutoriel mode="revoir" onFermer={() => setDemo(false)} />}

      <BottomNav />
    </main>
  );
}
