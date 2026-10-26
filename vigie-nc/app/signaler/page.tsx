"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PositionPicker } from "@/components/PositionPicker";
import { Cagou } from "@/components/Cagou";
import { couleurSur } from "@/lib/contraste";
import { idsBadges, nouveauxBadges, texteNouveauxBadges } from "@/lib/impact";
import { PrimaryButton, ScreenHeader, SecondaryButton, TypeIcon, TypeTile } from "@/components/ui";
import { distanceM, formatDuration, LatLng } from "@/lib/geo";
import { GeoPosition, useGeolocation } from "@/lib/useGeolocation";
import { reversePlace } from "@/lib/place";
import { NOM_APPLI, URGENCES } from "@/lib/territoire";
import { preparePhoto } from "@/lib/face-blur";
import {
  createReport,
  CreateResult,
  errorMessage,
  uploadReportPhoto,
} from "@/lib/reports-api";
import {
  MAX_WITNESS_DISTANCE_M,
  ReportType,
  REPORT_TYPE_HEX,
  REPORT_TYPE_LABELS,
  REPORT_TYPE_LIFETIME_MIN,
  REPORT_TYPE_SHORT,
  RISK_LABELS,
  RiskLevel,
  SIGNALABLE_TYPES,
} from "@/lib/types";

// Deux étapes seulement : le type, puis « Publier » (position trouvée toute
// seule, à ajuster sur la carte si besoin ; photo et texte en option).
// L'étape 3 est l'écran « Merci ».
type Step = 1 | 2 | 3;
const STEP_NAMES: Record<1 | 2, string> = { 1: "Que se passe-t-il ?", 2: "Vérifie et publie" };

// On peut décaler le repère, mais pas signaler à l'autre bout de l'île :
// le signalement doit venir de quelqu'un qui est (ou vient d'être) sur place.
const MAX_PIN_DISTANCE_M = MAX_WITNESS_DISTANCE_M;
const POOR_ACCURACY_M = 300;
const DESCRIPTION_MAX = 200;
const RISK_COLORS: Record<RiskLevel, string> = { faible: "#2BB673", moyen: "#F0912E", eleve: "#E5484D" };

