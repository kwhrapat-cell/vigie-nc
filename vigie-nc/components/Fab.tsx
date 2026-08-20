import Link from "next/link";
import { Report, REPORT_TYPE_SEVERITY } from "@/lib/types";

const SEVERITY_BG: Record<string, string> = {
  rust: "bg-rust-bright",
  ochre: "bg-ochre",
  lagoon: "bg-lagoon",
};

function relativeMinutes(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 60) return `${min} min`;
  return `${Math.round(min / 60)} h`;
}

export function Fab() {
  return (
    <Link
      href="/signaler"
      aria-label="Signaler"
      className="absolute right-3.5 bottom-[104px] w-[50px] h-[50px] rounded-full flex items-center justify-center z-[15] animate-fab-in shadow-[0_10px_22px_-6px_rgba(193,68,14,0.55)]"
      style={{
        background: "linear-gradient(160deg, #E8622F, #C1440E)",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fff"
        strokeWidth={2.4}
        strokeLinecap="round"
        className="w-[22px] h-[22px]"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
    </Link>
  );
}

export function ActiveReportsSheet({ reports }: { reports: Report[] }) {
  return (
    <div className="bg-panel-2 rounded-t-[22px] px-3.5 pt-2.5 pb-4 relative z-[12] -mt-4">
      <div className="w-9 h-1 rounded-full bg-white/15 mx-auto mb-3" />
      <div className="font-body text-[12.5px] text-mist-dim mb-2.5">
        {reports.length} signalement{reports.length > 1 ? "s" : ""} actif
        {reports.length > 1 ? "s" : ""} près de vous
      </div>
      <div className="flex flex-col divide-y divide-white/[0.06]">
        {reports.map((r) => {
          const content = (
            <>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${SEVERITY_BG[REPORT_TYPE_SEVERITY[r.type]]} ${
                  r.type === "sos" ? "animate-blink" : ""
                }`}
              />
              <b className="font-medium">
                {r.type === "sos" ? "SOS" : r.zoneName ?? "Position signalée"}
              </b>
              <span className="text-mist-dim">{r.label}</span>
              <span className="ml-auto font-mono text-[10px] text-mist-dim opacity-70">
                {relativeMinutes(r.createdAt)}
              </span>
            </>
          );

          // Un SOS n'est pas rattaché à une zone suivie : pas d'écran
          // historique à ouvrir, juste l'info dans la feuille.
          return r.zoneId ? (
            <Link
              key={r.id}
              href={`/historique/${r.zoneId}`}
              className="flex items-center gap-2.5 py-2.5 text-[12px]"
            >
              {content}
            </Link>
          ) : (
            <div key={r.id} className="flex items-center gap-2.5 py-2.5 text-[12px]">
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
