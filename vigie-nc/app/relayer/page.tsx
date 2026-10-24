"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PositionPicker } from "@/components/PositionPicker";
import { PrimaryButton, ScreenHeader, SecondaryButton, TypeIcon, TypeTile } from "@/components/ui";
import { LatLng } from "@/lib/geo";
import { analyzeRelayText, RelayableType } from "@/lib/relay-parser";
import { searchPlace } from "@/lib/place";
import { errorMessage, relayReport, RelayResult } from "@/lib/reports-api";
import {
  RelaySource,
  RELAY_SOURCE_LABELS,
  REPORT_TYPE_HEX,
  REPORT_TYPE_LABELS,
  REPORT_TYPE_SHORT,
  SIGNALABLE_TYPES,
} from "@/lib/types";
import { GeoPosition, useGeolocation } from "@/lib/useGeolocation";

type Step = 1 | 2 | 3;
const SOURCES: RelaySource[] = ["facebook", "radio", "sms", "autre"];

/**
 * « Relayer une info » : quelqu'un a vu une info routière ailleurs
 * (Facebook, radio, SMS…). Il colle le message, l'appli en tire le type et
 * le lieu SUR LE TÉLÉPHONE, puis seul le fait est publié (type, lieu,
 * heure), marqué « Relayé » jusqu'à confirmation par quelqu'un sur place.
 * Le texte collé n'est jamais envoyé ni enregistré.
 */
