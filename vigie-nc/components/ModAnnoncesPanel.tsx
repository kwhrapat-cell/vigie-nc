"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnnonceCard, finAnnonce } from "./AnnonceBanner";
import { PrimaryButton } from "./ui";
import { formatAge } from "@/lib/geo";
import { errorMessage, modAnnoncePublier, modAnnonceRetirer, ModAnnonces, modAnnonces } from "@/lib/reports-api";
import {
  Annonce,
  ANNONCE_DUREES_H,
  ANNONCE_NIVEAU_LABELS,
  ANNONCE_NIVEAUX,
  ANNONCE_NOTIF_MAX_24H,
  ANNONCE_SOURCE_MAX,
  ANNONCE_TEXTE_MAX,
  ANNONCE_TEXTE_MIN,
  AnnonceNiveau,
} from "@/lib/types";

// Onglet « Annonces » de /moderation : publier un message vu par TOUT le
// monde, dans toute la Calédonie (bandeau en haut de la carte), et le
// retirer. Voir moderation_annonce_publier() dans supabase/schema.sql.

const NIVEAU_AIDE: Record<AnnonceNiveau, string> = {
  info: "Rappel, travaux prévus, info pratique.",
  vigilance: "Alerte météo, route nationale coupée.",
  urgence: "Cyclone, évacuation, danger immédiat.",
};

const NIVEAU_ACTIF: Record<AnnonceNiveau, string> = {
  info: "border-lagoon bg-lagoon/15 text-lagoon",
  vigilance: "border-warn bg-warn/15 text-warn",
  urgence: "border-danger bg-danger/15 text-danger",
};

