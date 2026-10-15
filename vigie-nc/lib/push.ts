"use client";

// Notifications côté téléphone : service worker (public/sw.js) et
// abonnement auprès du service d'envoi du navigateur (Google, Apple…).

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type PushSupport =
  | "ok"
  | "iphone-a-installer" // iPhone : il faut ouvrir l'appli depuis l'écran d'accueil
  | "iphone-trop-ancien" // appli de l'écran d'accueil, mais iOS antérieur à 16.4
  | "bloque" // l'utilisateur a refusé les notifications
  | "non-configure" // clés absentes (aperçu sans variables d'environnement)
  | "non-supporte";

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "non-supporte";
  const capable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!capable) {
    if (!isIos()) return "non-supporte";
    return isStandalone() ? "iphone-trop-ancien" : "iphone-a-installer";
  }
  if (!VAPID_PUBLIC_KEY) return "non-configure";
  if (Notification.permission === "denied") return "bloque";
  return "ok";
}

export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => null);
}

function keyToBytes(base64url: string): ArrayBuffer {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer as ArrayBuffer;
}

export interface SubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

function toKeys(sub: PushSubscription): SubscriptionKeys {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
  };
}

/** Abonnement déjà présent sur ce téléphone (sans rien demander). */
export async function currentSubscription(): Promise<SubscriptionKeys | null> {
  if (pushSupport() !== "ok") return null;
  const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await registerServiceWorker());
  if (!reg) return null;
  const sub = await reg.pushManager.getSubscription();
  return sub ? toKeys(sub) : null;
}

/** Demande l'autorisation et s'abonne (ou réutilise l'abonnement existant). */
export async function subscribePush(): Promise<SubscriptionKeys> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("permission_refusee");
  await registerServiceWorker();
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID_PUBLIC_KEY) }));
  return toKeys(sub);
}

/** Supprime l'abonnement de ce téléphone. */
export async function unsubscribePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  await sub?.unsubscribe();
}

/** Envoie une notification de test à ce téléphone seulement. */
export async function sendTestPush(keys: SubscriptionKeys): Promise<boolean> {
  try {
    const res = await fetch("/api/notif-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(keys),
    });
    return res.ok;
  } catch {
    return false;
  }
}
