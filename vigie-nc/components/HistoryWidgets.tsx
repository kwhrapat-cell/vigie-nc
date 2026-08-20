import { ZoneHistory } from "@/lib/types";

const MONTH_LABELS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

const SEVERITY_BG: Record<string, string> = {
  rust: "bg-rust-bright",
  ochre: "bg-ochre",
  lagoon: "bg-lagoon",
};

export function RiskBadge({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mx-3.5 mt-4 px-3 py-2.5 rounded-xl bg-rust-bright/10 border border-rust-bright/30 text-[12.5px] text-mist">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        className="w-[18px] h-[18px] text-rust-bright shrink-0"
      >
        <path d="M12 3l9 17H3L12 3z" />
        <path d="M12 10v4M12 17h.01" />
      </svg>
      {label}
    </div>
  );
}

export function StatBig({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center text-center px-3.5 pt-6 pb-4">
      <span className="font-display font-bold text-[40px] leading-none">
        {value}
      </span>
      <span className="text-[11px] text-mist-dim mt-1.5">{label}</span>
    </div>
  );
}

export function MonthlyBars({ counts }: { counts: number[] }) {
  const max = Math.max(...counts, 1);
  const peakIndexes = new Set(
    counts
      .map((v, i) => [v, i] as const)
      .sort((a, b) => b[0] - a[0])
      .slice(0, 2)
      .map(([, i]) => i),
  );

  return (
    <div className="flex items-end gap-1 h-[72px] px-3.5">
      {counts.map((v, i) => (
        <div
          key={i}
          className="flex-1 flex flex-col items-center gap-1 h-full justify-end"
        >
          <div
            className={`w-full rounded-t-[3px] ${
              peakIndexes.has(i) ? "bg-rust-bright" : "bg-lagoon opacity-55"
            }`}
            style={{ height: `${Math.max((v / max) * 100, 4)}%` }}
          />
          <span className="font-mono text-[7.5px] text-mist-dim opacity-60">
            {MONTH_LABELS[i]}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Timeline({ items }: { items: ZoneHistory["timeline"] }) {
  return (
    <div className="px-3.5 pt-3 border-t border-white/[0.09] mt-2">
      {items.map((item) => (
        <div key={item.id} className="flex gap-2.5 py-2">
          <span
            className={`w-[7px] h-[7px] rounded-full mt-1.5 shrink-0 ${SEVERITY_BG[item.severity]}`}
          />
          <div>
            <div className="text-[11px] leading-snug">{item.text}</div>
            <div className="font-mono text-[9px] text-mist-dim opacity-70 mt-0.5">
              {item.relativeTime} · confirmé par {item.confirmations} personne
              {item.confirmations > 1 ? "s" : ""}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Legend() {
  return (
    <div className="max-w-[520px] mx-auto mt-16 text-center">
      <div className="font-mono text-[10.5px] tracking-wider text-mist-dim opacity-70 mb-4">
        LÉGENDE DES SIGNALEMENTS
      </div>
      <div className="flex justify-center gap-6 flex-wrap text-[12px] text-mist-dim">
        <span className="flex items-center gap-2">
          <span className="w-[9px] h-[9px] rounded-full bg-rust-bright" />
          Danger / route coupée
        </span>
        <span className="flex items-center gap-2">
          <span className="w-[9px] h-[9px] rounded-full bg-ochre" />
          Ralentissement / travaux
        </span>
        <span className="flex items-center gap-2">
          <span className="w-[9px] h-[9px] rounded-full bg-lagoon" />
          Inondation / risque météo
        </span>
      </div>
    </div>
  );
}
