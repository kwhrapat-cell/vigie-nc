"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";
import { Logo, ScreenHeader } from "@/components/ui";
import { getEmergencyContacts } from "@/lib/emergency-contacts";
import { RADIUS_OPTIONS_KM, RadiusKm, readRadiusKm, saveRadiusKm } from "@/lib/preferences";
import { RELIABILITY_HEX, RELIABILITY_LEVELS } from "@/lib/reliability";
import { isSupabaseConfigured } from "@/lib/supabase";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mx-4 mb-3 rounded-xl border border-line bg-panel px-4 py-3.5">
      <h2 className="font-display font-semibold text-[14px] mb-2">{title}</h2>
      {children}
    </section>
  );
}

/** Profil — pas de compte : uniquement des réglages gardés sur le téléphone. */
export default function ProfilPage() {
  const [radius, setRadius] = useState<RadiusKm>(5);
  const [contacts, setContacts] = useState(0);

  useEffect(() => {
    setRadius(readRadiusKm());
    setContacts(getEmergencyContacts().length);
  }, []);

  return (
    <main className="min-h-[100dvh] pb-nav">
      <ScreenHeader title="Profil" subtitle="Sans compte · anonyme" />

      <Card title="Ma zone surveillée">
        <p className="text-[11.5px] text-mist-dim mb-2.5">
          Rayon autour de toi pour la carte et les alertes. Pour la route, 3 à 5 km permettent de savoir si les
          prochains kilomètres sont dégagés.
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
              className={`rounded-lg py-2.5 text-[13px] font-medium border ${
                radius === km ? "bg-primary border-primary text-white" : "border-line bg-panel-2 text-mist-dim"
              }`}
            >
              {km} km
            </button>
          ))}
        </div>
      </Card>

      <Card title="Contacts d'urgence (SOS)">
        <p className="text-[11.5px] text-mist-dim">
          {contacts > 0
            ? `${contacts} contact${contacts > 1 ? "s" : ""} enregistré${contacts > 1 ? "s" : ""}, uniquement sur ce téléphone.`
            : "Aucun contact pour l'instant. En cas de SOS, un SMS avec ta position leur est préparé."}
        </p>
        <div className="mt-2.5 flex gap-2">
          <Link href="/contacts" className="flex-1 rounded-lg border border-line bg-panel-2 py-2.5 text-center text-[12.5px] font-medium">
            {contacts > 0 ? "Gérer mes contacts" : "Ajouter un contact"}
          </Link>
          <Link href="/sos" className="rounded-lg bg-danger px-4 py-2.5 text-center text-[12.5px] font-semibold text-white">
            SOS
          </Link>
        </div>
      </Card>

      <Card title="Niveaux de fiabilité">
        <ul className="flex flex-col gap-2">
          {RELIABILITY_LEVELS.map((l) => (
            <li key={l.level} className="flex items-center gap-2.5 text-[12.5px]">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: RELIABILITY_HEX[l.level] }} />
              <span className="font-medium" style={{ color: RELIABILITY_HEX[l.level] }}>
                {l.label}
              </span>
              <span className="text-mist-dim">· {l.rule}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-mist-dim">Plus c&apos;est confirmé, plus c&apos;est mis en avant.</p>
      </Card>

      <Card title="Confidentialité">
        <ul className="flex flex-col gap-1.5 text-[11.5px] text-mist-dim leading-relaxed list-disc pl-4">
          <li>Pas de compte, pas de nom : les signalements sont anonymes.</li>
          <li>Ta position reste sur ton téléphone. Elle n&apos;est envoyée que quand tu signales (et au service OpenStreetMap, pour trouver le nom du lieu).</li>
          <li>Les visages sont floutés et la position cachée dans les photos est retirée avant l&apos;envoi.</li>
          <li>L&apos;identifiant de ton téléphone n&apos;est jamais public : la base n&apos;en garde qu&apos;une empreinte.</li>
          <li>Aucune exploitation commerciale des données.</li>
        </ul>
      </Card>

      <section className="mx-4 mt-5 mb-4 flex flex-col items-center text-center">
        <Logo withTagline />
        <p className="mt-2 text-[10.5px] text-mist-dim">
          Gratuit pour tous · développé en Nouvelle-Calédonie
          <br />
          {isSupabaseConfigured ? "Données en direct" : "Mode démo : rien n'est enregistré"}
        </p>
      </section>

      <BottomNav />
    </main>
  );
}