const RESULT_TEXT: Record<CreateResult, { title: string; text: string }> = {
  cree: {
    title: "Merci !",
    text: `Ton signalement est sur la carte et aide tout le monde à mieux circuler. Quand quelqu'un le confirmera, tu le verras en ouvrant ${NOM_APPLI}.`,
  },
  fusionne: {
    title: "Merci, c'est confirmé !",
    text: "Cet événement était déjà signalé tout près : ton signalement compte comme une confirmation et le rend plus fiable. Si tu as écrit un texte, il rejoint le résumé des témoins.",
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
  // Carte pour déplacer le repère, et photo / texte / risque : repliés par défaut.
  const [carteOuverte, setCarteOuverte] = useState(false);
  const [detailsOuverts, setDetailsOuverts] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; resultat: CreateResult } | null>(null);
  const [badgesGagnes, setBadgesGagnes] = useState("");
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

  // Localisation lancée dès l'ouverture : elle est prête quand on a choisi le type.
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
  const positionImprecise = Boolean(gps && gps.accuracy > POOR_ACCURACY_M && !pinTouched.current);
  const sansPosition = !pin && (geoStatus === "error" || geoStatus === "unsupported");
  // La carte s'ouvre d'elle-même quand il faut vérifier ou placer le repère,
  // et reste ouverte ensuite (même une fois le repère déplacé).
  const carteForcee = sansPosition || positionImprecise || pinTooFar;
  const montrerCarte = carteOuverte || carteForcee;
  useEffect(() => {
    if (carteForcee) setCarteOuverte(true);
  }, [carteForcee]);

  const choisirType = useCallback((t: Exclude<ReportType, "sos">) => {
    setType(t);
    setError(null);
    setStep(2);
    window.scrollTo(0, 0);
  }, []);

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
      const avant = idsBadges();
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
      setBadgesGagnes(texteNouveauxBadges(nouveauxBadges(avant)));
      setStep(3);
    } catch (e) {
      setError(errorMessage(e, "Impossible de publier pour le moment — vérifie ta connexion."));
    } finally {
      setSubmitting(false);
    }
  }

  function back() {
    setError(null);
    if (step === 1 || step === 3) router.push("/");
    else setStep(1);
  }

  // ------------------------------------------------------------------
  // Étape 3 — publié
  // ------------------------------------------------------------------
  if (step === 3 && result && type) {
    const txt = RESULT_TEXT[result.resultat];
    return (
      <main className="min-h-[100dvh] flex flex-col px-5 pt-16 pb-8">
        <div className="flex-1 flex flex-col items-center text-center">
          <div className="relative w-28 h-28 animate-pop-in">
            <span className="absolute inset-0 rounded-full bg-primary/20" />
            <span className="absolute inset-3 rounded-full bg-panel-2 border border-primary/50 flex items-center justify-center">
              <Cagou size={70} />
            </span>
            {/* Coche : c'est publié */}
            <span className="absolute right-1 bottom-1 w-9 h-9 rounded-full bg-primary border-[3px] border-void flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
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
          <p className="mt-2 text-[15px] text-mist-dim leading-relaxed max-w-[300px]">{txt.text}</p>
          {badgesGagnes && (
            <p className="mt-3 rounded-full border border-lagoon/40 bg-lagoon/10 px-4 py-2 text-[15px] font-semibold text-lagoon animate-pop-in">
              {badgesGagnes}
            </p>
          )}

          <div className="mt-6 w-full flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2.5 text-left">
            <TypeTile type={type} size={40} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[15px]">{REPORT_TYPE_LABELS[type]}</p>
              <p className="text-[13px] text-mist-dim truncate">
                {place ?? "Position enregistrée"} ·{" "}
                {new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
          <p className="mt-3 text-[13.5px] text-mist-dim">
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

  const s = step as 1 | 2;

  return (
    <main className="min-h-[100dvh] flex flex-col">
      <ScreenHeader title="Nouveau signalement" subtitle={`Étape ${s}/2 · ${STEP_NAMES[s]}`} onBack={back} />
      <div className="flex gap-1.5 px-4 pb-3" aria-hidden="true">
        {[1, 2].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i <= s ? "bg-primary" : "bg-line"}`} />
        ))}
      </div>

      {/* ---------------- Étape 1 : le type (un seul toucher) ---------------- */}
      {s === 1 && (
        <section className="flex-1 px-4 pb-6">
          <h2 className="font-display font-semibold text-[19px] mb-3">Tu es sur place : que se passe-t-il ?</h2>
          <div className="grid grid-cols-2 gap-2.5" role="group" aria-label="Type de signalement">
            {SIGNALABLE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => choisirType(t)}
                className="h-[80px] rounded-2xl flex flex-col items-center justify-center gap-1.5 text-[15px] font-semibold active:scale-[0.97] transition-transform"
                style={{ background: REPORT_TYPE_HEX[t], color: couleurSur(REPORT_TYPE_HEX[t]) }}
              >
                <TypeIcon type={t} className="w-8 h-8" />
                {REPORT_TYPE_SHORT[t]}
              </button>
            ))}
          </div>
          <p className="mt-4 text-[13px] text-mist-dim">
            Une personne en danger ? Utilise plutôt le bouton{" "}
            <Link href="/sos" className="text-danger underline font-semibold">SOS</Link>.
          </p>
          <Link
            href="/relayer"
            className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-lagoon/40 bg-lagoon/5 px-3 py-2.5"
          >
            <span className="w-9 h-9 shrink-0 rounded-lg bg-[#1877F2] flex items-center justify-center text-white font-display font-bold text-[17px]">
              f
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[14px] font-semibold">Vu sur Facebook ou à la radio ?</span>
              <span className="block text-[13px] text-mist-dim">Relaie l&apos;info en collant le message</span>
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-lagoon shrink-0">
              <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </section>
      )}

      {/* ---------------- Étape 2 : vérifier et publier ---------------- */}
      {s === 2 && type && (
        <section className="flex-1 px-4 flex flex-col gap-3 pb-4">
          {/* Le type choisi */}
          <div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2.5">
            <TypeTile type={type} size={44} />
            <p className="flex-1 min-w-0 font-display font-semibold text-[17px]">{REPORT_TYPE_LABELS[type]}</p>
            <button
              type="button"
              onClick={back}
              className="shrink-0 min-h-[44px] px-3 rounded-full border border-line text-[14px] text-mist"
            >
              Changer
            </button>
          </div>

          {type === "feu" && (
            <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-[14px] leading-relaxed" role="note">
              Un feu ? Appelle d&apos;abord le{" "}
              <a href={`tel:${URGENCES.pompiers}`} className="underline font-semibold">{URGENCES.pompiers}</a>{" "}(pompiers)
              si personne ne l&apos;a fait. Signale de loin et à l&apos;arrêt : ne t&apos;approche pas.
            </p>
          )}

          {/* La position : trouvée toute seule, carte pour l'ajuster */}
          <div className="rounded-xl border border-line bg-panel px-3 py-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-lagoon">
                  {pin ? (pinTouched.current ? "Position choisie" : "Position détectée") : "Position"}
                </p>
                {geoStatus === "locating" && !pin && <p className="mt-1 text-[15px]">Localisation en cours…</p>}
                {sansPosition && (
                  <p className="mt-1 text-[14px] text-mist-dim">
                    {geoError ?? "Position indisponible."} Touche la carte pour placer le repère.
                  </p>
                )}
                {pin && (
                  <p className="mt-1 text-[15px] font-medium">
                    {placeLoading ? "Recherche de l'adresse…" : place ?? "Adresse inconnue"}
                  </p>
                )}
                {pin && gps && !pinTouched.current && (
                  <p className="font-mono text-[12px] text-mist-dim mt-0.5">précision ± {Math.round(gps.accuracy)} m</p>
                )}
              </div>
              {!carteForcee && (
                <button
                  type="button"
                  onClick={() => setCarteOuverte((o) => !o)}
                  aria-expanded={montrerCarte}
                  className="shrink-0 min-h-[44px] px-3 rounded-full border border-line text-[14px] text-mist"
                >
                  {montrerCarte ? "Fermer la carte" : pin ? "Ajuster" : "Placer à la main"}
                </button>
              )}
            </div>
            {positionImprecise && (
              <p className="mt-1 text-[13px] text-warn">Position imprécise : vérifie le repère sur la carte.</p>
            )}
            {pinTooFar && (
              <p className="mt-1 text-[13px] text-danger">
                Le repère est à plus de 5 km de toi : on ne peut signaler que ce qu&apos;on voit autour de soi.
              </p>
            )}
            {montrerCarte && (
              <>
                <div className="relative mt-3 h-[260px] rounded-xl overflow-hidden border border-line">
                  <PositionPicker value={pin} gps={gps} onChange={movePin} />
                </div>
                <p className="mt-1.5 text-[13px] text-mist-dim">
                  Glisse le repère rouge (ou touche la carte) si l&apos;événement n&apos;est pas exactement là.
                </p>
                {gps && pinTouched.current && (
                  <button type="button" onClick={relocate} className="mt-1 min-h-[44px] text-[14px] text-lagoon underline">
                    Revenir à ma position
                  </button>
                )}
              </>
            )}
          </div>

          {/* Photo, texte, risque : en option, repliés */}
          <div className="rounded-xl border border-line bg-panel">
            <button
              type="button"
              onClick={() => setDetailsOuverts((o) => !o)}
              aria-expanded={detailsOuverts}
              className="w-full min-h-[52px] flex items-center justify-between gap-2 px-3 text-left"
            >
              <span className="text-[15px] font-medium">
                {photo || description.trim() || risk ? "Photo et détails ajoutés" : "Ajouter une photo ou des détails"}
                <span className="block text-[13px] text-mist-dim font-normal">Facultatif</span>
              </span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className={`w-5 h-5 text-mist-dim shrink-0 transition-transform ${detailsOuverts ? "rotate-180" : ""}`}
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {detailsOuverts && (
              <div className="px-3 pb-3 flex flex-col gap-4">
                <div>
                  <h3 className="text-[14px] text-mist-dim mb-2">Photo</h3>
                  {photoPreview ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoPreview} alt="Photo qui sera publiée" className="w-full max-h-52 object-cover rounded-xl border border-line" />
                      <button
                        type="button"
                        onClick={() => handlePhoto(null)}
                        className="absolute top-2 right-2 min-h-[44px] flex items-center rounded-full bg-void/85 px-4 text-[14px] font-medium"
                      >
                        Retirer
                      </button>
                      <p className="mt-1 text-[12px] text-mist-dim">
                        {facesBlurred > 0
                          ? `${facesBlurred} visage${facesBlurred > 1 ? "s" : ""} flouté${facesBlurred > 1 ? "s" : ""}. `
                          : "Aucun visage détecté. "}
                        Position GPS de la photo retirée.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5">
                      <label className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line bg-panel-2 py-4 text-[14px] ${processingPhoto ? "opacity-50" : "cursor-pointer"}`}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-6 h-6 text-mist-dim">
                          <rect x="3" y="7" width="18" height="13" rx="2" />
                          <path d="M8 7l1.5-3h5L16 7" />
                          <circle cx="12" cy="13.5" r="3.3" />
                        </svg>
                        {processingPhoto ? "Préparation…" : "Appareil photo"}
                        <input type="file" accept="image/*" capture="environment" disabled={processingPhoto} className="hidden"
                          onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)} />
                      </label>
                      <label className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line bg-panel-2 py-4 text-[14px] ${processingPhoto ? "opacity-50" : "cursor-pointer"}`}>
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
                    <p className="mt-1.5 text-[12px] text-mist-dim opacity-80">
                      Photographie la route, pas les gens. Les visages sont floutés et la position GPS cachée dans la
                      photo est retirée, sur ton téléphone, avant l&apos;envoi. Photo effacée après 7 jours.
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="description" className="block text-[14px] text-mist-dim mb-2">
                    Décris la situation
                  </label>
                  <textarea
                    id="description"
                    rows={3}
                    maxLength={DESCRIPTION_MAX}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ex. : route partiellement inondée, attention dans les deux sens."
                    className="w-full rounded-xl border border-line bg-panel-2 px-3 py-2.5 text-[16px] placeholder:text-mist-dim/60 focus:outline-none focus:border-lagoon"
                  />
                  <div className="flex justify-between gap-2 text-[12px] text-mist-dim mt-1">
                    <span>Décris la route, pas les personnes : ni noms, ni plaques.</span>
                    <span className="font-mono shrink-0">{description.length}/{DESCRIPTION_MAX}</span>
                  </div>
                </div>

                <div>
                  <h3 className="text-[14px] text-mist-dim mb-2">Niveau de risque</h3>
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
                          className="min-h-[44px] rounded-lg border py-2.5 text-[14px] font-medium"
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
              </div>
            )}
          </div>

          <p className="text-[12px] text-mist-dim font-mono">
            Anonyme · visible {formatDuration(REPORT_TYPE_LIFETIME_MIN[type])} sans nouvelle confirmation
          </p>
        </section>
      )}

      {error && (
        <p className="mx-4 mt-3 text-center text-[14px] text-danger" role="alert">
          {error}
        </p>
      )}

      {s === 2 && (
        <footer className="sticky bottom-0 px-4 pt-3 bg-gradient-to-t from-void via-void to-transparent" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
          <PrimaryButton disabled={!pin || pinTooFar || submitting || processingPhoto} onClick={publish}>
            {submitting ? "Publication…" : !pin ? "Recherche de ta position…" : "Publier"}
          </PrimaryButton>
          <p className="mt-2 text-center text-[12px] text-mist-dim">
            En publiant, tu confirmes avoir vu cet événement sur place ·{" "}
            <Link href="/conditions" className="text-lagoon underline">Conditions</Link>
          </p>
        </footer>
      )}
    </main>
  );
}
