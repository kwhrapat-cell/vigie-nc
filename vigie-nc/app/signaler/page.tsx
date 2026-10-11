"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TopBarPlain } from "@/components/TopBar";
import { ReportTypeGrid } from "@/components/ReportTypeGrid";
import { ReportType, REPORT_TYPE_LIFETIME_MIN } from "@/lib/types";
import { useGeolocation } from "@/lib/useGeolocation";
import { createReport, errorMessage, uploadReportPhoto } from "@/lib/reports-api";
import { preparePhoto } from "@/lib/face-blur";
import { formatDuration } from "@/lib/geo";

// Au-delà, la position est trop vague pour être utile sur une route.
const POOR_ACCURACY_M = 300;
// Une position plus vieille que ça est reprise au moment de l'envoi.
const MAX_POSITION_AGE_MS = 2 * 60_000;

export default function SignalerPage() {
  const router = useRouter();
  const { status: geoStatus, position, error: geoError, locate } = useGeolocation();
  const [positionAt, setPositionAt] = useState<number | null>(null);
  // Aucun type présélectionné : on évite les signalements envoyés trop vite
  // avec le mauvais type.
  const [type, setType] = useState<ReportType | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [facesBlurred, setFacesBlurred] = useState(0);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Localisation lancée dès l'ouverture : la position est prête au moment
  // d'envoyer, et l'utilisateur voit sa précision.
  useEffect(() => {
    locate()
      .then(() => setPositionAt(Date.now()))
      .catch(() => undefined);
  }, [locate]);

  // Libère l'aperçu de la photo
  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  async function handlePhotoSelected(file: File | null) {
    setPhoto(null);
    setPhotoPreview(null);
    setFacesBlurred(0);
    if (!file) return;
    setSubmitError(null);
    setProcessingPhoto(true);
    try {
      // Floutage + nettoyage des métadonnées dès la sélection : la photo
      // brute n'est jamais gardée pour l'envoi.
      const prepared = await preparePhoto(file);
      setPhoto(prepared.file);
      setFacesBlurred(prepared.facesBlurred);
      setPhotoPreview(URL.createObjectURL(prepared.file));
    } catch {
      setSubmitError(
        "La photo n'a pas pu être préparée (connexion nécessaire la première fois) — réessaie ou envoie sans photo.",
      );
    } finally {
      setProcessingPhoto(false);
    }
  }

  async function handleSubmit() {
    if (!type || submitting) return;
    setSubmitError(null);
    setSubmitting(true);

    try {
      const fresh = position && positionAt && Date.now() - positionAt < MAX_POSITION_AGE_MS;
      const pos = fresh ? position : await locate();

      let photoUrl: string | null = null;
      if (photo) {
        try {
          photoUrl = await uploadReportPhoto(photo);
        } catch {
          // On n'abandonne pas le signalement pour une photo : l'info route
          // compte plus que l'image.
          photoUrl = null;
        }
      }

      const { resultat } = await createReport({ type, lat: pos.lat, lng: pos.lng, photoUrl });
      router.push(`/?envoye=${resultat}`);
    } catch (e) {
      setSubmitError(
        geoStatus === "error" && geoError
          ? geoError
          : errorMessage(e, "Impossible d'envoyer le signalement pour le moment — vérifie ta connexion."),
      );
      setSubmitting(false);
    }
  }

  const lifetime = type ? formatDuration(REPORT_TYPE_LIFETIME_MIN[type]) : null;

  return (
    <>
      <TopBarPlain title="Signaler" backHref="/" />

      <p className="mx-3.5 mt-1 text-[12.5px] text-mist-dim">Que se passe-t-il ?</p>
      <ReportTypeGrid value={type} onChange={setType} />

      <label
        className={`mx-3.5 mt-4 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-white/[0.15] py-3.5 text-[12.5px] text-mist-dim ${
          processingPhoto ? "opacity-60" : "cursor-pointer"
        }`}
      >
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
        {processingPhoto
          ? "Préparation de la photo…"
          : photo
            ? "Changer la photo"
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

      {photoPreview && (
        <div className="mx-3.5 mt-2 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoPreview}
            alt="Aperçu de la photo qui sera envoyée"
            className="w-16 h-16 rounded-lg object-cover border border-white/[0.1]"
          />
          <div className="flex-1 text-[11px] text-mist-dim leading-snug">
            {facesBlurred > 0
              ? `${facesBlurred} visage${facesBlurred > 1 ? "s" : ""} flouté${facesBlurred > 1 ? "s" : ""}.`
              : "Aucun visage détecté."}{" "}
            C&apos;est cette version qui sera envoyée.
            <button
              type="button"
              onClick={() => handlePhotoSelected(null)}
              className="block mt-1 underline text-mist"
            >
              Retirer la photo
            </button>
          </div>
        </div>
      )}

      <p className="mx-3.5 mt-2 text-center text-[10px] text-mist-dim opacity-60">
        Visages floutés et position GPS de la photo retirée sur ton téléphone,
        avant l&apos;envoi.
      </p>

      <p className="mx-3.5 mt-3 text-center text-[11px] text-mist-dim" aria-live="polite">
        {geoStatus === "locating" && "Localisation en cours…"}
        {geoStatus === "success" &&
          position &&
          (position.accuracy > POOR_ACCURACY_M
            ? `Position imprécise (± ${Math.round(position.accuracy)} m) — si possible, attends quelques secondes à découvert.`
            : `Position captée (± ${Math.round(position.accuracy)} m)`)}
        {(geoStatus === "error" || geoStatus === "unsupported") && (
          <>
            <span className="text-rust-bright">{geoError}</span>{" "}
            <button
              type="button"
              className="underline text-mist"
              onClick={() => locate().then(() => setPositionAt(Date.now())).catch(() => undefined)}
            >
              Réessayer
            </button>
          </>
        )}
      </p>

      {submitError && (
        <p className="mx-3.5 mt-2 text-center text-[11.5px] text-rust-bright" role="alert">
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
        {submitting ? "Envoi…" : type ? "Envoyer le signalement" : "Choisis un type"}
      </button>

      <p className="mx-3.5 mt-3 mb-6 text-center font-mono text-[10px] text-mist-dim opacity-70">
        Anonyme · position captée à l&apos;envoi
        {lifetime && ` · visible ${lifetime} sans confirmation`}
      </p>
    </>
  );
}
