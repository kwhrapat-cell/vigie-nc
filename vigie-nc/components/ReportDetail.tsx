"use client";

import { useEffect, useState } from "react";
import { errorMessage, voteOnReport, VoteResult } from "@/lib/reports-api";
import { formatAge, formatDistance, formatDuration } from "@/lib/geo";
import { getReliability, RELIABILITY_BADGE } from "@/lib/reliability";
import { Report, REPORT_TYPE_SEVERITY, SEVERITY_HEX, Vote } from "@/lib/types";

const RESULT_MESSAGES: Record<VoteResult, string> = {
  confirme: "Merci ! Ta confirmation garde le signalement visible.",
  en_baisse:
    "Noté. Il disparaîtra d'ici 30 min si personne ne confirme qu'il est toujours là.",
  resolu: "Merci ! Le signalement est retiré de la carte.",
  deja_vote: "Ton avis était déjà pris en compte.",
};

export function ReportDetail({
  report,
  onClose,
  onUpdated,
  onRemoved,
}: {
  report: Report;
  onClose: () => void;
  onUpdated: (patch: Partial<Report>) => void;
  onRemoved: () => void;
}) {
  const [busy, setBusy] = useState<Vote | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Rafraîchit « il y a… » / « disparaît dans… » chaque minute.
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // Fermeture au clavier (Échap) pour l'accessibilité.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isSos = report.type === "sos";
  const rel = getReliability(report);
  const color = SEVERITY_HEX[REPORT_TYPE_SEVERITY[report.type]];
  const dist = formatDistance(report.distanceM);
  const minutesLeft = (new Date(report.expiresAt).getTime() - Date.now()) / 60_000;

  async function vote(v: Vote) {
    if (busy) return;
    setBusy(v);
    setError(null);
    setMessage(null);
    try {
      const out = await voteOnReport(report.id, v);
      setMessage(RESULT_MESSAGES[out.resultat]);
      if (out.resolu) {
        setTimeout(onRemoved, 1400);
      } else {
        onUpdated({
          confirmations: out.confirmations,
          infirmations: out.infirmations,
          expiresAt: out.expiresAt,
          myVote: v,
        });
      }
    } catch (e) {
      setError(errorMessage(e, "Le vote n'a pas pu être envoyé — vérifie ta connexion."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[40] flex items-end justify-center bg-void/60"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-detail-title"
        className="w-full max-w-md rounded-t-[22px] bg-panel-2 px-4 pt-3 pb-6 border-t border-white/[0.08] max-h-[85dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-9 h-1 rounded-full bg-white/15 mx-auto mb-3" />

        <div className="flex items-start gap-2.5">
          <span
            className={`mt-1.5 w-3 h-3 rounded-full shrink-0 ${isSos ? "animate-blink" : ""}`}
            style={{ background: color }}
          />
          <div className="flex-1 min-w-0">
            <h2 id="report-detail-title" className="font-display font-semibold text-[17px] leading-tight">
              {report.label}
            </h2>
            <p className="text-[11.5px] text-mist-dim mt-0.5">
              {[dist, `signalé ${formatAge(report.createdAt)}`].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="-mt-1 -mr-1 w-10 h-10 flex items-center justify-center text-mist-dim text-xl"
          >
            ✕
          </button>
        </div>

        {!isSos && (
          <div className="mt-3 flex items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${RELIABILITY_BADGE[rel.level]}`}>
              {rel.label}
            </span>
            <span className="text-[11.5px] text-mist-dim">{rel.detail}</span>
          </div>
        )}

        {report.photoUrl && (
          <figure className="mt-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={report.photoUrl}
              alt={`Photo du signalement : ${report.label}`}
              className="w-full max-h-56 object-cover rounded-xl border border-white/[0.08]"
            />
            <figcaption className="mt-1 text-[10px] text-mist-dim opacity-70">
              Visages floutés automatiquement
            </figcaption>
          </figure>
        )}

        {isSos ? (
          <div className="mt-3 rounded-xl border border-rust-bright/30 bg-rust-bright/10 px-3 py-2.5 text-[12px] leading-relaxed">
            Quelqu&apos;un a demandé de l&apos;aide ici. Si tu es à proximité et en sécurité,
            préviens les secours :{" "}
            <a href="tel:15" className="underline font-medium">15</a> SAMU ·{" "}
            <a href="tel:17" className="underline font-medium">17</a> gendarmerie / police ·{" "}
            <a href="tel:18" className="underline font-medium">18</a> pompiers
          </div>
        ) : (
          minutesLeft > 0 && (
            <p className="mt-3 font-mono text-[10.5px] text-mist-dim">
              Disparaît dans {formatDuration(minutesLeft)} sans nouvelle confirmation
            </p>
          )
        )}

        {report.isMine ? (
          <div className="mt-4">
            <p className="text-[11.5px] text-mist-dim mb-2">
              C&apos;est ton signalement. Préviens les autres quand c&apos;est fini :
            </p>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => vote("termine")}
              className="w-full rounded-2xl border border-white/[0.18] py-3 text-[13.5px] font-semibold disabled:opacity-50"
            >
              {busy ? "Envoi…" : isSos ? "Je n'ai plus besoin d'aide" : "C'est terminé"}
            </button>
          </div>
        ) : (
          !isSos && (
            <div className="mt-4">
              <p className="text-[11.5px] text-mist-dim mb-2">Tu es sur place ?</p>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={busy !== null}
                  aria-pressed={report.myVote === "present"}
                  onClick={() => vote("present")}
                  className={`rounded-2xl py-3 text-[13.5px] font-semibold disabled:opacity-50 border ${
                    report.myVote === "present"
                      ? "bg-lagoon text-void border-lagoon"
                      : "bg-lagoon/15 text-lagoon border-lagoon/40"
                  }`}
                >
                  {busy === "present" ? "Envoi…" : "Toujours là"}
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  aria-pressed={report.myVote === "termine"}
                  onClick={() => vote("termine")}
                  className={`rounded-2xl py-3 text-[13.5px] font-semibold disabled:opacity-50 border ${
                    report.myVote === "termine"
                      ? "bg-mist text-void border-mist"
                      : "border-white/[0.18] text-mist"
                  }`}
                >
                  {busy === "termine" ? "Envoi…" : "C'est terminé"}
                </button>
              </div>
            </div>
          )
        )}

        {message && (
          <p className="mt-3 text-[12px] text-lagoon" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="mt-3 text-[12px] text-rust-bright" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
