"use client";

import { useEffect, useState } from "react";
import { TopBarPlain } from "@/components/TopBar";
import {
  getEmergencyContacts,
  addEmergencyContact,
  removeEmergencyContact,
} from "@/lib/emergency-contacts";
import { EmergencyContact } from "@/lib/types";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    setContacts(getEmergencyContacts());
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
    <>
      <TopBarPlain title="Contacts d'urgence" backHref="/" />

      <p className="mx-3.5 mt-3 text-[11.5px] text-mist-dim leading-relaxed">
        Ces contacts restent uniquement sur ton téléphone. En cas de SOS,
        l&apos;app ouvre ton appli SMS avec un message pré-rempli — c&apos;est
        toi qui décides d&apos;envoyer.
      </p>

      <div className="mx-3.5 mt-4 flex flex-col gap-2">
        {contacts.length === 0 && (
          <p className="text-[12px] text-mist-dim opacity-70">
            Aucun contact enregistré pour l&apos;instant.
          </p>
        )}
        {contacts.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between rounded-xl bg-panel-2 px-3 py-2.5"
          >
            <div>
              <div className="text-[13px] font-medium">{c.name}</div>
              <div className="font-mono text-[11px] text-mist-dim">
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

      <div className="mx-3.5 mt-5 flex flex-col gap-2.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom (ex: Maman)"
          className="rounded-xl bg-panel-2 border border-white/[0.09] px-3 py-2.5 text-[13px] placeholder:text-mist-dim/60"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Téléphone (ex: +687 XX.XX.XX)"
          inputMode="tel"
          className="rounded-xl bg-panel-2 border border-white/[0.09] px-3 py-2.5 text-[13px] placeholder:text-mist-dim/60"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!name.trim() || !phone.trim()}
          className="rounded-xl py-2.5 font-display font-semibold text-[13px] text-void disabled:opacity-40"
          style={{ background: "linear-gradient(160deg, #7FC9C4, #22B8B0)" }}
        >
          Ajouter le contact
        </button>
      </div>
    </>
  );
}
