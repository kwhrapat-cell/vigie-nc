"use client";

import { ReportType, REPORT_TYPE_LABELS } from "@/lib/types";

const ICONS: Record<Exclude<ReportType, "sos">, JSX.Element> = {
  trafic_dense: (
    <>
      <rect x="3" y="10" width="13" height="6" rx="2" />
      <circle cx="6.5" cy="17" r="1.4" />
      <circle cx="13.5" cy="17" r="1.4" />
      <path d="M16 12h3l2 3v1h-2" />
    </>
  ),
  accident: (
    <>
      <path d="M12 3l9 17H3L12 3z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  route_coupee: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M7 7l10 10" />
    </>
  ),
  inondation: <path d="M12 3c3 4 5 6.7 5 9.5A5 5 0 0 1 7 12.5C7 9.7 9 7 12 3z" />,
  chaussee_degradee: (
    <>
      <rect x="3" y="9" width="18" height="7" rx="1.5" />
      <path d="M8 9l1.5 7M14 9l1.5 7M3 12.5h18" />
    </>
  ),
  autre: (
    <>
      <circle cx="6" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="18" cy="12" r="1.2" />
    </>
  ),
};

export function ReportTypeGrid({
  value,
  onChange,
}: {
  value: ReportType | null;
  onChange: (type: ReportType) => void;
}) {
  // Le SOS a son propre bouton dédié (voir SosButton.tsx) — il ne
  // fait pas partie des options du formulaire de signalement standard.
  const types = (Object.keys(REPORT_TYPE_LABELS) as ReportType[]).filter(
    (t): t is Exclude<ReportType, "sos"> => t !== "sos",
  );

  return (
    <div className="grid grid-cols-2 gap-2.5 px-3.5 pt-4">
      {types.map((t) => {
        const selected = value === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className={`flex flex-col items-start gap-2 rounded-2xl border px-3 py-3 text-[12px] font-medium text-left transition-colors ${
              selected
                ? "border-rust-bright bg-rust-bright/10 text-mist"
                : "border-white/[0.09] bg-panel-2 text-mist-dim"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className={`w-5 h-5 ${selected ? "text-rust-bright" : ""}`}
            >
              {ICONS[t]}
            </svg>
            {REPORT_TYPE_LABELS[t]}
          </button>
        );
      })}
    </div>
  );
}
