"use client";

export const RADIUS_OPTIONS_KM = [1, 3, 5] as const;
export type RadiusKm = (typeof RADIUS_OPTIONS_KM)[number];

export function RadiusSelector({
  value,
  onChange,
  disabled,
}: {
  value: RadiusKm;
  onChange: (km: RadiusKm) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Rayon de la zone surveillée"
      className={`flex items-center gap-1 rounded-full bg-void/85 border border-white/[0.1] p-1 backdrop-blur ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <span className="font-mono text-[9.5px] tracking-wider text-mist-dim pl-2 pr-1">
        ZONE
      </span>
      {RADIUS_OPTIONS_KM.map((km) => {
        const selected = km === value;
        return (
          <button
            key={km}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(km)}
            className={`min-w-[44px] h-8 rounded-full px-2 text-[12px] font-medium transition-colors ${
              selected ? "bg-lagoon text-void" : "text-mist-dim"
            }`}
          >
            {km} km
          </button>
        );
      })}
    </div>
  );
}

export function RecenterButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`w-11 h-11 rounded-full flex items-center justify-center border backdrop-blur ${
        active
          ? "bg-lagoon/20 border-lagoon/50 text-lagoon"
          : "bg-void/85 border-white/[0.12] text-mist"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        className="w-5 h-5"
      >
        <circle cx="12" cy="12" r="3.2" fill={active ? "currentColor" : "none"} />
        <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
        <circle cx="12" cy="12" r="7.5" />
      </svg>
    </button>
  );
}