export default function RelayerPage() {
  const router = useRouter();
  const { locate } = useGeolocation();
  const [step, setStep] = useState<Step>(1);
  const [source, setSource] = useState<RelaySource>("facebook");
  const [text, setText] = useState("");
  const [type, setType] = useState<RelayableType | null>(null);
  const [typeTouched, setTypeTouched] = useState(false);
  const [place, setPlace] = useState("");
  const [placeTouched, setPlaceTouched] = useState(false);
  const [pin, setPin] = useState<LatLng | null>(null);
  const [gps, setGps] = useState<GeoPosition | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateNote, setLocateNote] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; resultat: RelayResult } | null>(null);

  const analysis = useMemo(() => (text.trim() ? analyzeRelayText(text) : null), [text]);

  // Propositions automatiques, tant que la personne n'a pas corrigé elle-même
  useEffect(() => {
    if (!typeTouched) setType(analysis?.type ?? null);
    if (!placeTouched) setPlace(analysis?.label ?? "");
  }, [analysis, typeTouched, placeTouched]);

  // Position GPS : utilisée seulement si le lieu n'est pas trouvé
  useEffect(() => {
    locate().then(setGps).catch(() => undefined);
  }, [locate]);

  async function pasteFromClipboard() {
    setError(null);
    try {
      const t = await navigator.clipboard.readText();
      if (t) setText(t);
      else setError("Le presse-papier est vide : copie d'abord le message sur Facebook.");
    } catch {
      setError("Ton navigateur ne permet pas de coller automatiquement : appuie longuement dans la case puis « Coller ».");
    }
  }

  const goToMap = useCallback(async () => {
    if (!type) return;
    setError(null);
    setLocating(true);
    setLocateNote(null);
    const queries = placeTouched
      ? [place.trim(), ...(analysis?.queries ?? [])].filter(Boolean)
      : (analysis?.queries ?? []);
    const found = queries.length ? await searchPlace(queries) : null;
    if (found) {
      setPin({ lat: found.lat, lng: found.lng });
      setLocateNote(`Placé sur « ${found.query} » : vérifie et déplace le repère si besoin.`);
    } else if (gps) {
      setPin({ lat: gps.lat, lng: gps.lng });
      setLocateNote("Lieu non trouvé : le repère est sur ta position. Glisse-le sur le bon endroit.");
    } else {
      setPin(null);
      setLocateNote("Lieu non trouvé : touche la carte à l'endroit de l'événement.");
    }
    setLocating(false);
    setStep(2);
  }, [type, place, placeTouched, analysis, gps]);

  async function publish() {
    if (!type || !pin || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await relayReport({ type, lat: pin.lat, lng: pin.lng, source, place: place.trim() || null });
      // Le texte collé est effacé du téléphone ; on fige d'abord le type et
      // le lieu retenus pour qu'ils ne soient pas recalculés à vide.
      setTypeTouched(true);
      setPlaceTouched(true);
      setText("");
      setResult(res);
      setStep(3);
    } catch (e) {
      setError(errorMessage(e, "Impossible de publier pour le moment — vérifie ta connexion."));
    } finally {
      setSubmitting(false);
    }
  }

  // ------------------------------------------------------------------
  // Étape 3 — publié
  // ------------------------------------------------------------------
  if (step === 3 && result && type) {
    const existed = result.resultat === "existe_deja";
    return (
      <main className="min-h-[100dvh] flex flex-col px-5 pt-16 pb-8">
        <div className="flex-1 flex flex-col items-center text-center">
          <div className="w-24 h-24 rounded-full bg-primary flex items-center justify-center animate-pop-in">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" className="w-11 h-11">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <h1 className="mt-7 font-display font-bold text-[22px]">
            {existed ? "Déjà sur la carte" : "Info relayée, merci !"}
          </h1>
          <p className="mt-2 text-[15px] text-mist-dim leading-relaxed max-w-[310px]">
            {existed
              ? "Cet événement est déjà signalé à cet endroit. Ton relais n'a pas créé de doublon."
              : "Elle apparaît avec l'étiquette « Relayé » jusqu'à ce que quelqu'un sur place la confirme."}
          </p>
          <div className="mt-6 w-full flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2.5 text-left">
            <TypeTile type={type} size={40} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[15px]">{REPORT_TYPE_LABELS[type]}</p>
              <p className="text-[13px] text-mist-dim truncate">
                {place || "Position choisie"} · relayé depuis {RELAY_SOURCE_LABELS[source]}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          <PrimaryButton onClick={() => router.push(`/?signalement=${result.id}`)}>Voir sur la carte</PrimaryButton>
          <SecondaryButton
            onClick={() => {
              setResult(null);
              setType(null);
              setTypeTouched(false);
              setPlace("");
              setPlaceTouched(false);
              setPin(null);
              setStep(1);
            }}
          >
            Relayer une autre info
          </SecondaryButton>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] flex flex-col">
      <ScreenHeader
        title="Relayer une info"
        subtitle={step === 1 ? "Vue sur Facebook, à la radio, par SMS…" : "Où est-ce ?"}
        onBack={() => (step === 1 ? router.push("/signaler") : setStep(1))}
      />

      {/* ---------------- Étape 1 : coller + vérifier ---------------- */}
      {step === 1 && (
        <section className="flex-1 px-4 flex flex-col gap-4 pb-4">
          <div>
            <h2 className="text-[14.5px] text-mist-dim mb-2">Où as-tu vu l&apos;info ?</h2>
            <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Provenance">
              {SOURCES.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={source === s}
                  onClick={() => setSource(s)}
                  className={`rounded-lg border py-2 text-[13.5px] font-medium ${
                    source === s ? "bg-primary border-primary text-white" : "border-line bg-panel text-mist-dim"
                  }`}
                >
                  {RELAY_SOURCE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="relay-text" className="text-[14.5px] text-mist-dim">
                Colle le message
              </label>
              <button type="button" onClick={pasteFromClipboard} className="rounded-lg border border-lagoon/40 px-3 py-1.5 text-[14px] font-medium text-lagoon">
                Coller
              </button>
            </div>
            <textarea
              id="relay-text"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ex. : Radier de la Coulée submergé, ne passez pas !"
              className="w-full rounded-xl border border-line bg-panel px-3 py-2.5 text-[15px] placeholder:text-mist-dim/60 focus:outline-none focus:border-lagoon"
            />
            <p className="mt-1.5 text-[12.5px] text-mist-dim leading-relaxed">
              Sur Facebook : appui long sur le message, puis « Copier ». Le texte reste sur ton téléphone :
              seuls le type d&apos;événement et le lieu sont publiés. Jamais de nom ni de photo.
            </p>
          </div>

          {analysis && (
            <>
              <div>
                <h2 className="text-[14.5px] text-mist-dim mb-2">
                  {analysis.type && !typeTouched
                    ? `Type repéré (mot « ${analysis.typeKeyword} ») — corrige si besoin`
                    : "Quel type d'événement ?"}
                </h2>
                <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Type d'événement">
                  {SIGNALABLE_TYPES.map((t) => {
                    const selected = type === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => {
                          setType(t);
                          setTypeTouched(true);
                        }}
                        className={`h-[64px] rounded-xl flex flex-col items-center justify-center gap-1 text-white text-[13px] font-semibold ${
                          selected ? "ring-2 ring-mist ring-offset-2 ring-offset-void" : type ? "opacity-45" : ""
                        }`}
                        style={{ background: REPORT_TYPE_HEX[t] }}
                      >
                        <TypeIcon type={t} className="w-5 h-5" />
                        <span className="px-1 text-center leading-tight">{REPORT_TYPE_SHORT[t]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label htmlFor="relay-place" className="block text-[14.5px] text-mist-dim mb-2">
                  {analysis.label && !placeTouched ? "Lieu repéré — corrige si besoin" : "Lieu (commune, route, radier…)"}
                </label>
                <input
                  id="relay-place"
                  value={place}
                  maxLength={80}
                  onChange={(e) => {
                    setPlace(e.target.value);
                    setPlaceTouched(true);
                  }}
                  placeholder="Ex. : Radier de la Coulée, Mont-Dore"
                  className="w-full rounded-xl border border-line bg-panel px-3 py-3 text-[15px] placeholder:text-mist-dim/60 focus:outline-none focus:border-lagoon"
                />
                <p className="mt-1 text-[12.5px] text-mist-dim">Écris un lieu, jamais le nom d&apos;une personne.</p>
              </div>
            </>
          )}
        </section>
      )}

      {/* ---------------- Étape 2 : position ---------------- */}
      {step === 2 && (
        <section className="flex-1 flex flex-col">
          <div className="relative flex-1 min-h-[300px] mx-4 rounded-2xl overflow-hidden border border-line">
            <PositionPicker value={pin} gps={gps} onChange={setPin} />
          </div>
          {locateNote && <p className="mx-4 mt-2 text-[13.5px] text-mist-dim">{locateNote}</p>}
          <div className="mx-4 mt-2 flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2.5">
            {type && <TypeTile type={type} size={36} />}
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">{type ? REPORT_TYPE_LABELS[type] : ""}</p>
              <p className="text-[13px] text-mist-dim truncate">
                {place || "Lieu non précisé"} · relayé depuis {RELAY_SOURCE_LABELS[source]}
              </p>
            </div>
          </div>
        </section>
      )}

      {error && (
        <p className="mx-4 mt-3 text-center text-[14px] text-danger" role="alert">
          {error}
        </p>
      )}

      <footer
        className="sticky bottom-0 px-4 pt-3 bg-gradient-to-t from-void via-void to-transparent"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        {step === 1 && (
          <PrimaryButton disabled={!type || locating} onClick={goToMap}>
            {locating ? "Recherche du lieu…" : !text.trim() ? "Colle d'abord le message" : !type ? "Choisis le type" : "Placer sur la carte"}
          </PrimaryButton>
        )}
        {step === 2 && (
          <>
            <PrimaryButton disabled={!pin || submitting} onClick={publish}>
              {submitting ? "Publication…" : "Publier l'info relayée"}
            </PrimaryButton>
            <p className="mt-2 text-center text-[12.5px] text-mist-dim">
              Relaie seulement une info sérieuse, sans nom ni accusation ·{" "}
              <Link href="/conditions" className="text-lagoon underline">Conditions</Link>
            </p>
          </>
        )}
        {step === 1 && (
          <p className="mt-2 text-center text-[12.5px] text-mist-dim">
            Tu es sur place ? <Link href="/signaler" className="text-lagoon underline">Fais plutôt un signalement</Link>.
          </p>
        )}
      </footer>
    </main>
  );
}
