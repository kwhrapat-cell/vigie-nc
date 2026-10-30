"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ModAnnoncesPanel } from "@/components/ModAnnoncesPanel";
import { ModIaPanel } from "@/components/ModIaPanel";
import { ModStatsPanel } from "@/components/ModStatsPanel";
import { SecurityAlarm } from "@/components/SecurityAlarm";
import { PrimaryButton, ScreenHeader, TypeTile } from "@/components/ui";
import { ajouterJours, aujourdhuiNoumea, CHANTIER_JOURS_MAX, libelleFinChantier } from "@/lib/chantier";
import { formatAge } from "@/lib/geo";
import {
  errorMessage,
  modAct,
  ModAction,
  modChantier,
  ModFilter,
  ModItem,
  modList,
  modVerify,
} from "@/lib/reports-api";
import { FlagReason, RELAY_SOURCE_LABELS, REPORT_TYPE_LABELS } from "@/lib/types";

// Le code reste sur ce téléphone, jamais affiché.
const CODE_KEY = "vigie-nc:code-moderation";

type Onglet = ModFilter | "annonces" | "chiffres" | "ia";

const MOTIFS_COURTS: Record<FlagReason, string> = {
  donnee_personnelle: "visage, plaque ou nom",
  inapproprie: "insulte ou choquant",
  hors_sujet: "hors sujet",
};

function readCode(): string | null {
  try {
    return window.localStorage.getItem(CODE_KEY);
  } catch {
    return null;
  }
}

function saveCode(code: string | null): void {
  try {
    if (code) window.localStorage.setItem(CODE_KEY, code);
    else window.localStorage.removeItem(CODE_KEY);
  } catch {
    // stockage indisponible : le code vaut pour cette visite seulement
  }
}

