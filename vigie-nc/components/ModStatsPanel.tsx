"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage, ModStats, modStats } from "@/lib/reports-api";

// Onglet « Chiffres » de /moderation : les totaux à montrer aux
// investisseurs, financeurs et mairies. Comptage anonyme (un appareil =
// un navigateur), uniquement des totaux : voir moderation_statistiques()
// dans supabase/schema.sql.

const RAFRAICHIR_MS = 30_000;

// Noms lisibles des provenances (?src=…)
const SOURCE_LABELS: Record<string, string> = {
  direct: "Sans lien suivi (adresse tapée, favori…)",
  partage: "Signalement partagé",
  affiche: "Affiche ou QR code",
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  radio: "Radio",
  presse: "Presse",
  mairie: "Mairie",
};

const nf = new Intl.NumberFormat("fr-FR");

function n(x: number | null | undefined): string {
  return x == null ? "—" : nf.format(x);
}

/** « 2026-10-20 » → « mar. 20 oct. » (date calendaire, sans décalage horaire) */
function jourCourt(jour: string): string {
  return new Date(`${jour}T00:00:00Z`).toLocaleDateString("fr-FR", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function jourLong(jour: string): string {
  return new Date(`${jour}T00:00:00Z`).toLocaleDateString("fr-FR", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function delaiTexte(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${Math.max(1, Math.round(min))} min`;
  const h = min / 60;
  return h < 10 ? `${h.toFixed(1).replace(".", ",")} h` : `${Math.round(h)} h`;
}

/** Résumé à coller dans un message ou un dossier. */
function resume(s: ModStats): string {
  const pct = s.signalements.mois > 0 ? Math.round((100 * s.signalements.confirmesMois) / s.signalements.mois) : null;
  const lignes = [
    `Vigie NC — chiffres au ${new Date().toLocaleDateString("fr-FR", { timeZone: "Pacific/Noumea" })}`,
    `• ${n(s.mois)} utilisateurs actifs sur 30 jours (${n(s.semaine)} sur 7 jours, ${n(s.aujourdhui)} aujourd'hui)`,
    s.record ? `• Record : ${n(s.record.nombre)} personnes connectées en même temps (${jourLong(s.record.jour)})` : null,
    `• ${n(s.signalements.mois)} signalements en 30 jours${pct != null ? `, dont ${pct} % confirmés` : ""}`,
    s.signalements.delaiConfirmationMin != null
      ? `• Confirmation en ${delaiTexte(s.signalements.delaiConfirmationMin)} (médiane)`
      : null,
    `• ${n(s.abonnesAlertes)} téléphones abonnés aux alertes`,
    "Comptage anonyme : 1 utilisateur = 1 téléphone ou navigateur.",
  ];
  return lignes.filter(Boolean).join("\n");
}

export function ModStatsPanel({ code }: { code: string }) {
  const [stats, setStats] = useState<ModStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copie, setCopie] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await modStats(code));
      setError(null);
    } catch (e) {
      setError(errorMessage(e, "Impossible de charger les chiffres — vérifie ta connexion."));
    } finally {
      setLoading(false);
    }
  }, [code]);

  // Chargement, puis mise à jour toutes les 30 s tant que l'écran est affiché
  useEffect(() => {
    load();
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, RAFRAICHIR_MS);
    return () => window.clearInterval(t);
  }, [load]);

  async function copier() {
    if (!stats) return;
    try {
      await navigator.clipboard.writeText(resume(stats));
      setCopie(true);
      setTimeout(() => setCopie(false), 2500);
    } catch {
      setError("Copie impossible sur ce téléphone.");
    }
  }

  if (!stats) {
    return (
      <div className="mx-4 mt-4 text-[12.5px]">
        {error ? (
          <p className="text-danger" role="alert">
            {error}
          </p>
        ) : (
          <p className="text-mist-dim">Chargement des chiffres…</p>
        )}
      </div>
    );
  }

  const s = stats;
  const fidelitePct = s.fidelite.base >= 5 ? Math.round((100 * s.fidelite.revenus) / s.fidelite.base) : null;
  const confirmesPct =
    s.signalements.mois > 0 ? Math.round((100 * s.signalements.confirmesMois) / s.signalements.mois) : null;
  const sourcesMax = Math.max(1, ...s.sources.map((x) => x.nouveaux));

  return (
    <div className="mx-4 mt-3 flex flex-col gap-3">
      {/* En ce moment : le chiffre principal de l'écran */}
      <section className="rounded-xl border border-line bg-panel px-4 py-4" aria-live="polite">
        <p className="flex items-center gap-2 text-[12px] text-mist-dim">
          <span className="relative flex w-2.5 h-2.5">
            <span className="absolute inset-0 rounded-full bg-ok animate-blink" />
            <span className="relative w-2.5 h-2.5 rounded-full bg-ok" />
          </span>
          Connectés en ce moment
        </p>
        <p className="mt-1 text-[52px] leading-none font-semibold">{n(s.maintenant)}</p>
        <p className="mt-1.5 text-[11px] text-mist-dim">
          Appareils actifs dans les 5 dernières minutes · mis à jour toutes les 30 s
          {loading ? " · …" : ""}
        </p>
      </section>

      <div className="grid grid-cols-3 gap-2">
        <Tile label="Aujourd'hui" value={n(s.aujourdhui)} />
        <Tile label="7 jours" value={n(s.semaine)} />
        <Tile label="30 jours" value={n(s.mois)} />
      </div>
      <p className="-mt-1.5 text-[10.5px] text-mist-dim">Utilisateurs actifs (appareils différents)</p>

      <div className="grid grid-cols-2 gap-2">
        <Tile
          label="Record simultané"
          value={s.record ? n(s.record.nombre) : "—"}
          note={s.record ? jourCourt(s.record.jour) : "Pas encore de record"}
        />
        <Tile label="Nouveaux (30 jours)" value={n(s.nouveauxMois)} note={`${n(s.visiteursTotal)} depuis le début`} />
        <Tile
          label="Fidélité"
          value={fidelitePct != null ? `${fidelitePct} %` : "—"}
          note={
            fidelitePct != null
              ? `reviennent la semaine suivante (sur ${n(s.fidelite.base)})`
              : "Pas encore assez de recul (2 semaines)"
          }
        />
        <Tile label="Abonnés aux alertes" value={n(s.abonnesAlertes)} note="téléphones" />
      </div>

      <ColumnChart
        title="Utilisateurs actifs par jour"
        unit={(v) => `${n(v)} appareil${v > 1 ? "s" : ""}`}
        data={s.courbe.map((c) => ({ jour: c.jour, value: c.actifs }))}
      />

      <section className="rounded-xl border border-line bg-panel px-4 py-3">
        <h3 className="text-[13px] font-semibold">Signalements</h3>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Tile flat label="Aujourd'hui" value={n(s.signalements.aujourdhui)} />
          <Tile flat label="7 jours" value={n(s.signalements.semaine)} />
          <Tile flat label="30 jours" value={n(s.signalements.mois)} />
          <Tile flat label="Confirmés" value={confirmesPct != null ? `${confirmesPct} %` : "—"} note="30 jours" />
          <Tile
            flat
            label="1re confirmation"
            value={delaiTexte(s.signalements.delaiConfirmationMin)}
            note="médiane"
          />
          <Tile flat label="Votes" value={n(s.signalements.votesMois)} note="30 jours" />
        </div>
      </section>

      <ColumnChart
        title="Signalements par jour"
        unit={(v) => `${n(v)} signalement${v > 1 ? "s" : ""}`}
        data={s.courbe.map((c) => ({ jour: c.jour, value: c.signalements }))}
      />

      <section className="rounded-xl border border-line bg-panel px-4 py-3">
        <h3 className="text-[13px] font-semibold">D&apos;où viennent les nouveaux (30 jours)</h3>
        {s.sources.length === 0 ? (
          <p className="mt-2 text-[12px] text-mist-dim">Aucun nouveau visiteur compté pour l&apos;instant.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {s.sources.map((x) => (
              <li key={x.source} className="text-[12px]">
                <div className="flex justify-between gap-2">
                  <span className="truncate">{SOURCE_LABELS[x.source] ?? x.source}</span>
                  <span className="text-mist-dim tabular-nums">{n(x.nouveaux)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-panel-2">
                  <div
                    className="h-1.5 rounded-full bg-lagoon"
                    style={{ width: `${Math.max(3, (100 * x.nouveaux) / sourcesMax)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2.5 text-[10.5px] text-mist-dim leading-relaxed">
          Pour suivre une affiche ou un message, ajoute la provenance au lien : vigie-nc.com?src=affiche,
          ?src=whatsapp, ?src=radio…
        </p>
      </section>

      {error && (
        <p className="text-[12px] text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={copier}
          className="rounded-lg bg-primary py-2.5 text-[12.5px] font-semibold text-white"
        >
          {copie ? "Résumé copié" : "Copier le résumé"}
        </button>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-line bg-panel-2 py-2.5 text-[12.5px] font-medium disabled:opacity-50"
        >
          {loading ? "…" : "Actualiser"}
        </button>
      </div>

      <p className="text-[10.5px] text-mist-dim leading-relaxed">
        Comptage anonyme, sans cookie ni outil extérieur : 1 utilisateur = 1 téléphone ou navigateur (sur iPhone,
        l&apos;appli de l&apos;écran d&apos;accueil compte à part de Safari). Aucune adresse IP ni position.
        {s.debut ? ` Comptage depuis le ${jourLong(s.debut)}.` : ""}
      </p>
    </div>
  );
}

function Tile({ label, value, note, flat }: { label: string; value: string; note?: string; flat?: boolean }) {
  return (
    <div className={flat ? "rounded-lg bg-panel-2 px-2.5 py-2" : "rounded-xl border border-line bg-panel px-3 py-2.5"}>
      <p className="text-[10.5px] text-mist-dim leading-tight">{label}</p>
      <p className="mt-0.5 text-[20px] font-semibold leading-tight">{value}</p>
      {note && <p className="text-[10px] text-mist-dim leading-tight mt-0.5">{note}</p>}
    </div>
  );
}

/**
 * Colonnes sur 30 jours, une seule série (le titre dit ce qui est
 * compté). Toucher ou survoler une colonne affiche sa valeur ; par défaut,
 * la ligne du dessous montre aujourd'hui. Tableau complet dans « Détail ».
 */
function ColumnChart({
  title,
  data,
  unit,
}: {
  title: string;
  data: { jour: string; value: number }[];
  unit: (v: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const W = 320;
  const H = 120;
  const top = 8;
  const bottom = 18;
  const left = 4;
  const right = 28;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const max = Math.max(1, ...data.map((d) => d.value));
  // Graduation ronde au-dessus du maximum
  const pas = max <= 5 ? 1 : Math.pow(10, Math.floor(Math.log10(max)));
  const yMax = Math.ceil(max / pas) * pas;
  const slot = plotW / Math.max(1, data.length);
  const barW = Math.min(24, Math.max(2, slot - 2));
  const y = (v: number) => top + plotH - (v / yMax) * plotH;
  const shown = active ?? data.length - 1;
  const point = data[shown];

  return (
    <section className="rounded-xl border border-line bg-panel px-4 py-3">
      <h3 className="text-[13px] font-semibold">{title}</h3>
      <p className="text-[11px] text-mist-dim mt-0.5 min-h-[16px]">
        {point ? `${jourCourt(point.jour)} : ${unit(point.value)}` : ""}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1 w-full h-auto touch-none select-none"
        role="img"
        aria-label={`${title}, 30 derniers jours, maximum ${max}`}
        onPointerLeave={() => setActive(null)}
      >
        {/* Lignes de repère discrètes : 0, milieu, haut */}
        {[0, yMax / 2, yMax].map((v) => (
          <g key={v}>
            <line x1={left} x2={left + plotW} y1={y(v)} y2={y(v)} stroke="#1E363D" strokeWidth={1} />
            <text x={W - 2} y={y(v) + 3.5} textAnchor="end" fontSize={9} fill="#93B0AD" className="tabular-nums">
              {Number.isInteger(v) ? nf.format(v) : ""}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = left + i * slot + (slot - barW) / 2;
          const h = Math.max(0, top + plotH - y(d.value));
          const r = Math.min(4, barW / 2, h);
          const yTop = top + plotH - h;
          const path =
            h <= 0
              ? ""
              : `M${x},${top + plotH} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${top + plotH} Z`;
          return (
            <g key={d.jour}>
              {path && <path d={path} fill="#22B8B0" opacity={active === null || active === i ? 1 : 0.45} />}
              {/* Zone de toucher plus large que la colonne */}
              <rect
                x={left + i * slot}
                y={top}
                width={slot}
                height={plotH}
                fill="transparent"
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
              />
            </g>
          );
        })}
        {data.length > 0 && (
          <>
            <text x={left} y={H - 4} fontSize={9} fill="#93B0AD">
              {jourCourt(data[0].jour)}
            </text>
            <text x={left + plotW} y={H - 4} fontSize={9} fill="#93B0AD" textAnchor="end">
              Aujourd&apos;hui
            </text>
          </>
        )}
      </svg>
      <details className="mt-1.5">
        <summary className="text-[11px] text-mist-dim underline cursor-pointer py-1">Détail jour par jour</summary>
        <table className="mt-1 w-full text-[11px]">
          <tbody>
            {[...data].reverse().map((d) => (
              <tr key={d.jour} className="border-t border-line">
                <td className="py-1 text-mist-dim">{jourCourt(d.jour)}</td>
                <td className="py-1 text-right tabular-nums">{nf.format(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
