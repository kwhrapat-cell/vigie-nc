"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { carteHorsLigneDisponible, CARTE_EVENT } from "@/lib/carte-hors-ligne";
import { demoActive } from "@/lib/demo";
import { annoncesPourMoi, destinataires, libelleZone } from "@/lib/annonces-zone";
import { formatAge, type LatLng } from "@/lib/geo";
import { useAnnonces } from "@/lib/useAnnonces";
import { Annonce, ANNONCE_NIVEAU_LABELS, AnnonceNiveau } from "@/lib/types";

// Bandeau des annonces générales, en haut de la carte : vu par tout le
// monde, quelle que soit la zone choisie. Une annonce de commune n'est
// montrée que dans son périmètre (position, sinon « Ma zone » : tri fait
// sur le téléphone, lib/annonces-zone.ts). « Masquer » le réduit à une
// petite pastille (sur ce téléphone seulement), jamais plus : une annonce
// en cours reste toujours visible.

const HIDDEN_KEY = "vigie-nc:annonces-masquees";
const HIDDEN_MAX = 20;
// Au-delà, le texte est replié sur 3 lignes avec « Lire la suite ».
const LONG_TEXT = 150;

const STYLES: Record<AnnonceNiveau, { box: string; accent: string; icon: string }> = {
  urgence: { box: "border-danger/50 bg-danger/15", accent: "text-danger", icon: "bg-danger text-white" },
  vigilance: { box: "border-warn/45 bg-warn/10", accent: "text-warn", icon: "bg-warn text-void" },
  info: { box: "border-lagoon/35 bg-lagoon/10", accent: "text-lagoon", icon: "bg-lagoon/20 text-lagoon" },
};

const TZ = "Pacific/Noumea";
const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const jour = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "short", day: "numeric" });
const jourCle = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** « jusqu'à 18:30 » ou « jusqu'au mer. 21, 08:00 » (heure de Nouméa) */
export function finAnnonce(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  if (jourCle.format(d) === jourCle.format(new Date(now))) return `jusqu'à ${heure.format(d)}`;
  return `jusqu'au ${jour.format(d)}, ${heure.format(d)}`;
}

function readHidden(): string[] {
  try {
    const raw = window.localStorage.getItem(HIDDEN_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveHidden(ids: string[]): void {
  try {
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids.slice(-HIDDEN_MAX)));
  } catch {
    // stockage indisponible : masqué pour cette visite seulement
  }
}

// Rappel « garde la carte sur ton téléphone » sous une annonce Vigilance ou
// Urgence (décision de Patrice du 11/11/2026) : seulement s'il n'y a pas
// encore de carte sans réseau, et plus pour cette annonce après « Plus tard ».
const RAPPEL_PLUS_TARD_KEY = "vigie-nc:rappel-carte-plus-tard";

function lireListe(cle: string): string[] {
  try {
    const raw = window.localStorage.getItem(cle);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function RappelCarte({ annonceId }: { annonceId: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const verifier = () =>
      setVisible(
        !demoActive() && navigator.onLine && !carteHorsLigneDisponible() && !lireListe(RAPPEL_PLUS_TARD_KEY).includes(annonceId),
      );
    verifier();
    window.addEventListener(CARTE_EVENT, verifier);
    window.addEventListener("online", verifier);
    window.addEventListener("offline", verifier);
    return () => {
      window.removeEventListener(CARTE_EVENT, verifier);
      window.removeEventListener("online", verifier);
      window.removeEventListener("offline", verifier);
    };
  }, [annonceId]);
  if (!visible) return null;
  return (
    <div className="mt-1 mb-1 border-t border-white/10 pt-2.5 pl-[38px]">
      <p className="text-[14px] leading-snug text-mist">
        Le réseau peut couper : garde la carte de ta zone sur ton téléphone, tant que ça capte.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Link
          href="/carte-hors-ligne?auto=zone"
          className="flex min-h-[44px] items-center rounded-lg bg-primary px-3.5 text-[14px] font-semibold text-white"
        >
          Télécharger la carte
        </Link>
        <button
          type="button"
          onClick={() => {
            const liste = [...lireListe(RAPPEL_PLUS_TARD_KEY).filter((x) => x !== annonceId), annonceId].slice(-20);
            try {
              window.localStorage.setItem(RAPPEL_PLUS_TARD_KEY, JSON.stringify(liste));
            } catch {
              // sans stockage : caché pour cette visite seulement
            }
            setVisible(false);
          }}
          className="min-h-[44px] rounded-lg border border-white/15 px-3.5 text-[14px] font-medium text-mist-dim"
        >
          Plus tard
        </button>
      </div>
    </div>
  );
}

export function MegaphoneIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden>
      <path d="M3 10v4a1 1 0 0 0 1 1h2l5 4V5L6 9H4a1 1 0 0 0-1 1z" strokeLinejoin="round" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" strokeLinecap="round" />
    </svg>
  );
}