export function ModAnnoncesPanel({ code }: { code: string }) {
  const [data, setData] = useState<ModAnnonces | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [niveau, setNiveau] = useState<AnnonceNiveau>("vigilance");
  const [texte, setTexte] = useState("");
  const [source, setSource] = useState("");
  const [dureeH, setDureeH] = useState<number>(6);
  const [notifier, setNotifier] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      setData(await modAnnonces(code));
    } catch (e) {
      setListError(errorMessage(e, "Impossible de charger les annonces — vérifie ta connexion."));
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    load();
  }, [load]);

  const notifRestantes = Math.max(0, ANNONCE_NOTIF_MAX_24H - (data?.notifiees24h ?? 0));
  const peutNotifier = niveau !== "info" && notifRestantes > 0;
  const longueur = texte.trim().length;
  const texteOk = longueur >= ANNONCE_TEXTE_MIN && longueur <= ANNONCE_TEXTE_MAX;

  // Ce que tout le monde verra (aperçu en direct)
  const apercu: Annonce = useMemo(
    () => ({
      id: "apercu",
      niveau,
      texte: texte.trim() || "Ton message apparaîtra ici.",
      source: source.trim() || null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + dureeH * 3_600_000).toISOString(),
    }),
    [niveau, texte, source, dureeH],
  );

  function changeNiveau(n: AnnonceNiveau) {
    setNiveau(n);
    if (n === "info") setNotifier(false);
  }

  async function publier() {
    if (!texteOk || busy) return;
    const avecNotif = notifier && peutNotifier;
    const abonnes = data?.abonnes ?? 0;
    const message =
      `Publier cette annonce (${ANNONCE_NIVEAU_LABELS[niveau]}) pour TOUTE la Calédonie, pendant ${dureeH} h ?` +
      (avecNotif
        ? `\n\nUne notification partira aussi vers ${abonnes} téléphone${abonnes > 1 ? "s" : ""} abonné${abonnes > 1 ? "s" : ""}, partout en Calédonie.`
        : "");
    if (!window.confirm(message)) return;

    setBusy(true);
    setFormError(null);
    setNotice(null);
    try {
      const out = await modAnnoncePublier(code, {
        niveau,
        texte,
        source: source.trim() || null,
        dureeH,
        notifier: avecNotif,
      });
      setTexte("");
      setSource("");
      setNotifier(false);
      setNotice(
        "Annonce publiée : elle est maintenant en haut de la carte de tout le monde." +
          (avecNotif && !out.notifiee
            ? " La notification n'a pas pu partir (envoi des alertes non configuré dans la base)."
            : avecNotif
              ? " La notification part vers les abonnés."
              : ""),
      );
      load();
    } catch (e) {
      setFormError(errorMessage(e, "L'annonce n'a pas pu être publiée — vérifie ta connexion."));
    } finally {
      setBusy(false);
    }
  }

  const enCours = data?.annonces.filter((a) => a.actif) ?? [];
  const passees = data?.annonces.filter((a) => !a.actif) ?? [];

  return (
    <div className="mt-3 flex flex-col gap-3">
      {/* ---------------- Nouvelle annonce ---------------- */}
      <section className="mx-4 rounded-xl border border-line bg-panel px-3.5 py-3.5">
        <h2 className="font-display font-semibold text-[14.5px]">Nouvelle annonce pour toute la Calédonie</h2>
        <p className="mt-1 text-[11.5px] text-mist-dim leading-relaxed">
          Elle s&apos;affiche en haut de la carte de <strong className="text-mist">tout le monde</strong>, quelle que
          soit sa zone, jusqu&apos;à l&apos;heure de fin. Seulement des faits vérifiés, jamais de nom de personne.
        </p>

        <p className="mt-3 text-[12px] font-medium">Niveau</p>
        <div className="mt-1.5 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Niveau de l'annonce">
          {ANNONCE_NIVEAUX.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={niveau === n}
              onClick={() => changeNiveau(n)}
              className={`rounded-lg border py-2.5 text-[13px] font-semibold ${
                niveau === n ? NIVEAU_ACTIF[n] : "border-line bg-panel-2 text-mist-dim"
              }`}
            >
              {ANNONCE_NIVEAU_LABELS[n]}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11.5px] text-mist-dim">{NIVEAU_AIDE[niveau]}</p>

        <label htmlFor="annonce-texte" className="mt-3 block text-[12px] font-medium">
          Message
        </label>
        <textarea
          id="annonce-texte"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          maxLength={ANNONCE_TEXTE_MAX}
          rows={4}
          placeholder="ex. RT1 coupée au col de la Pirogue (éboulement). Passer par la côte, prévoir 30 min de plus."
          className="mt-1.5 w-full resize-none rounded-xl border border-line bg-panel-2 px-3 py-2.5 text-[13.5px] leading-snug focus:outline-none focus:border-lagoon"
        />
        <p className={`text-right text-[11px] ${longueur > 0 && !texteOk ? "text-danger" : "text-mist-dim"}`}>
          {longueur}/{ANNONCE_TEXTE_MAX}
        </p>

        <label htmlFor="annonce-source" className="mt-1 block text-[12px] font-medium">
          Source <span className="font-normal text-mist-dim">(facultatif)</span>
        </label>
        <input
          id="annonce-source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          maxLength={ANNONCE_SOURCE_MAX}
          placeholder="ex. Sécurité civile — vide = Vigie NC"
          className="mt-1.5 w-full rounded-xl border border-line bg-panel-2 px-3 py-2.5 text-[13.5px] focus:outline-none focus:border-lagoon"
        />
        <p className="mt-1 text-[11px] text-mist-dim">Écris une source seulement si l&apos;info vient vraiment d&apos;elle.</p>

        <p className="mt-3 text-[12px] font-medium">Durée d&apos;affichage</p>
        <div className="mt-1.5 grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Durée d'affichage">
          {ANNONCE_DUREES_H.map((h) => (
            <button
              key={h}
              type="button"
              role="radio"
              aria-checked={dureeH === h}
              onClick={() => setDureeH(h)}
              className={`rounded-lg border py-2.5 text-[12.5px] font-medium ${
                dureeH === h ? "border-primary bg-primary text-white" : "border-line bg-panel-2 text-mist-dim"
              }`}
            >
              {h} h
            </button>
          ))}
        </div>

        <label
          className={`mt-3 flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${
            peutNotifier ? "border-line bg-panel-2" : "border-line/60 bg-panel-2/50 opacity-60"
          }`}
        >
          <input
            type="checkbox"
            checked={notifier && peutNotifier}
            disabled={!peutNotifier}
            onChange={(e) => setNotifier(e.target.checked)}
            className="mt-0.5 w-5 h-5 shrink-0 accent-[#1C9890]"
          />
          <span className="text-[12px] leading-snug">
            Envoyer aussi une <strong>notification</strong> à tous les abonnés aux alertes
            {data ? ` (${data.abonnes} téléphone${data.abonnes > 1 ? "s" : ""})` : ""}
            <span className="mt-0.5 block text-[11px] text-mist-dim">
              {niveau === "info"
                ? "Pas pour une simple info : choisis Vigilance ou Urgence."
                : notifRestantes === 0
                  ? "Déjà 3 notifications ces dernières 24 h : c'est le maximum."
                  : `Partout en Calédonie, même loin. À garder pour les vraies urgences : encore ${notifRestantes} possible${notifRestantes > 1 ? "s" : ""} sur 24 h.`}
            </span>
          </span>
        </label>

        <p className="mt-3 text-[12px] font-medium">Ce que tout le monde verra</p>
        <div className={`mt-1.5 ${texte.trim() ? "" : "opacity-60"}`}>
          <AnnonceCard annonce={apercu} defaultOpen />
        </div>

        {formError && (
          <p className="mt-2 text-[12px] text-danger" role="alert">
            {formError}
          </p>
        )}
        {notice && (
          <p className="mt-2 rounded-lg border border-ok/30 bg-ok/10 px-2.5 py-2 text-[12px] text-ok" role="status">
            {notice}
          </p>
        )}

        <PrimaryButton className="mt-3" disabled={busy || !texteOk} onClick={publier}>
          {busy ? "Publication…" : "Publier pour toute la Calédonie"}
        </PrimaryButton>
      </section>

      {/* ---------------- Annonces publiées ---------------- */}
      <div className="mx-4 flex items-center justify-between text-[11.5px] text-mist-dim">
        <span>
          {loading
            ? "Chargement…"
            : `${enCours.length} en cours · ${data?.publiees24h ?? 0}/10 publiées en 24 h`}
        </span>
        <button type="button" onClick={load} disabled={loading} className="py-2 underline disabled:opacity-50">
          Actualiser
        </button>
      </div>

      {listError && (
        <p className="mx-4 text-[12px] text-danger" role="alert">
          {listError}
        </p>
      )}

      {enCours.map((a) => (
        <AnnonceItem key={a.id} annonce={a} code={code} onDone={load} />
      ))}

      {passees.length > 0 && (
        <>
          <p className="mx-4 mt-1 text-[12px] font-medium text-mist-dim">Ces 7 derniers jours</p>
          {passees.map((a) => (
            <AnnonceItem key={a.id} annonce={a} code={code} onDone={load} />
          ))}
        </>
      )}

      {!loading && !listError && data && data.annonces.length === 0 && (
        <p className="mx-4 mt-2 text-center text-[12.5px] text-mist-dim">Aucune annonce ces 7 derniers jours.</p>
      )}
    </div>
  );
}

