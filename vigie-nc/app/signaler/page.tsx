"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PositionPicker } from "@/components/PositionPicker";
import { PrimaryButton, ScreenHeader, SecondaryButton, TypeIcon, TypeTile } from "@/components/ui";
import { distanceM, formatDuration, LatLng } from "@/lib/geo";
import { GeoPosition, useGeolocation } from "@/lib/useGeolocation";
import { reversePlace } from "@/lib/place";
import { preparePhoto } from "@/lib/face-blur";
import {
  createReport,
  CreateResult,
  errorMessage,
  uploadReportPhoto,
} from "@/lib/reports-api";
import {
  ReportType,
  REPORT_TYPE_HEX,
  REPORT_TYPE_LABELS,
  REPORT_TYPE_LIFETIME_MIN,
  REPORT_TYPE_SHORT,
  RISK_LABELS,
  RiskLevel,
  SIGNALABLE_TYPES,
} from "@/lib/types";

type Step = 1 | 2 | 3 | 4;
const STEP_NAMES: Record<1 | 2 | 3, string> = { 1: "Type", 2: "Localisation", 3: "Détails" };

// On peut décaler le repère, mais pas signaler à l'autre bout de l'île :
// le signalement doit venir de quelqu'un qui est (ou vient d'être) sur place.
const MAX_PIN_DISTANCE_M = 5000;
const POOR_ACCURACY_M = 300;
const DESCRIPTION_MAX = 200;
const RISK_COLORS: Record<RiskLevel, string> = { faible: "#2BB673", moyen: "#F0912E", eleve: "#E5484D" };

const RESULT_TEXT: Record<CreateResult, { title: string; text: string }> = {
  cree: {
    title: "Merci !",
    text: "Ton signalement a été publié. Il est visible par la communauté et aide tout le monde à mieux circuler.",
  },
  fusionne: {
    title: "Merci, c'est confirmé !",
    text: "Cet événement était déjà signalé tout près : ton signalement compte comme une confirmation et le rend plus fiable.",
  },
  deja_signale: {
    title: "Déjà signalé",
    text: "Tu as déjà signalé cet événement : il est toujours sur la carte.",
  },
};

