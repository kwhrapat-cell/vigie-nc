// Petits éléments d'interface partagés par tous les écrans (maquettes).

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { getReliability, RELIABILITY_HEX } from "@/lib/reliability";
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
      className="shrink-0 rounded-xl flex items-center justify-center text-white"
      style={{ width: size, height: size, background: REPORT_TYPE_HEX[type] }}
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
  report: Pick<Report, "confirmations" | "infirmations" | "officialSource">;
  size?: "sm" | "md";
}) {
  const rel = getReliability(report);
  const color = RELIABILITY_HEX[rel.level];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${
        size === "md" ? "px-2.5 py-1 text-[11.5px]" : "px-1.5 py-px text-[10px]"
      }`}
      style={{ color, borderColor: `${color}66`, background: `${color}1A` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {rel.label}
    </span>
  );
}

/** Logo : bouclier + repère, « VIGIE NC ». */
export function Logo({ withTagline = false }: { withTagline?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 32 36" className="w-7 h-8 shrink-0" aria-hidden="true">
        <defs>
          <linearGradient id="vigie-shield" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#22B8B0" />
            <stop offset="0.6" stopColor="#1C9890" />
            <stop offset="1" stopColor="#E8892F" />
          </linearGradient>
        </defs>
        <path
          d="M16 1.5L29 6v10.2c0 8.3-5.5 14.6-13 18.3C8.5 30.8 3 24.5 3 16.2V6z"
          fill="none"
          stroke="url(#vigie-shield)"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d="M16 9.5a6 6 0 0 1 6 6c0 4.3-6 10-6 10s-6-5.7-6-10a6 6 0 0 1 6-6z"
          fill="#EAF6F4"
        />
        <circle cx="16" cy="15.5" r="2.4" fill="#081317" />
      </svg>
      <span className="leading-none">
        <span className="font-display font-bold text-[17px] tracking-tight">
          VIGIE <span className="text-lagoon">NC</span>
        </span>
        {withTagline && (
          <span className="block font-display text-[8.5px] tracking-[0.12em] text-mist-dim mt-0.5">
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
        <button type="button" onClick={onBack} aria-label="Retour" className="w-10 h-10 flex items-center justify-center text-mist">
          {back}
        </button>
      ) : backHref ? (
        <Link href={backHref} aria-label="Retour" className="w-10 h-10 flex items-center justify-center text-mist">
          {back}
        </Link>
      ) : (
        <span className="w-3" />
      )}
      <div className="flex-1 min-w-0">
        <h1 className="font-display font-semibold text-[17px] leading-tight truncate">{title}</h1>
        {subtitle && <p className="text-[11.5px] text-lagoon mt-0.5">{subtitle}</p>}
      </div>
      {right ?? <span className="w-10" />}
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
      className={`w-full rounded-xl bg-primary py-3.5 font-display font-semibold text-[14.5px] text-white disabled:opacity-40 active:bg-primary-strong ${className}`}
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
      className={`w-full rounded-xl border border-line bg-panel-2 py-3.5 font-display font-semibold text-[14px] text-mist disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}