/** Écran de modération : protégé par un code personnel vérifié par le serveur. */
export default function ModerationPage() {
  const [code, setCode] = useState<string | null>(null);
  const [nom, setNom] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [input, setInput] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  // Onglets : les listes à modérer (dont les travaux, pour les chantiers),
  // les annonces générales, les chiffres d'utilisation, puis l'essai du
  // résumé automatique (IA)
  const [filter, setFilter] = useState<Onglet>("signales");
  const [items, setItems] = useState<ModItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Reconnexion automatique avec le code gardé sur le téléphone
  useEffect(() => {
    const saved = readCode();
    if (!saved) {
      setChecking(false);
      return;
    }
    modVerify(saved)
      .then((n) => {
        setCode(saved);
        setNom(n);
      })
      .catch(() => saveCode(null))
      .finally(() => setChecking(false));
  }, []);

  const load = useCallback(async () => {
    if (!code || filter === "chiffres" || filter === "annonces" || filter === "ia") return;
    setLoading(true);
    setListError(null);
    try {
      setItems(await modList(code, filter));
    } catch (e) {
      setListError(errorMessage(e, "Impossible de charger la liste — vérifie ta connexion."));
    } finally {
      setLoading(false);
    }
  }, [code, filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function login() {
    const c = input.trim();
    if (!c) return;
    setChecking(true);
    setLoginError(null);
    try {
      const n = await modVerify(c);
      saveCode(c);
      setCode(c);
      setNom(n);
      setInput("");
    } catch (e) {
      setLoginError(errorMessage(e, "Vérification impossible — vérifie ta connexion."));
    } finally {
      setChecking(false);
    }
  }

  function logout() {
    saveCode(null);
    setCode(null);
    setNom(null);
    setItems([]);
  }

  // ------------------------------------------------------------------
  // Connexion
  // ------------------------------------------------------------------
  if (!code) {
    return (
      <main className="min-h-[100dvh] pb-10">
        <ScreenHeader title="Modération" subtitle="Réservé aux modérateurs" backHref="/profil" />
        <div className="mx-4 mt-4 rounded-xl border border-line bg-panel px-4 py-4">
          <label htmlFor="code" className="block text-[12.5px] text-mist-dim mb-2">
            Ton code de modérateur
          </label>
          <input
            id="code"
            type="password"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            className="w-full rounded-xl border border-line bg-panel-2 px-3 py-3 font-mono text-[14px] focus:outline-none focus:border-lagoon"
          />
          {loginError && (
            <p className="mt-2 text-[12px] text-danger" role="alert">
              {loginError}
            </p>
          )}
          <PrimaryButton className="mt-3" disabled={checking || !input.trim()} onClick={login}>
            {checking ? "Vérification…" : "Entrer"}
          </PrimaryButton>
          <p className="mt-3 text-[11px] text-mist-dim leading-relaxed">
            Le code reste sur ce téléphone. Ne le partage pas et ne fais pas de capture d&apos;écran où il apparaît.
          </p>
        </div>
      </main>
    );
  }

  // ------------------------------------------------------------------
  // Liste à modérer
  // ------------------------------------------------------------------
  return (
    <main className="min-h-[100dvh] pb-10">
      <ScreenHeader
        title="Modération"
        subtitle={nom ? `Connecté : ${nom}` : undefined}
        backHref="/profil"
        right={
          <button type="button" onClick={logout} className="px-3 h-10 text-[12px] text-mist-dim underline">
            Quitter
          </button>
        }
      />

      <SecurityAlarm code={code} />

      <div className="mx-4 grid grid-cols-3 md:grid-cols-6 gap-1" role="tablist">
        {(
          [
            ["signales", "Signalés"],
            ["recents", "Récents"],
            ["travaux", "Travaux"],
            ["annonces", "Annonces"],
            ["chiffres", "Chiffres"],
            ["ia", "IA"],
          ] as [Onglet, string][]
        ).map(([f, label]) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={`rounded-lg py-2.5 text-[11.5px] font-medium border ${
              filter === f ? "bg-primary border-primary text-white" : "border-line bg-panel-2 text-mist-dim"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filter === "chiffres" && <ModStatsPanel code={code} />}

      {filter === "annonces" && <ModAnnoncesPanel code={code} />}

      {filter === "ia" && <ModIaPanel code={code} />}

      {(filter === "signales" || filter === "recents" || filter === "travaux") && (
        <>
          <div className="mx-4 mt-2 flex items-center justify-between text-[11.5px] text-mist-dim">
            <span>
              {loading
                ? "Chargement…"
                : filter === "signales"
                  ? `${items.length} à regarder (30 derniers jours)`
                  : filter === "travaux"
                    ? `${items.length} travaux (en cours, ou finis depuis moins de 7 jours)`
                    : `${items.length} signalement${items.length > 1 ? "s" : ""} (48 dernières heures)`}
            </span>
            <button type="button" onClick={load} disabled={loading} className="py-2 underline disabled:opacity-50">
              Actualiser
            </button>
          </div>

          {filter === "travaux" && (
            <p className="mx-4 mt-2 rounded-lg border border-line bg-panel px-3 py-2 text-[11.5px] leading-relaxed text-mist-dim">
              Chantier annoncé par une mairie, la Province ou la DITTT ? Mets sa date de fin : il reste sur la carte
              jusque-là. S&apos;il n&apos;est pas encore sur la carte, signale-le d&apos;abord depuis l&apos;appli (+ ›
              Travaux), puis reviens ici.
            </p>
          )}

          {listError && (
            <p className="mx-4 mt-2 text-[12px] text-danger" role="alert">
              {listError}
            </p>
          )}

          {!loading && !listError && items.length === 0 && (
            <p className="mx-4 mt-6 text-center text-[12.5px] text-mist-dim">
              {filter === "signales"
                ? "Rien à modérer pour l'instant."
                : filter === "travaux"
                  ? "Aucun travaux en cours."
                  : "Aucun signalement ces dernières 48 h."}
            </p>
          )}

          <div className="mt-3 flex flex-col gap-3">
            {items.map((item) => (
              <ModCard key={item.id} item={item} code={code} onDone={load} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------

function ModCard({ item, code, onDone }: { item: ModItem; code: string; onDone: () => void }) {
  const [busy, setBusy] = useState<ModAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [source, setSource] = useState("");
  // Chantier : source et date de fin (AAAA-MM-JJ)
  const [chantierOpen, setChantierOpen] = useState(false);
  const [chantierSource, setChantierSource] = useState("");
  const [chantierFin, setChantierFin] = useState("");
  const [chantierBusy, setChantierBusy] = useState(false);

  const masque = item.masqueAt !== null;
  const photo = item.photoUrl ?? item.photoMasquee;
  const texte = item.description ?? item.descriptionMasquee;
  const aContenu = Boolean(item.photoUrl || item.description);

  async function act(action: ModAction, valeur?: string) {
    if (action === "retirer" && !window.confirm("Retirer ce signalement de la carte pour tout le monde ?")) return;
    setBusy(action);
    setError(null);
    try {
      await modAct(code, item.id, action, valeur);
      setVerifyOpen(false);
      setSource("");
      onDone();
    } catch (e) {
      setError(errorMessage(e, "L'action n'a pas pu être faite — vérifie ta connexion."));
    } finally {
      setBusy(null);
    }
  }

  function ouvrirChantier() {
    const aujourdhui = aujourdhuiNoumea();
    setChantierSource(item.sourceOfficielle ?? "");
    setChantierFin(item.finAnnoncee && item.finAnnoncee >= aujourdhui ? item.finAnnoncee : ajouterJours(aujourdhui, 30));
    setChantierOpen(true);
  }

  async function validerChantier() {
    setChantierBusy(true);
    setError(null);
    try {
      await modChantier(code, item.id, chantierSource, chantierFin);
      setChantierOpen(false);
      onDone();
    } catch (e) {
      setError(errorMessage(e, "La date de fin n'a pas pu être enregistrée — vérifie ta connexion."));
    } finally {
      setChantierBusy(false);
    }
  }

  const motifs = Object.entries(item.motifs) as [FlagReason, number][];
  const aujourdhui = aujourdhuiNoumea();

  return (
    <article className="mx-4 rounded-xl border border-line bg-panel px-3.5 py-3">
      <div className="flex items-start gap-3">
        <TypeTile type={item.type} size={38} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[13.5px] leading-tight">{REPORT_TYPE_LABELS[item.type]}</p>
          <p className="text-[11px] text-mist-dim truncate">
            {[item.lieu, formatAge(item.createdAt)].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-[10.5px]">
        <span className={`rounded-full px-2 py-0.5 ${item.actif ? "bg-ok/15 text-ok" : "bg-white/10 text-mist-dim"}`}>
          {item.actif ? "Sur la carte" : "Terminé"}
        </span>
        {masque && <span className="rounded-full bg-danger/15 px-2 py-0.5 text-danger">Photo et texte masqués</span>}
        {item.sourceOfficielle && (
          <span className="rounded-full bg-info/15 px-2 py-0.5 text-info">Vérifié · {item.sourceOfficielle}</span>
        )}
        {item.relaisSource && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-mist-dim">
            Relayé · {RELAY_SOURCE_LABELS[item.relaisSource]}
          </span>
        )}
        {item.finAnnoncee && (
          <span className="rounded-full bg-ochre/15 px-2 py-0.5 text-ochre">
            Chantier · {libelleFinChantier(item.finAnnoncee)}
          </span>
        )}
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-mist-dim">
          {item.confirmations} « toujours là » · {item.infirmations} « terminé »
        </span>
      </div>

      {item.nbSignalements > 0 && (
        <p className="mt-2 rounded-lg border border-warn/30 bg-warn/10 px-2.5 py-1.5 text-[11.5px] text-warn">
          Signalé {item.nbSignalements} fois :{" "}
          {motifs.map(([m, n]) => `${MOTIFS_COURTS[m] ?? m}${n > 1 ? ` ×${n}` : ""}`).join(", ")}
        </p>
      )}

      {item.finAnnoncee && item.actif && item.infirmations > 0 && (
        <p className="mt-2 rounded-lg border border-warn/30 bg-warn/10 px-2.5 py-1.5 text-[11.5px] text-warn">
          {item.infirmations} personne{item.infirmations > 1 ? "s disent" : " dit"} que le chantier est terminé.
          Vérifie auprès de la source, puis retire-le de la carte ou change la date.
        </p>
      )}

      {photo && (
        <figure className="mt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo}
            alt="Photo du signalement"
            className={`w-full max-h-56 object-cover rounded-lg border border-line ${masque ? "opacity-60" : ""}`}
          />
          {masque && <figcaption className="mt-1 text-[10.5px] text-danger">Masquée : visible seulement ici</figcaption>}
        </figure>
      )}
      {texte && (
        <p className={`mt-2 text-[12.5px] leading-relaxed whitespace-pre-line ${masque ? "text-mist-dim italic" : ""}`}>
          {masque && <span className="not-italic text-danger text-[10.5px] block">Texte masqué :</span>}
          {texte}
        </p>
      )}
      {item.resumeIa && (
        <p className="mt-2 rounded-lg border border-lagoon/30 bg-lagoon/10 px-2.5 py-1.5 text-[12px] leading-relaxed">
          <span className="block text-[10.5px] font-semibold text-lagoon">
            Résumé IA · {item.resumeIaNb ?? 2} témoignages (masqué avec la photo et le texte)
          </span>
          {item.resumeIa}
        </p>
      )}

      {error && (
        <p className="mt-2 text-[12px] text-danger" role="alert">
          {error}
        </p>
      )}

      {verifyOpen && (
        <div className="mt-2.5 flex gap-2">
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            maxLength={60}
            placeholder="Source (ex. Mairie du Mont-Dore)"
            className="flex-1 min-w-0 rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-[12.5px] focus:outline-none focus:border-lagoon"
          />
          <button
            type="button"
            disabled={busy !== null || !source.trim()}
            onClick={() => act("verifier", source)}
            className="rounded-lg bg-info px-3 text-[12.5px] font-semibold text-white disabled:opacity-40"
          >
            Valider
          </button>
        </div>
      )}

      {chantierOpen && (
        <div className="mt-2.5 rounded-lg border border-line bg-panel-2 p-2.5">
          <label className="block text-[11.5px] text-mist-dim">
            Source officielle
            <input
              value={chantierSource}
              onChange={(e) => setChantierSource(e.target.value)}
              maxLength={60}
              placeholder="ex. Province Sud, Mairie de Païta"
              className="mt-1 w-full rounded-lg border border-line bg-panel px-2.5 py-2 text-[12.5px] text-mist focus:outline-none focus:border-lagoon"
            />
          </label>
          <label className="mt-2 block text-[11.5px] text-mist-dim">
            Fin annoncée (6 mois au plus)
            <input
              type="date"
              value={chantierFin}
              min={aujourdhui}
              max={ajouterJours(aujourdhui, CHANTIER_JOURS_MAX)}
              onChange={(e) => setChantierFin(e.target.value)}
              className="mt-1 w-full min-h-[44px] rounded-lg border border-line bg-panel px-2.5 py-2 text-[12.5px] text-mist [color-scheme:dark] focus:outline-none focus:border-lagoon"
            />
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <ActionButton disabled={chantierBusy} onClick={() => setChantierOpen(false)}>
              Annuler
            </ActionButton>
            <ActionButton
              tone="info"
              busy={chantierBusy}
              disabled={chantierBusy || !chantierSource.trim() || !chantierFin}
              onClick={validerChantier}
            >
              Valider
            </ActionButton>
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {item.type === "travaux" && !chantierOpen && (
          <ActionButton tone="info" disabled={busy !== null} onClick={ouvrirChantier}>
            {item.finAnnoncee ? "Changer la date de fin" : "Chantier : date de fin"}
          </ActionButton>
        )}
        {aContenu && !masque && (
          <ActionButton tone="danger" busy={busy === "masquer"} disabled={busy !== null} onClick={() => act("masquer")}>
            Masquer photo et texte
          </ActionButton>
        )}
        {masque && (
          <ActionButton busy={busy === "retablir"} disabled={busy !== null} onClick={() => act("retablir")}>
            Rétablir le contenu
          </ActionButton>
        )}
        {item.nbSignalements > 0 && !masque && (
          <ActionButton tone="ok" busy={busy === "ignorer"} disabled={busy !== null} onClick={() => act("ignorer")}>
            C&apos;est OK
          </ActionButton>
        )}
        {item.sourceOfficielle ? (
          <ActionButton busy={busy === "deverifier"} disabled={busy !== null} onClick={() => act("deverifier")}>
            {item.finAnnoncee ? "Retirer « Vérifié » et la date" : "Retirer « Vérifié »"}
          </ActionButton>
        ) : (
          !verifyOpen &&
          item.type !== "sos" && (
            <ActionButton tone="info" disabled={busy !== null} onClick={() => setVerifyOpen(true)}>
              Marquer vérifié
            </ActionButton>
          )
        )}
        {item.actif && (
          <ActionButton tone="danger" busy={busy === "retirer"} disabled={busy !== null} onClick={() => act("retirer")}>
            Retirer de la carte
          </ActionButton>
        )}
        {item.type !== "sos" && (
          <Link
            href={`/?signalement=${item.id}`}
            className="rounded-lg border border-line bg-panel-2 py-2.5 text-center text-[12px] font-medium"
          >
            Voir sur la carte
          </Link>
        )}
      </div>
    </article>
  );
}

function ActionButton({
  children,
  tone,
  busy,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  tone?: "danger" | "ok" | "info";
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const colors =
    tone === "danger"
      ? "border-danger/40 bg-danger/10 text-danger"
      : tone === "ok"
        ? "border-ok/40 bg-ok/10 text-ok"
        : tone === "info"
          ? "border-info/40 bg-info/10 text-info"
          : "border-line bg-panel-2 text-mist";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border py-2.5 text-[12px] font-semibold disabled:opacity-50 ${colors}`}
    >
      {busy ? "…" : children}
    </button>
  );
}
