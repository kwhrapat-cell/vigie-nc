"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { errorMessage, flagReport, FlagResult, voteOnReport, VoteResult } from "@/lib/reports-api";
import { idsBadges, nouveauxBadges, texteNouveauxBadges } from "@/lib/impact";
import { libelleFinChantier } from "@/lib/chantier";
import { distanceM, formatAge, formatDistance, formatDuration, LatLng } from "@/lib/geo";
import { getReliability, RELIABILITY_HEX } from "@/lib/reliability";
import { NOM_APPLI, URGENCES } from "@/lib/territoire";
import {
  FlagReason,
  FLAG_REASON_LABELS,
  MAX_WITNESS_DISTANCE_M,
  RELAY_SOURCE_LABELS,
  Report,
  RISK_LABELS,
  Vote,
} from "@/lib/types";
import { ReliabilityBadge, TypeTile } from "./ui";

const FLAG_MESSAGES: Record<FlagResult, string> = {
  enregistre: "Merci, c'est noté. Si d'autres personnes le signalent aussi, la photo et le texte seront masqués.",
  masque: "Merci. La photo et le texte sont maintenant masqués.",
  deja_signale: "Tu as déjà signalé ce contenu.",
};

const RESULT_MESSAGES: Record<VoteResult, string> = {
  confirme: "Merci ! Ta confirmation garde le signalement visible.",
  en_baisse:
    "Noté. Il disparaîtra d'ici 30 min si personne ne confirme qu'il est toujours là.",
  conteste:
    "Noté. Pour un danger, il faut l'avis d'au moins 2 personnes pour le retirer de la carte.",
  verifie:
    "Noté. Ce signalement est vérifié par une source officielle : seule la modération peut le retirer.",
  resolu: "Merci ! Le signalement est retiré de la carte.",
  deja_vote: "Ton avis était déjà pris en compte.",
};

const RISK_COLOR: Record<string, string> = {
  faible: "#2BB673",
  moyen: "#F0912E",
  eleve: "#E5484D",
};

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2.5 text-[14.5px]">
      <span className="w-5 h-5 shrink-0 text-mist-dim">{icon}</span>
      <span className="flex-1">{children}</span>
    </div>
  );
}

/**
 * Résumé automatique (IA) de ce qu'ont écrit les témoins (2 au moins) :
 * toujours présenté comme tel, avec le nombre de témoignages.
 */
function AiSummary({ text, count }: { text: string; count?: number | null }) {
  const n = Math.max(count ?? 2, 2);
  return (
    <section aria-label="Résumé des témoignages" className="mt-2 rounded-xl border border-lagoon/30 bg-lagoon/10 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-lagoon">
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
          <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z" />
          <path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
        </svg>
        Ce que disent les témoins
      </p>
      <p className="mt-1 text-[15px] leading-relaxed">{text}</p>
      <p className="mt-1.5 text-[12.5px] leading-snug text-mist-dim">
        Résumé automatique (IA) de {n} témoignages : il peut se tromper, vérifie sur place.
      </p>
    </section>
  );
}

