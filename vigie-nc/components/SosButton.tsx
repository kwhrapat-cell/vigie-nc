"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGeolocation } from "@/lib/useGeolocation";
import { getEmergencyContacts } from "@/lib/emergency-contacts";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { getDeviceHash } from "@/lib/device-id";

type Step = "idle" | "confirm" | "locating" | "error";

export function SosButton() {
  const router = useRouter();
  const { locate, error: geoError } = useGeolocation();
  const [step, setStep] = useState<Step>("idle");

  async function handleConfirm() {
    setStep("locating");
    try {
      const pos = await locate();

      if (isSupabaseConfigured && supabase) {
        await supabase.from("reports").insert({
          type: "sos",
          lat: pos.lat,
          lng: pos.lng,
          confirmations: 0,
          device_hash: getDeviceHash(),
          // Un SOS reste visible plus longtemps qu'un signalement standard,
          // sauf confirmation qu'il est résolu.
          expires_at: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
        });
      }

      const contacts = getEmergencyContacts();
      if (contacts.length > 0) {
        const mapsLink = `https://maps.google.com/?q=${pos.lat},${pos.lng}`;
        const message = encodeURIComponent(
          `SOS Vigie NC — j'ai besoin d'aide, voici ma position : ${mapsLink}`,
        );
        const numbers = contacts.map((c) => c.phone).join(",");
        // Ouvre l'appli SMS du téléphone, message pré-rempli — l'envoi
        // reste une action volontaire de l'utilisateur, jamais automatique.
        window.location.href = `sms:${numbers}?body=${message}`;
      }

      router.push("/");
    } catch {
      setStep("error");
    }
  }

  if (step === "confirm" || step === "locating" || step === "error") {
    return (
      <div className="fixed inset-0 z-[30] bg-void/90 flex flex-col items-center justify-center gap-4 px-6 text-center">
        {step === "confirm" && (
          <>
            <p className="font-display font-semibold text-[16px]">
              Déclencher le SOS ?
            </p>
            <p className="text-[12.5px] text-mist-dim leading-relaxed">
              Ta position sera signalée immédiatement sur la carte, et ton
              appli SMS s&apos;ouvrira vers tes contacts d&apos;urgence.
            </p>
            <div className="flex gap-3 mt-2">
              <button
                type="button"
                onClick={() => setStep("idle")}
                className="px-5 py-2.5 rounded-xl text-[13px] text-mist-dim border border-white/[0.15]"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="px-5 py-2.5 rounded-xl text-[13px] font-semibold text-void"
                style={{ background: "linear-gradient(160deg, #E8622F, #C1440E)" }}
              >
                Oui, envoyer le SOS
              </button>
            </div>
          </>
        )}
        {step === "locating" && (
          <p className="text-[13px] text-mist-dim">Localisation en cours…</p>
        )}
        {step === "error" && (
          <>
            <p className="text-[13px] text-rust-bright">
              {geoError ?? "Impossible de déclencher le SOS pour le moment."}
            </p>
            <button
              type="button"
              onClick={() => setStep("idle")}
              className="px-5 py-2.5 rounded-xl text-[13px] text-mist-dim border border-white/[0.15]"
            >
              Fermer
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="absolute left-3.5 bottom-[104px] z-[15] flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={() => setStep("confirm")}
        aria-label="Déclencher le SOS"
        className="w-[50px] h-[50px] rounded-full flex items-center justify-center text-[13px] font-display font-bold text-void border-2 border-void shadow-[0_10px_22px_-6px_rgba(193,68,14,0.55)]"
        style={{ background: "linear-gradient(160deg, #E8622F, #C1440E)" }}
      >
        SOS
      </button>
      <Link
        href="/contacts"
        className="font-mono text-[9px] text-mist-dim opacity-70 underline pl-1"
      >
        contacts
      </Link>
    </div>
  );
}
