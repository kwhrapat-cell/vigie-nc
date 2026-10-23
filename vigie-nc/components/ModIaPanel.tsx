"use client";

import { useState } from "react";
import { PrimaryButton, TypeTile } from "./ui";
import { errorMessage, modIaEssai } from "@/lib/reports-api";
import {
  IA_ESSAI_TEMOIGNAGES_MAX,
  IA_ESSAI_TEMOIGNAGES_MIN,
  REPORT_TYPE_SHORT,
  ReportType,
  SIGNALABLE_TYPES,
} from "@/lib/types";

// Onglet « IA » de /moderation : essayer le résumé automatique avec des
// témoignages inventés, pour le tester ou le montrer (mairie, partenaire).
// Rien n'est publié ni enregistré ; l'essai compte dans la limite d'appels
// par heure (voir moderation_ia_essai() dans supabase/schema.sql).

const TEXTE_MAX = 200;

// Exemple de départ, modifiable : trois personnes, un même radier.
const EXEMPLE: { type: Exclude<ReportType, "sos">; lieu: string; temoignages: string[] } = {
  type: "inondation",
  lieu: "RT1, Païta",
  temoignages: [
    "Le radier est sous l'eau, j'ai fait demi-tour",
    "Environ 30 cm d'eau, les 4x4 passent encore doucement",
    "Ça monte vite, les pompiers bloquent l'accès",
  ],
};

export function ModIaPanel({ code }: { code: string }) {
  const [type, setType] = useState<Exclude<ReportType, "sos">>(EXEMPLE.type);
  const [lieu, setLieu] = useState(EXEMPLE.lieu);
  const [temoignages, setTemoignages] = useState<string[]>(EXEMPLE.temoignages);
  const [busy, setBusy] = useState(false);
  const [resume, setResume] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const remplis = temoignages.map((t) => t.trim()).filter(Boolean);
  const pret = remplis.length >= IA_ESSAI_TEMOIGNAGES_MIN && remplis.length <= IA_ESSAI_TEMOIGNAGES_MAX;

  function changer(i: number, texte: string) {
    setTemoignages((liste) => liste.map((t, j) => (j === i ? texte : t)));
  }

  async function essayer() {
    if (!pret || busy) return;
    setBusy(true);
    setError(null);
    setResume(undefined);
    try {
      setResume(await modIaEssai(code, { type, lieu: lieu.trim(), temoignages: remplis }));
    } catch (e) {
      setError(errorMessage(e, "L'essai n'a pas pu être fait — vérifie ta connexion."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <section className="mx-4 rounded-xl border border-line bg-panel px-3.5 py-3.5">
        <h2 className="font-display font-semibold text-[14.5px]">Essayer le résumé automatique</h2>
        <p className="mt-1 text-[11.5px] text-mist-dim leading-relaxed">
          Quand 2 personnes au moins décrivent le même événement, l&apos;IA écrit sur la fiche un résumé de ce
          qu&apos;elles disent. Ici, invente des témoignages pour voir le résultat :{" "}
          <strong className="text-mist">rien n&apos;est publié</strong>.
        </p>

        <h3 className="mt-3 text-[12px] text-mist-dim">Type d&apos;événement</h3>
        <div className="mt-1.5 grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Type d'événement">
          {SIGNALABLE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => setType(t)}
              className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 text-[9.5px] leading-tight ${
                type === t ? "border-lagoon bg-lagoon/10 text-mist" : "border-line bg-panel-2 text-mist-dim"
              }`}
            >
              <TypeTile type={t} size={26} />
              <span className="truncate max-w-full">{REPORT_TYPE_SHORT[t]}</span>
            </button>
          ))}
        </div>

        <label className="mt-3 block text-[12px] text-mist-dim">
          Lieu
          <input
            value={lieu}
            onChange={(e) => setLieu(e.target.value)}
            maxLength={80}
            placeholder="ex. RT1, Païta"
            className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-2.5 py-2.5 text-[13px] text-mist focus:outline-none focus:border-lagoon"
          />
        </label>

        <h3 className="mt-3 text-[12px] text-mist-dim">
          Témoignages, du plus ancien au plus récent (10 min d&apos;écart)
        </h3>
        <div className="mt-1.5 flex flex-col gap-2">
          {temoignages.map((t, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-2.5 w-5 shrink-0 text-center font-mono text-[11px] text-mist-dim">{i + 1}</span>
              <textarea
                value={t}
                rows={2}
                maxLength={TEXTE_MAX}
                onChange={(e) => changer(i, e.target.value)}
                aria-label={`Témoignage ${i + 1}`}
                className="flex-1 min-w-0 rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-[12.5px] focus:outline-none focus:border-lagoon"
              />
              <button
                type="button"
                onClick={() => setTemoignages((liste) => liste.filter((_, j) => j !== i))}
                disabled={temoignages.length <= IA_ESSAI_TEMOIGNAGES_MIN}
                aria-label={`Retirer le témoignage ${i + 1}`}
                className="w-10 h-10 shrink-0 rounded-lg text-mist-dim text-lg disabled:opacity-30"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        {temoignages.length < IA_ESSAI_TEMOIGNAGES_MAX && (
          <button
            type="button"
            onClick={() => setTemoignages((liste) => [...liste, ""])}
            className="mt-2 px-1 py-2 text-[12px] text-lagoon underline"
          >
            + Ajouter un témoignage
          </button>
        )}

        {error && (
          <p className="mt-2 text-[12px] text-danger" role="alert">
            {error}
          </p>
        )}

        <PrimaryButton className="mt-3" disabled={!pret || busy} onClick={essayer}>
          {busy ? "L'IA résume…" : "Résumer"}
        </PrimaryButton>
        {!pret && (
          <p className="mt-1.5 text-[11px] text-mist-dim">
            Écris de {IA_ESSAI_TEMOIGNAGES_MIN} à {IA_ESSAI_TEMOIGNAGES_MAX} témoignages.
          </p>
        )}
      </section>

      {resume !== undefined && (
        <section aria-live="polite" className="mx-4 rounded-xl border border-lagoon/30 bg-lagoon/10 px-3.5 py-3">
          <p className="text-[11px] font-semibold text-lagoon">Ce que verrait le public sur la fiche</p>
          {resume ? (
            <>
              <p className="mt-1 text-[13.5px] leading-relaxed">{resume}</p>
              <p className="mt-1.5 text-[10.5px] text-mist-dim">
                Résumé automatique (IA) de {remplis.length} témoignages : il peut se tromper, vérifie sur place.
              </p>
            </>
          ) : (
            <p className="mt-1 text-[12.5px] leading-relaxed text-mist-dim">
              Pas de résumé : l&apos;IA n&apos;a rien trouvé d&apos;utile pour la route dans ces témoignages (ou le
              résumé contenait un numéro ou un lien, qui ne sont jamais affichés). La fiche garde alors le premier
              témoignage.
            </p>
          )}
        </section>
      )}

      <p className="mx-4 text-[11px] text-mist-dim leading-relaxed">
        Envoyé à l&apos;IA (Claude, d&apos;Anthropic) : le type, le lieu et les textes, jamais qui les a écrits. Pour
        couper le résumé automatique : clé <span className="font-mono">ia_resume</span> à{" "}
        <span className="font-mono">non</span> dans <span className="font-mono">vigie_config</span>.
      </p>
    </div>
  );
}
