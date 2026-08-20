"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TopBarPlain } from "@/components/TopBar";
import { ReportTypeGrid } from "@/components/ReportTypeGrid";
import { ReportType } from "@/lib/types";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useGeolocation } from "@/lib/useGeolocation";
import { getDeviceHash } from "@/lib/device-id";
import { blurFacesInImage } from "@/lib/face-blur";

export default function SignalerPage() {
  const router = useRouter();
  const { status: geoStatus, position, error: geoError, locate } = useGeolocation();
  const [type, setType] = useState<ReportType | null>("route_coupee");
  const [photo, setPhoto] = useState<File | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handlePhotoSelected(file: File | null) {
    if (!file) {
      setPhoto(null);
      return;
    }
    setSubmitError(null);
    setProcessingPhoto(true);
    try {
      // Le floutage se fait ici, à la sélection — la photo brute avec un
      // visage visible n'est jamais mise en mémoire pour l'envoi.
      const blurred = await blurFacesInImage(file);
      setPhoto(blurred);
    } catch {
      setPhoto(null);
      setSubmitError(
        "Le floutage des visages a échoué (connexion nécessaire au premier essai) — réessaie ou envoie sans photo.",
      );
    } finally {
      setProcessingPhoto(false);
    }
  }

  async function uploadPhoto(file: File): Promise<string | null> {
    if (!supabase) return null;
    const path = `${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage
      .from("report-photos")
      .upload(path, file, { upsert: false });
    if (error) return null;
    const { data } = supabase.storage.from("report-photos").getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSubmit() {
    if (!type || submitting) return;
    setSubmitError(null);
    setSubmitting(true);

    try {
      const pos = position ?? (await locate());

      let photoUrl: string | null = null;
      if (photo && isSupabaseConfigured) {
        photoUrl = await uploadPhoto(photo);
      }

      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.from("reports").insert({
          type,
          lat: pos.lat,
          lng: pos.lng,
          photo_url: photoUrl,
          confirmations: 0,
          device_hash: getDeviceHash(),
          expires_at: new Date(Date.now() + 4 * 60 * 60_000).toISOString(),
        });
        if (error) {
          setSubmitError(
            error.message.includes("rate_limit")
              ? "Un signalement a déjà été envoyé récemment depuis cet appareil — patiente une minute."
              : "Impossible d'envoyer le signalement pour le moment.",
          );
          setSubmitting(false);
          return;
        }
      }

      router.push("/");
    } catch {
      setSubmitError(
        geoError ?? "Impossible d'envoyer le signalement pour le moment.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <TopBarPlain title="Signaler" backHref="/" />
      <ReportTypeGrid value={type} onChange={setType} />

      <label className="mx-3.5 mt-4 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-white/[0.15] py-3.5 text-[12.5px] text-mist-dim cursor-pointer">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="w-[18px] h-[18px]"
        >
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7l1.5-3h5L16 7" />
          <circle cx="12" cy="13.5" r="3.3" />
        </svg>
        {photo
          ? `${photo.name} · visages floutés`
          : processingPhoto
            ? "Floutage des visages en cours…"
            : "Ajouter une photo (optionnel)"}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={processingPhoto}
          className="hidden"
          onChange={(e) => handlePhotoSelected(e.target.files?.[0] ?? null)}
        />
      </label>

      <p className="mx-3.5 mt-2 text-center text-[10px] text-mist-dim opacity-60">
        Les visages sont automatiquement pixellisés sur ton téléphone avant
        l&apos;envoi — la photo brute ne quitte jamais l&apos;appareil.
      </p>

      {geoStatus === "locating" && (
        <p className="mx-3.5 mt-3 text-center text-[11px] text-mist-dim">
          Localisation en cours…
        </p>
      )}
      {submitError && (
        <p className="mx-3.5 mt-3 text-center text-[11px] text-rust-bright">
          {submitError}
        </p>
      )}

      <button
        type="button"
        disabled={!type || submitting || processingPhoto}
        onClick={handleSubmit}
        className="mx-3.5 mt-4 rounded-2xl py-3.5 font-display font-semibold text-[14px] text-void disabled:opacity-50"
        style={{ background: "linear-gradient(160deg, #E8622F, #C1440E)" }}
      >
        {submitting ? "Envoi…" : "Envoyer le signalement"}
      </button>

      <p className="mx-3.5 mt-3 text-center font-mono text-[10px] text-mist-dim opacity-70">
        Anonyme · position captée à l&apos;envoi · expire dans 4h sauf
        confirmation
      </p>
    </>
  );
}
