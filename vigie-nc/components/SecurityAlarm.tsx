"use client";

// Écran de modération : alarme de sécurité sur ce téléphone. Une
// notification arrive dès que la liste des modérateurs change (ajout, code
// changé, accès retiré…). Voir vigie_alarme_moderateurs dans le SQL.

import { useEffect, useState } from "react";
import {
  currentSubscription,
  pushSupport,
  PushSupport,
  sendTestPush,
  setSecurityAlarmFlag,
  subscribePush,
  SubscriptionKeys,
} from "@/lib/push";
import { errorMessage, modAlarmDisable, modAlarmEnable, modAlarmState, notifAvailable } from "@/lib/reports-api";

type Phase = "chargement" | "indisponible" | "inactive" | "active";

const SUPPORT_MESSAGES: Partial<Record<PushSupport, string>> = {
  "iphone-a-installer": "Sur iPhone, installe d'abord l'appli sur l'écran d'accueil, puis ouvre-la depuis là.",
  "iphone-trop-ancien": "Cet iPhone est trop ancien pour les notifications (iOS 16.4 minimum).",
  bloque: "Notifications refusées : autorise-les pour ce site dans les réglages du navigateur.",
  "non-configure": "Notifications non configurées sur cette version de l'appli.",
  "non-supporte": "Ce navigateur ne reçoit pas les notifications. Sur Android, utilise Chrome.",
};

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
      <path d="M12 8v4" />
      <path d="M12 15.5v.01" />
    </svg>
  );
}

export function SecurityAlarm({ code }: { code: string }) {
  const [phase, setPhase] = useState<Phase>("chargement");
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [keys, setKeys] = useState<SubscriptionKeys | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const s = pushSupport();
    setSupport(s);
    if (s !== "ok" || !notifAvailable) {
      setPhase("indisponible");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const k = await currentSubscription();
        if (cancelled) return;
        if (!k) {
          setPhase("inactive");
          return;
        }
        setKeys(k);
        const active = await modAlarmState(code, k.endpoint);
        if (cancelled) return;
        setSecurityAlarmFlag(active);
        setPhase(active ? "active" : "inactive");
      } catch {
        if (!cancelled) setPhase("inactive");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  async function enable() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const k = await subscribePush();
      await modAlarmEnable(code, k);
      setKeys(k);
      setSecurityAlarmFlag(true);
      setPhase("active");
      const ok = await sendTestPush(k, "securite");
      setNotice(
        ok
          ? "Alarme activée. Une notification de confirmation arrive dans quelques secondes."
          : "Alarme activée, mais la notification de confirmation n'est pas partie. Réessaie « Tester » dans un moment.",
      );
    } catch (e) {
      // « permission_refusee » (subscribePush) a son propre message
      setError(errorMessage(e, "L'alarme n'a pas pu être activée — vérifie ta connexion."));
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (!keys) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const ok = await sendTestPush(keys, "securite");
    setBusy(false);
    if (ok) setNotice("Notification de test envoyée : elle arrive dans quelques secondes.");
    else setError("Le test n'a pas pu être envoyé. Réessaie dans un moment.");
  }

  async function disable() {
    if (!keys) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await modAlarmDisable(code, keys.endpoint);
      setSecurityAlarmFlag(false);
      setPhase("inactive");
      setNotice("Alarme coupée sur ce téléphone.");
    } catch (e) {
      setError(errorMessage(e, "L'alarme n'a pas pu être coupée — vérifie ta connexion."));
    } finally {
      setBusy(false);
    }
  }

  const active = phase === "active";

  return (
    <section
      aria-label="Alarme de sécurité"
      className={`mx-4 mb-3 rounded-xl border bg-panel px-4 py-3 ${active ? "border-primary/60" : "border-warn/40"}`}
    >
      <p className="flex items-center gap-2 text-[13px] font-semibold">
        <ShieldIcon className={`w-[18px] h-[18px] shrink-0 ${active ? "text-lagoon" : "text-warn"}`} />
        {phase === "chargement"
          ? "Alarme de sécurité…"
          : active
            ? "Alarme de sécurité active sur ce téléphone"
            : "Alarme de sécurité"}
      </p>
      <p className="mt-1.5 text-[11.5px] text-mist-dim leading-relaxed">
        Tu reçois une notification si quelqu&apos;un ajoute un modérateur, change un code ou retire un accès.
      </p>

      {phase === "indisponible" && (
        <p className="mt-2 text-[12px] text-warn">
          {(support && SUPPORT_MESSAGES[support]) ?? "Alarme indisponible sur ce téléphone."}
        </p>
      )}

      {phase === "inactive" && (
        <button
          type="button"
          onClick={enable}
          disabled={busy}
          className="mt-3 w-full rounded-xl bg-primary py-3 font-display font-semibold text-[14px] text-white disabled:opacity-40"
        >
          {busy ? "Activation…" : "Recevoir l'alarme sur ce téléphone"}
        </button>
      )}

      {active && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={test}
            disabled={busy}
            className="rounded-lg border border-line bg-panel-2 py-2.5 text-[12px] font-semibold text-mist disabled:opacity-50"
          >
            Tester
          </button>
          <button
            type="button"
            onClick={disable}
            disabled={busy}
            className="rounded-lg border border-line bg-panel-2 py-2.5 text-[12px] font-semibold text-mist-dim disabled:opacity-50"
          >
            Couper ici
          </button>
        </div>
      )}

      {notice && <p className="mt-2 text-[12px] text-ok">{notice}</p>}
      {error && (
        <p className="mt-2 text-[12px] text-danger" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
