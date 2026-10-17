"use client";

// Cloudflare Turnstile : vérifie, sans rien demander dans la grande
// majorité des cas, qu'une vraie personne ouvre la session anonyme (et pas
// un script qui en ouvrirait des milliers). Facultatif : actif seulement si
// NEXT_PUBLIC_TURNSTILE_SITE_KEY est renseignée sur Vercel ET que la
// protection CAPTCHA est activée dans Supabase (Authentication > Attack
// Protection, fournisseur Turnstile, avec la clé secrète).
// ⚠️ Mettre la variable sur Vercel AVANT d'activer la protection dans
// Supabase : sinon plus aucune session ne peut s'ouvrir.

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export const turnstileConfigured = Boolean(SITE_KEY);

interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT_URL;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptPromise = null;
        reject(new Error("turnstile_indisponible"));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

/**
 * Jeton Turnstile à usage unique. Le cadre reste invisible ; il ne
 * s'affiche (en bas de l'écran) que si Cloudflare a besoin d'un geste.
 */
export async function getTurnstileToken(): Promise<string> {
  await loadScript();
  const api = window.turnstile;
  if (!api) throw new Error("turnstile_indisponible");

  return new Promise<string>((resolve, reject) => {
    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "8px";
    host.style.bottom = "8px";
    host.style.zIndex = "70";
    document.body.appendChild(host);

    let widgetId: string | null = null;
    const cleanup = () => {
      try {
        if (widgetId) api.remove(widgetId);
      } catch {
        // déjà retiré
      }
      host.remove();
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("turnstile_delai"));
    }, 30_000);

    widgetId = api.render(host, {
      sitekey: SITE_KEY,
      appearance: "interaction-only",
      language: "fr",
      callback: (token: string) => {
        clearTimeout(timer);
        cleanup();
        resolve(token);
      },
      "error-callback": () => {
        clearTimeout(timer);
        cleanup();
        reject(new Error("turnstile_erreur"));
      },
    });
  });
}
