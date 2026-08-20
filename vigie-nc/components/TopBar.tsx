import Link from "next/link";

export function TopBarLive() {
  return (
    <div className="flex items-center justify-between px-3.5 pt-5 pb-2.5 shrink-0 z-10">
      <div className="flex items-center gap-1.5 font-display font-semibold text-sm">
        <BeaconIcon className="w-4 h-4 text-rust-bright" />
        Vigie NC
      </div>
      <div className="flex items-center gap-1.5 font-mono text-[9.5px] tracking-wider text-lagoon-dim bg-lagoon/10 border border-lagoon/30 px-2 py-1 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-lagoon animate-blink" />
        EN DIRECT
      </div>
    </div>
  );
}

export function TopBarPlain({
  title,
  backHref,
}: {
  title: string;
  backHref: string;
}) {
  return (
    <div className="flex items-center justify-between px-3.5 pt-5 pb-2.5 shrink-0 bg-panel z-10">
      <Link
        href={backHref}
        aria-label="Retour"
        className="text-mist text-2xl leading-none px-1.5"
      >
        ‹
      </Link>
      <div className="font-display font-semibold text-[14.5px]">{title}</div>
      <div className="w-[22px]" />
    </div>
  );
}

export function BeaconIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      className={className}
    >
      <path d="M9 21h6M10 21l.8-8h2.4l.8 8M9.4 13h5.2M10 13l.6-5h2.8l.6 5M11 8V3M4 6l3 1.4M20 6l-3 1.4M6 3l2 2M18 3l-2 2" />
    </svg>
  );
}
