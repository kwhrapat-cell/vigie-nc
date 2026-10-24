// Chargeur des tests (node:test, sans dépendance) : comprend les chemins
// de l'appli, « @/lib/… » et « ./geo » sans extension, comme Next.js.
import { existsSync } from "node:fs";

const racine = new URL("../", import.meta.url);

export async function resolve(specifier, context, suivant) {
  let s = specifier;
  if (s.startsWith("@/")) s = new URL(s.slice(2), racine).href;
  const relatif = s.startsWith("./") || s.startsWith("../") || s.startsWith("file:");
  if (relatif && !/\.(ts|tsx|mjs|js|json)$/.test(s)) {
    const base = new URL(s, context.parentURL);
    for (const fin of [".ts", ".tsx", "/index.ts"]) {
      const essai = new URL(base.href + fin);
      if (existsSync(essai)) return suivant(essai.href, context);
    }
  }
  return suivant(s, context);
}
