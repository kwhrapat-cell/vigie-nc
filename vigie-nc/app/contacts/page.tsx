"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PrimaryButton, ScreenHeader } from "@/components/ui";
import {
  getEmergencyContacts,
  addEmergencyContact,
  removeEmergencyContact,
} from "@/lib/emergency-contacts";
import { isStandalone } from "@/lib/push";
import { estAppareilApple } from "@/lib/sos";
import { EmergencyContact } from "@/lib/types";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  // iPhone dans Safari (appli pas installée) : Safari efface les données d'un
  // site pas ouvert depuis 7 jours d'utilisation de Safari (règle anti-pistage
  // d'Apple ; l'appli de l'écran d'accueil n'est pas concernée).
  const [safariIphone, setSafariIphone] = useState(false);

  useEffect(() => {
    setContacts(getEmergencyContacts());
    setSafariIphone(estAppareilApple(navigator.userAgent, navigator.maxTouchPoints ?? 0) && !isStandalone());
  }, []);

  function handleAdd() {
    if (!name.trim() || !phone.trim()) return;
    const next = addEmergencyContact({ name: name.trim(), phone: phone.trim() });
    setContacts(next);
    setName("");
    setPhone("");
  }

  function handleRemove(id: string) {
    setContacts(removeEmergencyContact(id));
  }

  return (
    <main className="min-h-[100dvh] pb-8">
      <ScreenHeader title="Contacts d'urgence" backHref="/profil" />

      <p className="mx-4 mt-1 text-[13.5px] text-mist-dim leading-relaxed">
        Ces contacts restent uniquement sur ton téléphone. En cas de SOS,
        l&apos;app ouvre ton appli SMS avec un message pré-rempli — c&apos;est
        toi qui décides d&apos;envoyer.
      </p>

      {safariIphone && (
        <div role="note" className="mx-4 mt-3 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2.5 text-[14px] leading-relaxed text-mist">
          <p>
            <strong>Sur iPhone, installe d&apos;abord Vigie NC.</strong> Dans Safari, ces contacts sont effacés si tu
            utilises Safari 7 jours sans ouvrir Vigie NC. L&apos;appli installée sur l&apos;écran d&apos;accueil les garde,
            mais elle a ses propres réglages : ajoute tes contacts dedans.
          </p>
          <Link href="/profil#installer" className="mt-1.5 inline-flex min-h-[44px] items-center text-lagoon underline">
            Comment installer l&apos;appli
          </Link>
        </div>
      )}

      <div className="mx-4 mt-4 flex flex-col gap-2">
        {contacts.length === 0 && (
          <p className="text-[14px] text-mist-dim opacity-70">
            Aucun contact enregistré pour l&apos;instant.
          </p>
        )}
        {contacts.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between rounded-xl border border-line bg-panel px-3 py-2.5"
          >
            <div>
              <div className="text-[15px] font-medium">{c.name}</div>
              <div className="font-mono text-[13px] text-mist-dim">
                {c.phone}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleRemove(c.id)}
              aria-label={`Retirer ${c.name}`}
              className="text-mist-dim text-lg px-2"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="mx-4 mt-5 flex flex-col gap-2.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom (ex: Maman)"
          className="rounded-xl bg-panel border border-line px-3 py-3 text-[15px] placeholder:text-mist-dim/60 focus:outline-none focus:border-lagoon"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Téléphone (ex: +687 XX.XX.XX)"
          inputMode="tel"
          className="rounded-xl bg-panel border border-line px-3 py-3 text-[15px] placeholder:text-mist-dim/60 focus:outline-none focus:border-lagoon"
        />
        <PrimaryButton onClick={handleAdd} disabled={!name.trim() || !phone.trim()}>
          Ajouter le contact
        </PrimaryButton>
      </div>
    </main>
  );
}