function AnnonceItem({
  annonce,
  code,
  onDone,
}: {
  annonce: ModAnnonces["annonces"][number];
  code: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retirer() {
    if (!window.confirm("Retirer cette annonce de la carte de tout le monde ?")) return;
    setBusy(true);
    setError(null);
    try {
      await modAnnonceRetirer(code, annonce.id);
      onDone();
    } catch (e) {
      setError(errorMessage(e, "L'annonce n'a pas pu être retirée — vérifie ta connexion."));
    } finally {
      setBusy(false);
    }
  }

  const etat = annonce.actif
    ? finAnnonce(annonce.expiresAt)
    : annonce.retireeAt
      ? `retirée ${formatAge(annonce.retireeAt)}`
      : "terminée";
  const notif = annonce.notifier ? (annonce.envoyee ? "notification envoyée" : "notification demandée") : null;

  return (
    <article className={`mx-4 ${annonce.actif ? "" : "opacity-60"}`}>
      <AnnonceCard annonce={annonce} />
      <div className="mt-1 flex items-center gap-2 px-1 text-[11px] text-mist-dim">
        <span className="flex-1 min-w-0">
          {[annonce.auteur ? `par ${annonce.auteur}` : null, etat, notif].filter(Boolean).join(" · ")}
        </span>
        {annonce.actif && (
          <button
            type="button"
            onClick={retirer}
            disabled={busy}
            className="min-h-[40px] rounded-lg border border-danger/40 bg-danger/10 px-3 text-[12px] font-semibold text-danger disabled:opacity-50"
          >
            {busy ? "…" : "Retirer"}
          </button>
        )}
      </div>
      {error && (
        <p className="mt-1 px-1 text-[12px] text-danger" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