export default function SignalerPage() {
  const router = useRouter();
  const { status: geoStatus, error: geoError, locate } = useGeolocation();
  const [step, setStep] = useState<Step>(1);
  const [type, setType] = useState<Exclude<ReportType, "sos"> | null>(null);

  const [gps, setGps] = useState<GeoPosition | null>(null);
  const [pin, setPin] = useState<LatLng | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [placeLoading, setPlaceLoading] = useState(false);

  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [facesBlurred, setFacesBlurred] = useState(0);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [description, setDescription] = useState("");
  const [risk, setRisk] = useState<RiskLevel | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; resultat: CreateResult } | null>(null);
  const pinTouched = useRef(false);

  const relocate = useCallback(() => {
    locate()
      .then((p) => {
        setGps(p);
        setPin({ lat: p.lat, lng: p.lng });
        pinTouched.current = false;
      })
      .catch(() => undefined);
  }, [locate]);

  // Localisation lancée dès l'ouverture : elle est prête à l'étape 2.
  useEffect(() => {
    locate()
      .then((p) => {
        setGps(p);
        setPin((current) => (pinTouched.current && current ? current : { lat: p.lat, lng: p.lng }));
      })
      .catch(() => undefined);
  }, [locate]);

  // Nom du lieu, recalculé quand le repère bouge (avec un petit délai).
  useEffect(() => {
    if (!pin) return;
    let cancelled = false;
    setPlaceLoading(true);
    const t = setTimeout(async () => {
      const name = await reversePlace(pin.lat, pin.lng);
      if (!cancelled) {
        setPlace(name);
        setPlaceLoading(false);
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pin]);

  // Libère l'aperçu de la photo
  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const movePin = useCallback((p: LatLng) => {
    pinTouched.current = true;
    setPin(p);
  }, []);

  const pinTooFar = Boolean(gps && pin && distanceM(gps, pin) > MAX_PIN_DISTANCE_M);

  async function handlePhoto(file: File | null) {
    setPhoto(null);
    setPhotoPreview(null);
    setFacesBlurred(0);
    setError(null);
    if (!file) return;
    setProcessingPhoto(true);
    try {
      // Floutage + nettoyage des métadonnées dès la sélection : la photo
      // brute n'est jamais gardée pour l'envoi.
      const prepared = await preparePhoto(file);
      setPhoto(prepared.file);
      setFacesBlurred(prepared.facesBlurred);
      setPhotoPreview(URL.createObjectURL(prepared.file));
    } catch {
      setError("La photo n'a pas pu être préparée (connexion nécessaire la première fois) — réessaie ou publie sans photo.");
    } finally {
      setProcessingPhoto(false);
    }
  }

  async function publish() {
    if (!type || !pin || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      let photoUrl: string | null = null;
      if (photo) {
        try {
          photoUrl = await uploadReportPhoto(photo);
        } catch {
          photoUrl = null; // l'info route compte plus que l'image
        }
      }
      const res = await createReport({
        type,
        lat: pin.lat,
        lng: pin.lng,
        photoUrl,
        description: description.trim() || null,
        riskLevel: risk,
        place,
      });
      setResult(res);
      setStep(4);
    } catch (e) {
      setError(errorMessage(e, "Impossible de publier pour le moment — vérifie ta connexion."));
    } finally {
      setSubmitting(false);
    }
  }

  function back() {
    setError(null);
    if (step === 1 || step === 4) router.push("/");
    else setStep((s) => (s - 1) as Step);
  }

  // ------------------------------------------------------------------
  // Étape 4 — publié
  // ------------------------------------------------------------------
  if (step === 4 && result && type) {
    const txt = RESULT_TEXT[result.resultat];
    return (
      <main className="min-h-[100dvh] flex flex-col px-5 pt-16 pb-8">
        <div className="flex-1 flex flex-col items-center text-center">
          <div className="relative w-28 h-28 animate-pop-in">
            <span className="absolute inset-0 rounded-full bg-primary/20" />
            <span className="absolute inset-3 rounded-full bg-primary flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            {[0, 60, 120, 180, 240, 300].map((deg) => (
              <span
                key={deg}
                className="absolute w-1.5 h-1.5 rounded-full bg-lagoon"
                style={{ left: "50%", top: "50%", transform: `rotate(${deg}deg) translate(68px) translate(-50%, -50%)` }}
              />
            ))}
          </div>
          <h1 className="mt-8 font-display font-bold text-[24px]">{txt.title}</h1>
          <p className="mt-2 text-[13px] text-mist-dim leading-relaxed max-w-[300px]">{txt.text}</p>

          <div className="mt-6 w-full flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2.5 text-left">
            <TypeTile type={type} size={40} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[13px]">{REPORT_TYPE_LABELS[type]}</p>
              <p className="text-[11px] text-mist-dim truncate">
                {place ?? "Position enregistrée"} ·{" "}
                {new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
          <p className="mt-3 text-[11.5px] text-mist-dim">
            Aide la communauté en confirmant les signalements autour de toi.
          </p>
        </div>
        <div className="flex flex-col gap-2.5">
          <PrimaryButton onClick={() => router.push(`/?signalement=${result.id}`)}>Voir sur la carte</PrimaryButton>
          <SecondaryButton onClick={() => router.push("/")}>Retour à l&apos;accueil</SecondaryButton>
        </div>
      </main>
    );
  }

  const s = step as 1 | 2 | 3;

  return (
    <main className="min-h-[100dvh] flex flex-col">
      <ScreenHeader title="Nouveau signalement" subtitle={`Étape ${s}/3 · ${STEP_NAMES[s]}`} onBack={back} />
      <div className="flex gap-1.5 px-4 pb-3" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i <= s ? "bg-primary" : "bg-line"}`} />
        ))}
      </div>

      {/* ---------------- Étape 1 : type ---------------- */}
      {s === 1 && (
        <section className="flex-1 px-4">
          <h2 className="font-display font-semibold text-[18px] mb-3">Quel est le type de signalement ?</h2>
          <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Type de signalement">
            {SIGNALABLE_TYPES.map((t) => {
              const selected = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setType(t)}
                  className={`relative h-[92px] rounded-2xl flex flex-col items-center justify-center gap-2 text-white text-[13px] font-semibold transition-transform ${
                    selected ? "ring-2 ring-mist ring-offset-2 ring-offset-void scale-[0.98]" : ""
                  } ${type && !selected ? "opacity-60" : ""}`}
                  style={{ background: REPORT_TYPE_HEX[t] }}
                >
                  <TypeIcon type={t} className="w-8 h-8" />
                  {REPORT_TYPE_SHORT[t]}
                  {selected && (
                    <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white text-void flex items-center justify-center">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="w-3.5 h-3.5">
                        <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-mist-dim">
            Pour une urgence de personne, utilise plutôt le bouton{" "}
            <Link href="/sos" className="text-danger underline">SOS</Link>.
          </p>
        </section>
      )}

      {/* ---------------- Étape 2 : localisation ---------------- */}
      {s === 2 && (
        <section className="flex-1 flex flex-col">
          <div className="relative flex-1 min-h-[280px] mx-4 rounded-2xl overflow-hidden border border-line">
            <PositionPicker value={pin} gps={gps} onChange={movePin} />
            <p className="absolute bottom-2 left-2 right-2 z-10 rounded-lg bg-void/85 px-2.5 py-1.5 text-[10.5px] text-mist-dim text-center pointer-events-none">
              Glisse le repère rouge (ou touche la carte) si l&apos;événement n&apos;est pas exactement là.
            </p>
          </div>

          <div className="mx-4 mt-3 rounded-xl border border-line bg-panel px-3 py-3">
            <p className="text-[11px] font-semibold text-lagoon">
              {pin ? (pinTouched.current ? "Position choisie" : "Position détectée") : "Position"}
            </p>
            {geoStatus === "locating" && !pin && <p className="mt-1 text-[12.5px]">Localisation en cours…</p>}
            {!pin && (geoStatus === "error" || geoStatus === "unsupported") && (
              <p className="mt-1 text-[12px] text-mist-dim">
                {geoError ?? "Position indisponible."} Touche la carte pour placer le repère.
              </p>
            )}
            {pin && (
              <>
                <p className="mt-1 text-[13.5px] font-medium">
                  {placeLoading ? "Recherche de l'adresse…" : place ?? "Adresse inconnue"}
                </p>
                <p className="font-mono text-[10.5px] text-mist-dim mt-0.5">
                  {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
                  {gps && !pinTouched.current && ` · précision ± ${Math.round(gps.accuracy)} m`}
                </p>
                {gps && gps.accuracy > POOR_ACCURACY_M && !pinTouched.current && (
                  <p className="mt-1 text-[11px] text-warn">
                    Position imprécise : vérifie le repère sur la carte.
                  </p>
                )}
                {pinTooFar && (
                  <p className="mt-1 text-[11px] text-danger">
                    Le repère est à plus de 5 km de toi : on ne peut signaler que ce qu&apos;on voit autour de soi.
                  </p>
                )}
              </>
            )}
            {gps && pinTouched.current && (
              <button type="button" onClick={relocate} className="mt-2 text-[12px] text-lagoon underline">
                Revenir à ma position
              </button>
            )}
          </div>
        </section>
      )}

      {/* ---------------- Étape 3 : détails ---------------- */}
      {s === 3 && (
        <section className="flex-1 px-4 flex flex-col gap-4">
          <div>
            <h2 className="text-[12.5px] text-mist-dim mb-2">Ajoute une photo (optionnel)</h2>
            {photoPreview ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoPreview} alt="Photo qui sera publiée" className="w-full max-h-52 object-cover rounded-xl border border-line" />
                <button
                  type="button"
                  onClick={() => handlePhoto(null)}
                  className="absolute top-2 right-2 rounded-full bg-void/85 px-2.5 py-1 text-[11px]"
                >
                  Retirer
                </button>
                <p className="mt-1 text-[10.5px] text-mist-dim">
                  {facesBlurred > 0
                    ? `${facesBlurred} visage${facesBlurred > 1 ? "s" : ""} flouté${facesBlurred > 1 ? "s" : ""}. `
                    : "Aucun visage détecté. "}
                  Position GPS de la photo retirée.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <label className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line bg-panel py-4 text-[12px] ${processingPhoto ? "opacity-50" : "cursor-pointer"}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-6 h-6 text-mist-dim">
                    <rect x="3" y="7" width="18" height="13" rx="2" />
                    <path d="M8 7l1.5-3h5L16 7" />
                    <circle cx="12" cy="13.5" r="3.3" />
                  </svg>
                  {processingPhoto ? "Préparation…" : "Appareil photo"}
                  <input type="file" accept="image/*" capture="environment" disabled={processingPhoto} className="hidden"
                    onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)} />
                </label>
                <label className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line bg-panel py-4 text-[12px] ${processingPhoto ? "opacity-50" : "cursor-pointer"}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-6 h-6 text-mist-dim">
                    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
                    <circle cx="9" cy="10" r="1.8" />
                    <path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4" />
                  </svg>
                  Galerie
                  <input type="file" accept="image/*" disabled={processingPhoto} className="hidden"
                    onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)} />
                </label>
              </div>
            )}
            {!photoPreview && (
              <p className="mt-1.5 text-[10.5px] text-mist-dim opacity-80">
                Les visages sont floutés et la position GPS cachée dans la photo est retirée, sur ton téléphone, avant l&apos;envoi.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="description" className="block text-[12.5px] text-mist-dim mb-2">
              Décris la situation (optionnel)
            </label>
            <textarea
              id="description"
              rows={3}
              maxLength={DESCRIPTION_MAX}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex. : route partiellement inondée, attention dans les deux sens."
              className="w-full rounded-xl border border-line bg-panel px-3 py-2.5 text-[13px] placeholder:text-mist-dim/60 focus:outline-none focus:border-lagoon"
            />
            <div className="flex justify-between text-[10.5px] text-mist-dim mt-1">
              <span>Décris la route, pas les personnes : ni noms, ni plaques.</span>
              <span className="font-mono">{description.length}/{DESCRIPTION_MAX}</span>
            </div>
          </div>

          <div>
            <h2 className="text-[12.5px] text-mist-dim mb-2">Niveau de risque</h2>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Niveau de risque">
              {(Object.keys(RISK_LABELS) as RiskLevel[]).map((r) => {
                const selected = risk === r;
                return (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setRisk(selected ? null : r)}
                    className="rounded-lg border py-2.5 text-[12.5px] font-medium"
                    style={
                      selected
                        ? { background: RISK_COLORS[r], borderColor: RISK_COLORS[r], color: "#081317" }
                        : { borderColor: "#1E363D", background: "#0E1C21", color: "#93B0AD" }
                    }
                  >
                    {RISK_LABELS[r]}
                  </button>
                );
              })}
            </div>
          </div>

          {type && (
            <p className="text-[10.5px] text-mist-dim font-mono">
              Anonyme · visible {formatDuration(REPORT_TYPE_LIFETIME_MIN[type])} sans nouvelle confirmation
            </p>
          )}
        </section>
      )}

      {error && (
        <p className="mx-4 mt-3 text-center text-[12px] text-danger" role="alert">
          {error}
        </p>
      )}

      <footer className="sticky bottom-0 px-4 pt-3 bg-gradient-to-t from-void via-void to-transparent" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
        {s === 1 && (
          <PrimaryButton disabled={!type} onClick={() => setStep(2)}>
            {type ? "Suivant" : "Choisis un type"}
          </PrimaryButton>
        )}
        {s === 2 && (
          <PrimaryButton disabled={!pin || pinTooFar} onClick={() => setStep(3)}>
            Confirmer la position
          </PrimaryButton>
        )}
        {s === 3 && (
          <PrimaryButton disabled={submitting || processingPhoto} onClick={publish}>
            {submitting ? "Publication…" : "Publier"}
          </PrimaryButton>
        )}
      </footer>
    </main>
  );
}