/** Une annonce, telle que tout le monde la voit (sert aussi d'aperçu dans /moderation). */
export function AnnonceCard({
  annonce,
  position,
  onNext,
  onHide,
  defaultOpen = false,
  rappelCarte = false,
}: {
  annonce: Annonce;
  position?: { index: number; total: number };
  onNext?: () => void;
  onHide?: () => void;
  defaultOpen?: boolean;
  /** Proposer la carte sans réseau (vigilance, urgence ; pas dans les aperçus). */
  rappelCarte?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const s = STYLES[annonce.niveau];
  const long = annonce.texte.length > LONG_TEXT || annonce.texte.split("\n").length > 3;

  return (
    <section
      aria-label={`Annonce ${destinataires(annonce)} : ${ANNONCE_NIVEAU_LABELS[annonce.niveau]}`}
      className={`rounded-xl border px-3 pt-2.5 pb-1.5 ${s.box}`}
    >
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 w-7 h-7 shrink-0 rounded-full flex items-center justify-center ${s.icon}`}>
          <MegaphoneIcon />
        </span>
        <div className="flex-1 min-w-0">
          <p className={`font-mono text-[12px] tracking-wider uppercase truncate ${s.accent}`}>
            {ANNONCE_NIVEAU_LABELS[annonce.niveau]} · {annonce.source ?? "Vigie NC"}
          </p>
          <p
            className={`mt-0.5 text-[15px] leading-snug text-mist whitespace-pre-line break-words ${
              long && !open ? "line-clamp-3" : ""
            }`}
          >
            {annonce.texte}
          </p>
        </div>
        {onHide && (
          <button
            type="button"
            onClick={onHide}
            aria-label="Réduire l'annonce"
            className="-mr-2 -mt-1.5 w-11 h-11 shrink-0 flex items-center justify-center text-mist-dim"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      <div className="mt-0.5 flex items-center gap-2 pl-[38px] text-[12.5px] text-mist-dim">
        <span className="flex-1 min-w-0 truncate">
          {libelleZone(annonce)} · {formatAge(annonce.createdAt)} · {finAnnonce(annonce.expiresAt)}
        </span>
        {long && (
          <button type="button" onClick={() => setOpen((o) => !o)} className={`py-2 font-medium ${s.accent}`}>
            {open ? "Réduire" : "Lire la suite"}
          </button>
        )}
        {position && position.total > 1 && onNext && (
          <button
            type="button"
            onClick={onNext}
            aria-label="Annonce suivante"
            className="min-h-[44px] px-2 -mr-1 flex items-center font-medium text-mist"
          >
            {position.index + 1}/{position.total} ›
          </button>
        )}
      </div>
      {rappelCarte && annonce.niveau !== "info" && <RappelCarte annonceId={annonce.id} />}
    </section>
  );
}

/**
 * Bandeau de l'accueil : annonces en cours pour toute la Calédonie, et
 * celles de la commune où se trouve `centre` (position, sinon « Ma zone »).
 * `masque` : un bandeau plus important est affiché (lib/bandeaux.ts) —
 * l'annonce reste alors visible en petite pastille. `onPresence` dit à
 * l'accueil s'il y a une annonce à montrer, et de quel niveau.
 */
export function AnnonceBanner({
  masque = false,
  onPresence,
  centre = null,
}: {
  masque?: boolean;
  onPresence?: (niveau: "alerte" | "info" | null) => void;
  centre?: LatLng | null;
} = {}) {
  const toutes = useAnnonces();
  const [hidden, setHidden] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [opened, setOpened] = useState<string | null>(null);

  // Lien d'une notification (?annonce=<id>) : l'annonce s'affiche en entier.
  useEffect(() => {
    let list = readHidden();
    const params = new URLSearchParams(window.location.search);
    const id = params.get("annonce");
    if (id) {
      list = list.filter((x) => x !== id);
      saveHidden(list);
      setOpened(id);
      params.delete("annonce");
      const q = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
    }
    setHidden(list);
  }, []);

  // Arrondi à ~100 m : la liste n'est pas recalculée à chaque pas.
  const centreLat = centre ? Math.round(centre.lat * 1000) / 1000 : null;
  const centreLng = centre ? Math.round(centre.lng * 1000) / 1000 : null;
  const annonces = useMemo(
    () =>
      annoncesPourMoi(
        toutes,
        centreLat !== null && centreLng !== null ? { lat: centreLat, lng: centreLng } : null,
        opened,
      ),
    [toutes, centreLat, centreLng, opened],
  );

  const visibles = useMemo(() => annonces.filter((a) => !hidden.includes(a.id)), [annonces, hidden]);

  // Urgence ou vigilance : passe avant tous les autres bandeaux.
  const niveauPresent: "alerte" | "info" | null =
    visibles.length === 0 ? null : visibles.some((a) => a.niveau !== "info") ? "alerte" : "info";
  useEffect(() => {
    onPresence?.(niveauPresent);
  }, [niveauPresent, onPresence]);
  useEffect(() => () => onPresence?.(null), [onPresence]);

  // Annonce ouverte depuis une notification : affichée en premier.
  useEffect(() => {
    if (!opened) return;
    const i = visibles.findIndex((a) => a.id === opened);
    if (i >= 0) setIndex(i);
  }, [opened, visibles]);

  if (annonces.length === 0) return null;

  // Réduite par la personne, ou en attente derrière un bandeau plus
  // important : petite pastille, jamais plus.
  if (visibles.length === 0 || masque) {
    const top = annonces[0];
    const s = STYLES[top.niveau];
    return (
      <div className="mx-4 mb-2">
        <button
          type="button"
          onClick={() => {
            const ids = annonces.map((a) => a.id);
            const next = hidden.filter((x) => !ids.includes(x));
            setHidden(next);
            saveHidden(next);
            setIndex(0);
          }}
          className={`flex min-h-[40px] w-full items-center gap-2 rounded-full border px-3 text-left text-[14px] ${s.box}`}
        >
          <span className={s.accent}>
            <MegaphoneIcon />
          </span>
          <span className="flex-1 min-w-0 truncate text-mist">
            {annonces.length > 1 ? `${annonces.length} annonces en cours` : "Annonce en cours"} ·{" "}
            <span className={s.accent}>{ANNONCE_NIVEAU_LABELS[top.niveau]}</span>
          </span>
          <span className="text-mist-dim">Voir</span>
        </button>
      </div>
    );
  }

  const i = Math.min(index, visibles.length - 1);
  const annonce = visibles[i];

  return (
    <div className="mx-4 mb-2">
      <AnnonceCard
        key={annonce.id}
        annonce={annonce}
        defaultOpen={annonce.id === opened}
        rappelCarte
        position={{ index: i, total: visibles.length }}
        onNext={() => setIndex((i + 1) % visibles.length)}
        onHide={() => {
          const next = [...hidden.filter((x) => x !== annonce.id), annonce.id];
          setHidden(next);
          saveHidden(next);
        }}
      />
    </div>
  );
}
