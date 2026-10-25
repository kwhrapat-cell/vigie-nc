// Petits éléments d'interface partagés par tous les écrans (maquettes).

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { getReliability, RELIABILITY_HEX } from "@/lib/reliability";
import { couleurSur } from "@/lib/contraste";
import { Report, ReportType, REPORT_TYPE_HEX, REPORT_TYPE_ICON } from "@/lib/types";

/** Icône d'un type de signalement (traits, couleur = currentColor). */
export function TypeIcon({ type, className }: { type: ReportType; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      // Chaînes statiques définies dans lib/types.ts (aucune donnée saisie).
      dangerouslySetInnerHTML={{ __html: REPORT_TYPE_ICON[type] }}
    />
  );
}

/** Carré coloré avec l'icône du type (listes, fiche). */
export function TypeTile({ type, size = 40 }: { type: ReportType; size?: number }) {
  return (
    <span
      className="shrink-0 rounded-xl flex items-center justify-center"
      style={{ width: size, height: size, background: REPORT_TYPE_HEX[type], color: couleurSur(REPORT_TYPE_HEX[type]) }}
    >
      <TypeIcon type={type} className="w-[55%] h-[55%]" />
    </span>
  );
}

/** Pastille du niveau de fiabilité. */
export function ReliabilityBadge({
  report,
  size = "sm",
}: {
  report: Pick<Report, "confirmations" | "infirmations" | "officialSource" | "relaySource">;
  size?: "sm" | "md";
}) {
  const rel = getReliability(report);
  const color = RELIABILITY_HEX[rel.level];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${
        size === "md" ? "px-2.5 py-1 text-[13.5px]" : "px-1.5 py-px text-[12px]"
      }`}
      style={{ color, borderColor: `${color}66`, background: `${color}1A` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {rel.label}
    </span>
  );
}

/** Logo « Signal » : repère + ondes (en direct, on veille), « VIGIE NC ». */
export function Logo({ withTagline = false }: { withTagline?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="4.5 12 55 38.5" className="w-10 h-7 shrink-0" aria-hidden="true">
        <g fill="none" stroke="#22B8B0" strokeWidth="3.4" strokeLinecap="round">
          <path d="M16.85 17.39A18.5 18.5 0 0 0 16.85 38.61" />
          <path d="M47.15 17.39A18.5 18.5 0 0 1 47.15 38.61" />
          <path d="M10.8 14.75A25 25 0 0 0 10.8 41.25" strokeOpacity="0.5" />
          <path d="M53.2 14.75A25 25 0 0 1 53.2 41.25" strokeOpacity="0.5" />
        </g>
        <path
          d="M32 15.5a12.5 12.5 0 0 1 12.5 12.5c0 9-12.5 21.5-12.5 21.5S19.5 37 19.5 28A12.5 12.5 0 0 1 32 15.5z"
          fill="#22B8B0"
        />
        <circle cx="32" cy="28" r="5" fill="#E8622F" />
      </svg>
      <span className="leading-none">
        <span className="font-display font-bold text-[17px] tracking-tight">
          VIGIE <span className="text-lagoon">NC</span>
        </span>
        {withTagline && (
          <span className="block font-display text-[12px] tracking-[0.08em] text-mist-dim mt-0.5">
            VEILLE &amp; SOLIDARITÉ DU TERRITOIRE
          </span>
        )}
      </span>
    </span>
  );
}

/** En-tête d'écran secondaire : retour + titre (+ sous-titre). */
export function ScreenHeader({
  title,
  subtitle,
  backHref,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  const back = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  return (
    <header className="flex items-center gap-2 px-2 pt-4 pb-2 shrink-0">
      {onBack ? (
        <button type="button" onClick={onBack} aria-label="Retour" className="w-11 h-11 flex items-center justify-center text-mist">
          {back}
        </button>
      ) : backHref ? (
        <Link href={backHref} aria-label="Retour" className="w-11 h-11 flex items-center justify-center text-mist">
          {back}
        </Link>
      ) : (
        <span className="w-3" />
      )}
      <div className="flex-1 min-w-0">
        <h1 className="font-display font-semibold text-[17px] leading-tight truncate">{title}</h1>
        {subtitle && <p className="text-[13.5px] text-lagoon mt-0.5">{subtitle}</p>}
      </div>
      {right ?? <span className="w-11" />}
    </header>
  );
}

/** Bouton principal (vert lagon). */
export function PrimaryButton({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`w-full rounded-xl bg-primary py-3.5 font-display font-semibold text-[15.5px] text-white disabled:opacity-40 active:bg-primary-strong ${className}`}
    >
      {children}
    </button>
  );
}

/** Bouton secondaire (contour). */
export function SecondaryButton({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`w-full rounded-xl border border-line bg-panel-2 py-3.5 font-display font-semibold text-[15px] text-mist disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}
