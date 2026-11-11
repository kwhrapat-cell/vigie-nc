"use client";

import { EmergencyContact } from "./types";

const STORAGE_KEY = "vigie-nc:emergency-contacts";

// Les contacts restent sur l'appareil (localStorage) : ce sont des données
// personnelles qui n'ont aucune raison de transiter par Supabase. Le SOS
// s'en sert uniquement pour pré-remplir l'appli SMS locale — l'app
// n'envoie jamais rien elle-même.
export function getEmergencyContacts(): EmergencyContact[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as EmergencyContact[]) : [];
  } catch {
    return [];
  }
}

export function saveEmergencyContacts(contacts: EmergencyContact[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
  // Demande au téléphone de ne pas effacer les données du site quand la
  // place manque (Android l'accorde souvent à une appli installée). Sans
  // réponse ni effet ailleurs : rien à faire si c'est refusé.
  if (contacts.length > 0) {
    try {
      void navigator.storage?.persist?.()?.catch(() => {});
    } catch {
      // navigateur sans cette fonction
    }
  }
}

export function addEmergencyContact(
  contact: Omit<EmergencyContact, "id">,
): EmergencyContact[] {
  const current = getEmergencyContacts();
  const next = [...current, { ...contact, id: crypto.randomUUID() }];
  saveEmergencyContacts(next);
  return next;
}

export function removeEmergencyContact(id: string): EmergencyContact[] {
  const next = getEmergencyContacts().filter((c) => c.id !== id);
  saveEmergencyContacts(next);
  return next;
}