/** Fiche d'un signalement (maquette « Détail d'un signalement »). */
export function ReportDetail({
  report,
  userPosition,
  onClose,
  onUpdated,
  onRemoved,
}: {
  report: Report;
  /** Position actuelle du téléphone : seuls les témoins (< 5 km) votent. */
  userPosition: LatLng | null;
  onClose: () => void;
  onUpdated: (patch: Partial<Report>) => void;
  onRemoved: () => void;
}) {
  const [busy, setBusy] = useState<Vote | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagReason, setFlagReason] = useState<FlagReason | null>(null);
  const [flagBusy, setFlagBusy] = useState(false);
  const [flagMessage, setFlagMessage] = useState<string | null>(null);
  const [flagError, setFlagError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Rafraîchit « il y a… » / « disparaît dans… » chaque minute.
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // Fermeture au clavier (Échap).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isSos = report.type === "sos";
  const active = report.active !== false && new Date(report.expiresAt).getTime() > Date.now();
  const rel = getReliability(report);
  const dist = formatDistance(report.distanceM);
  const minutesLeft = (new Date(report.expiresAt).getTime() - Date.now()) / 60_000;
  const myDistanceM = userPosition ? distanceM(userPosition, report) : null;
  const isWitness = myDistanceM !== null && myDistanceM <= MAX_WITNESS_DISTANCE_M;

  async function vote(v: Vote) {
    if (busy) return;
    setBusy(v);
    setError(null);
    setMessage(null);
    const avant = idsBadges();
    try {
      const out = await voteOnReport(report.id, v, userPosition);
      const badges = texteNouveauxBadges(nouveauxBadges(avant));
      setMessage(`${RESULT_MESSAGES[out.resultat]}${badges ? ` ${badges}` : ""}`);
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

  async function sendFlag() {
    if (!flagReason || flagBusy) return;
    setFlagBusy(true);
    setFlagError(null);
    try {
      const out = await flagReport(report.id, flagReason);
      setFlagMessage(FLAG_MESSAGES[out.resultat]);
      setFlagOpen(false);
      if (out.masque) onUpdated({ photoUrl: null, description: null, aiSummary: null, aiSummaryCount: null });
    } catch (e) {
      setFlagError(errorMessage(e, "Le signalement n'a pas pu être envoyé — vérifie ta connexion."));
    } finally {
      setFlagBusy(false);
    }
  }

  // On ne signale que ce qu'une personne a écrit ou photographié : le
  // type et le lieu, eux, se corrigent avec « C'est terminé ».
  const canFlag = !isSos && !report.isMine && Boolean(report.photoUrl || report.description || report.aiSummary);

  // Lien /s/<id> : WhatsApp, Facebook… affichent un aperçu du signalement
  // (type, lieu, fiabilité, heure) ; « src=partage » compte, sans savoir
  // qui, les nouveaux visiteurs arrivés par un partage.
  async function share() {
    const url = `${window.location.origin}/s/${report.id}?src=partage`;
    const text = `${report.label}${report.place ? ` — ${report.place}` : ""} (signalé sur ${NOM_APPLI})`;
    try {
      if (navigator.share) {
        await navigator.share({ title: NOM_APPLI, text, url });
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setMessage("Lien copié : tu peux le coller dans un message.");
      }
    } catch {
      // partage annulé par l'utilisateur : rien à faire
    }
  }

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${report.lat},${report.lng}`;

  return (
    <div className="fixed inset-0 z-[40] flex items-end justify-center bg-void/60" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-detail-title"
        className="w-full max-w-md rounded-t-[22px] bg-panel border-t border-line px-4 pt-3 pb-6 max-h-[88dvh] overflow-y-auto"
        style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-9 h-1 rounded-full bg-white/15 mx-auto mb-3" />

        <div className="flex items-start gap-3">
          <TypeTile type={report.type} size={44} />
          <div className="flex-1 min-w-0">
            <h2 id="report-detail-title" className="font-display font-semibold text-[17px] leading-tight">
              {report.label}
            </h2>
            <p className="text-[13.5px] text-mist-dim mt-0.5">
              {[report.place, dist].filter(Boolean).join(" · ") || "Position sur la carte"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="-mt-1 -mr-1 w-11 h-11 flex items-center justify-center text-mist-dim text-xl"
          >
            ✕
          </button>
        </div>

        {!isSos && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ReliabilityBadge report={report} size="md" />
            <span className="text-[13.5px] text-mist-dim">
              {report.relaySource
                ? rel.people > 0
                  ? `${rel.people} confirmation${rel.people > 1 ? "s" : ""} sur place`
                  : "Pas encore confirmé sur place"
                : rel.people > 1
                  ? `${rel.people - 1} confirmation${rel.people > 2 ? "s" : ""}`
                  : "Pas encore confirmé"}
            </span>
            {report.riskLevel && (
              <span
                className="ml-auto rounded-full px-2 py-0.5 text-[12.5px] font-medium"
                style={{ color: RISK_COLOR[report.riskLevel], background: `${RISK_COLOR[report.riskLevel]}1F` }}
              >
                Risque {RISK_LABELS[report.riskLevel].toLowerCase()}
              </span>
            )}
          </div>
        )}

        {!active && (
          <p className="mt-3 rounded-xl border border-line bg-panel-2 px-3 py-2 text-[14px] text-mist-dim">
            Ce signalement est terminé ou a expiré.
          </p>
        )}

        {report.photoUrl && (
          <figure className="mt-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={report.photoUrl}
              alt={`Photo du signalement : ${report.label}`}
              className="w-full max-h-60 object-cover rounded-xl border border-line"
            />
            <figcaption className="mt-1 text-[12px] text-mist-dim opacity-70">
              Floutage automatique des visages détectés (il peut en manquer : signale-le ci-dessous)
            </figcaption>
          </figure>
        )}

        <p className="mt-3 text-[13px] text-mist-dim">
          {report.relaySource
            ? `Info relayée depuis ${RELAY_SOURCE_LABELS[report.relaySource]} · ${formatAge(report.createdAt)}`
            : `Signalé anonymement · ${formatAge(report.createdAt)}`}
        </p>
        {report.aiSummary && <AiSummary text={report.aiSummary} count={report.aiSummaryCount} />}
        {report.description &&
          (report.aiSummary ? (
            <p className="mt-2 text-[13.5px] leading-relaxed text-mist-dim whitespace-pre-line">
              <span className="font-medium">Premier témoignage :</span> {report.description}
            </p>
          ) : (
            <p className="mt-1.5 text-[15px] leading-relaxed whitespace-pre-line">{report.description}</p>
          ))}

        {report.type === "feu" && active && (
          <p className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-[14px] leading-relaxed">
            Feu : ne t&apos;approche pas. Si les pompiers ne sont pas encore prévenus, appelle le{" "}
            <a href={`tel:${URGENCES.pompiers}`} className="underline font-semibold">{URGENCES.pompiers}</a>.
          </p>
        )}

        {isSos ? (
          <div className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-[14px] leading-relaxed">
            Quelqu&apos;un a demandé de l&apos;aide ici. Si tu es à proximité et en sécurité, préviens les secours :{" "}
            <a href={`tel:${URGENCES.samu}`} className="underline font-medium">{URGENCES.samu}</a> SAMU ·{" "}
            <a href={`tel:${URGENCES.police}`} className="underline font-medium">{URGENCES.police}</a> gendarmerie / police ·{" "}
            <a href={`tel:${URGENCES.pompiers}`} className="underline font-medium">{URGENCES.pompiers}</a> pompiers
          </div>
        ) : (
          <div className="mt-2 divide-y divide-line border-y border-line">
            <Row
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
                  <circle cx="9" cy="8" r="3.2" />
                  <path d="M3 19a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5.6M18 19a6 6 0 0 0-2.5-4.9" />
                </svg>
              }
            >
              {report.relaySource
                ? rel.people > 0
                  ? `${rel.people} personne${rel.people > 1 ? "s" : ""} sur place l'${rel.people > 1 ? "ont" : "a"} confirmé`
                  : "Personne sur place ne l'a encore confirmé"
                : rel.people > 1
                  ? `${rel.people} personnes l'ont vu`
                  : "Signalé par 1 personne"}
              {rel.contested && <span className="block text-[13px] text-warn">{rel.contested}</span>}
            </Row>
            {report.officialSource && (
              <Row
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke={RELIABILITY_HEX.verifie} strokeWidth={1.8}>
                    <path d="M12 3l7.5 3v5.5c0 4.6-3.1 8.2-7.5 9.5-4.4-1.3-7.5-4.9-7.5-9.5V6z" />
                    <path d="M8.5 12l2.3 2.3 4.7-4.6" />
                  </svg>
                }
              >
                Source officielle ({report.officialSource})
              </Row>
            )}
            {active && report.endDate && report.type === "travaux" && (
              <Row
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
                    <rect x="4" y="5.5" width="16" height="14" rx="2" />
                    <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
                  </svg>
                }
              >
                Chantier {libelleFinChantier(report.endDate)}
                <span className="block text-[13px] text-mist-dim">
                  Date annoncée par la source officielle : il reste sur la carte jusque-là.
                </span>
              </Row>
            )}
            {active && minutesLeft > 0 && !(report.endDate && report.type === "travaux") && (
              <Row
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
                    <circle cx="12" cy="12" r="8.5" />
                    <path d="M12 7.5V12l3 2" />
                  </svg>
                }
              >
                Disparaît dans {formatDuration(minutesLeft)} sans nouvelle confirmation
              </Row>
            )}
          </div>
        )}

        {active && report.isMine && (
          <div className="mt-4">
            <p className="text-[13.5px] text-mist-dim mb-2">C&apos;est ton signalement. Préviens les autres quand c&apos;est fini :</p>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => vote("termine")}
              className="w-full rounded-xl border border-line bg-panel-2 py-3 text-[15.5px] font-semibold disabled:opacity-50"
            >
              {busy ? "Envoi…" : isSos ? "Je n'ai plus besoin d'aide" : "C'est terminé"}
            </button>
          </div>
        )}

        {active && !report.isMine && !isSos && !isWitness && (
          <p className="mt-4 rounded-xl border border-line bg-panel-2 px-3 py-2.5 text-[13.5px] text-mist-dim leading-relaxed">
            {myDistanceM === null
              ? "Pour confirmer ou déclarer terminé, active ta position : seules les personnes à moins de 5 km peuvent voter."
              : `Tu es ${formatDistance(myDistanceM)} : seules les personnes à moins de 5 km peuvent confirmer ou déclarer terminé.`}
          </p>
        )}

        {active && !report.isMine && !isSos && isWitness && (
          <div className="mt-4">
            <p className="text-[13.5px] text-mist-dim mb-2">Tu es sur place ?</p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={busy !== null}
                aria-pressed={report.myVote === "present"}
                onClick={() => vote("present")}
                className={`rounded-xl py-3 text-[15.5px] font-semibold disabled:opacity-50 border ${
                  report.myVote === "present"
                    ? "bg-ok text-void border-ok"
                    : "bg-ok/10 text-ok border-ok/40"
                }`}
              >
                {busy === "present" ? "Envoi…" : "Toujours là"}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                aria-pressed={report.myVote === "termine"}
                onClick={() => vote("termine")}
                className={`rounded-xl py-3 text-[15.5px] font-semibold disabled:opacity-50 border ${
                  report.myVote === "termine" ? "bg-mist text-void border-mist" : "border-line bg-panel-2 text-mist"
                }`}
              >
                {busy === "termine" ? "Envoi…" : "C'est terminé"}
              </button>
            </div>
          </div>
        )}

        {message && (
          <p className="mt-3 text-[14px] text-lagoon" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="mt-3 text-[14px] text-danger" role="alert">
            {error}
          </p>
        )}

        {!isSos && (
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={share}
              className="rounded-xl border border-line bg-panel-2 py-3 text-[15.5px] font-semibold"
            >
              Partager
            </button>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl bg-danger py-3 text-center text-[15.5px] font-semibold text-white"
            >
              Voir dans Maps
            </a>
          </div>
        )}

        {!isSos && (
          <p className="mt-4 text-[12.5px] text-mist-dim leading-relaxed">
            Info citoyenne, à vérifier sur place : elle ne remplace pas les consignes officielles.{" "}
            <Link href="/conditions" className="underline">
              En savoir plus
            </Link>
          </p>
        )}

        {canFlag && !flagOpen && !flagMessage && (
          <button
            type="button"
            onClick={() => {
              setFlagOpen(true);
              setFlagError(null);
            }}
            className="mt-2 -ml-1 px-1 py-2 text-[14px] text-mist-dim underline"
          >
            Signaler un contenu
          </button>
        )}

        {flagOpen && (
          <div className="mt-3 rounded-xl border border-line bg-panel-2 px-3 py-3">
            <p className="text-[14.5px] font-semibold">Qu&apos;est-ce qui pose problème ?</p>
            <div className="mt-2 flex flex-col gap-2" role="radiogroup" aria-label="Motif du signalement">
              {(Object.keys(FLAG_REASON_LABELS) as FlagReason[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={flagReason === r}
                  onClick={() => setFlagReason(r)}
                  className={`rounded-lg border px-3 py-2.5 text-left text-[14.5px] ${
                    flagReason === r ? "border-lagoon bg-lagoon/10 text-mist" : "border-line bg-panel text-mist-dim"
                  }`}
                >
                  {FLAG_REASON_LABELS[r]}
                </button>
              ))}
            </div>
            {active && (
              <p className="mt-2 text-[13px] text-mist-dim">
                L&apos;événement est fini ou faux ? Réponds plutôt « C&apos;est terminé » plus haut.
              </p>
            )}
            {flagError && (
              <p className="mt-2 text-[14px] text-danger" role="alert">
                {flagError}
              </p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFlagOpen(false)}
                className="rounded-lg border border-line bg-panel py-2.5 text-[14.5px] font-medium"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={!flagReason || flagBusy}
                onClick={sendFlag}
                className="rounded-lg bg-danger py-2.5 text-[14.5px] font-semibold text-white disabled:opacity-40"
              >
                {flagBusy ? "Envoi…" : "Envoyer"}
              </button>
            </div>
          </div>
        )}

        {flagMessage && (
          <p className="mt-3 text-[14px] text-lagoon" role="status">
            {flagMessage}
          </p>
        )}
      </div>
    </div>
  );
}
