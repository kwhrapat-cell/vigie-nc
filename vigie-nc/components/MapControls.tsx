"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MAP_STYLES } from "@/lib/map-styles";
import { MapStyle, RADIUS_OPTIONS_KM, type ZoneChoice } from "@/lib/preferences";

const ZONE_OPTIONS: { value: ZoneChoice; label: string; title: string }[] = [
  { value: "nc", label: "NC", title: "Toute la Nouvelle-Calédonie" },
  ...RADIUS_OPTIONS_KM.map((km) => ({ value: km as ZoneChoice, label: `${km} km`, title: `${km} km autour de moi` })),
];

/** Choix de la zone : toute la Calédonie, ou 1 / 3 / 5 km autour de soi. */
export function ZoneSelector({
  value,
  onChange,
  hasPosition,
}: {
  value: ZoneChoice;
  onChange: (zone: ZoneChoice) => void;
  hasPosition: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Zone affichée"
      className="flex items-center gap-0.5 rounded-full bg-void/90 border border-line p-1 backdrop-blur shadow-[0_6px_16px_-8px_rgba(0,0,0,0.7)]"
    >
      {ZONE_OPTIONS.map((o) => {
        const selected = o.value === value;
        const disabled = o.value !== "nc" && !hasPosition;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o.title}
            title={disabled ? "Position nécessaire" : o.title}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`relative min-w-[44px] h-9 rounded-full px-2.5 text-[14px] font-medium transition-colors disabled:opacity-40 before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] ${
              selected ? "bg-primary text-white" : "text-mist-dim"
            } ${o.value === "nc" ? "font-display font-bold tracking-wide" : ""}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function RoundButton({
  active,
  label,
  onClick,
  children,
  expanded,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={expanded}
      title={label}
      className={`w-11 h-11 rounded-full flex items-center justify-center border backdrop-blur shadow-[0_6px_16px_-8px_rgba(0,0,0,0.7)] ${
        active ? "bg-primary border-primary text-white" : "bg-void/90 border-line text-mist"
      }`}
    >
      {children}
    </button>
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
    <RoundButton active={active} label={label} onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="w-5 h-5">
        <circle cx="12" cy="12" r="3.2" fill={active ? "currentColor" : "none"} />
        <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
        <circle cx="12" cy="12" r="7.5" />
      </svg>
    </RoundButton>
  );
}

/** Bouton « calques » : choix du fond de carte. */
export function MapStyleSwitcher({
  value,
  onChange,
}: {
  value: MapStyle;
  onChange: (style: MapStyle) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Ferme le menu quand on touche ailleurs
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <RoundButton active={open} label="Fond de carte" onClick={() => setOpen((o) => !o)} expanded={open}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" className="w-5 h-5">
          <path d="M12 3l9 5-9 5-9-5z" />
          <path d="M3 12.5l9 5 9-5" />
          <path d="M3 17l9 5 9-5" />
        </svg>
      </RoundButton>
      {open && (
        <div
          role="radiogroup"
          aria-label="Fond de carte"
          className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-line bg-panel/95 backdrop-blur p-1.5 shadow-[0_12px_28px_-10px_rgba(0,0,0,0.8)]"
        >
          {(Object.keys(MAP_STYLES) as MapStyle[]).map((s) => {
            const selected = s === value;
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ${
                  selected ? "bg-primary/20" : ""
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full border-2 shrink-0 ${
                    selected ? "border-lagoon bg-lagoon" : "border-mist-dim"
                  }`}
                />
                <span>
                  <span className="block text-[15px] font-medium">{MAP_STYLES[s].label}</span>
                  <span className="block text-[12.5px] text-mist-dim">{MAP_STYLES[s].hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Plein écran (ordinateur) : la carte sur tout l'écran, par exemple pour un
 * écran de salle de crise. Absent si le navigateur ne le permet pas.
 */
export function PleinEcranButton() {
  const [possible, setPossible] = useState(false);
  const [actif, setActif] = useState(false);
  useEffect(() => {
    setPossible(Boolean(document.fullscreenEnabled));
    const maj = () => setActif(Boolean(document.fullscreenElement));
    maj();
    document.addEventListener("fullscreenchange", maj);
    return () => document.removeEventListener("fullscreenchange", maj);
  }, []);
  if (!possible) return null;
  const basculer = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  return (
    <RoundButton active={actif} label={actif ? "Quitter le plein écran" : "Plein écran"} onClick={basculer}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
        {actif ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
      </svg>
    </RoundButton>
  );
}
