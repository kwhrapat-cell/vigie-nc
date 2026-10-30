// Texte des erreurs des téléphones (sans dépendance, testé dans
// tests/erreurs.test.ts) : ce qui part et ce qui ne part pas. Envoi dans
// lib/erreurs.ts.

// Erreurs sans intérêt (réseau coupé, extensions du navigateur…).
export const IGNOREES = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Failed to fetch|Load failed|NetworkError|Network request failed/i,
  /AbortError|The operation was aborted|The user aborted/i,
  /chrome-extension:|moz-extension:|safari-extension:|safari-web-extension:/i,
];
/** « Chrome 140 · Android », « Appli Android », « Facebook · iPhone »… (pas le texte complet). */
export function navigateurCourt(ua: string): string {
  const systeme = /iPhone|iPad/.test(ua)
    ? "iPhone"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS/.test(ua)
          ? "Mac"
          : "autre";
  const version = (re: RegExp) => ua.match(re)?.[1] ?? "";
  let nav = "autre";
  if (/VigieNCApp/.test(ua)) nav = "Appli Android";
  else if (/FBAN|FBAV|FB_IAB/.test(ua)) nav = "Facebook";
  else if (/Instagram/.test(ua)) nav = "Instagram";
  else if (/EdgA?\/\d+/.test(ua)) nav = `Edge ${version(/EdgA?\/(\d+)/)}`;
  else if (/SamsungBrowser\/\d+/.test(ua)) nav = `Samsung ${version(/SamsungBrowser\/(\d+)/)}`;
  else if (/CriOS\/\d+/.test(ua)) nav = `Chrome ${version(/CriOS\/(\d+)/)}`;
  else if (/(Firefox|FxiOS)\/\d+/.test(ua)) nav = `Firefox ${version(/(?:Firefox|FxiOS)\/(\d+)/)}`;
  else if (/Chrome\/\d+/.test(ua)) nav = `Chrome ${version(/Chrome\/(\d+)/)}`;
  else if (/Version\/\d+.*Safari/.test(ua)) nav = `Safari ${version(/Version\/(\d+)/)}`;
  return `${nav} · ${systeme}`;
}

/** Texte de l'erreur : « TypeError: … @ fichier:ligne », sans l'adresse du site. */
export function texteErreur(err: unknown): string | null {
  const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : String(err ?? "inconnue"));
  const message = `${e.name}: ${e.message}`.replace(/\s+/g, " ").trim();
  // Testé avec et sans le nom : « Script error. » arrive en simple texte et
  // devient « Error: Script error. », que le filtre (ancré au début) ratait.
  const brut = e.message.replace(/\s+/g, " ").trim();
  if (!brut || IGNOREES.some((r) => r.test(message) || r.test(brut))) return null;
  // La pile n'a de sens que pour une vraie erreur (pas un texte rejeté).
  const pile = (err instanceof Error ? (e.stack ?? "") : "")
    .split("\n")
    .slice(1, 3)
    .map((l) => l.trim().replace(/https?:\/\/[^/\s)]+/g, ""))
    .filter(Boolean)
    .join(" | ");
  return (pile ? `${message} @ ${pile}` : message).slice(0, 300);
}

