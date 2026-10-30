// Captures d'écran de l'appli (mode démo) à plusieurs largeurs : téléphone,
// tablette, ordinateur. Lancé par .github/workflows/captures.yml.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.OUT_DIR ?? "captures";
mkdirSync(OUT, { recursive: true });

const ECRANS = [
  { nom: "telephone", width: 380, height: 800, mobile: true },
  { nom: "tablette-portrait", width: 768, height: 1024, mobile: true },
  { nom: "chrome-version-ordi", width: 980, height: 1900, mobile: true },
  { nom: "tablette-paysage", width: 1024, height: 768, mobile: true },
  { nom: "portable", width: 1280, height: 800, mobile: false },
  { nom: "grand", width: 1920, height: 1080, mobile: false },
];

const PAGES = [
  "/",
  "/signaler",
  "/relayer",
  "/alertes",
  "/historique",
  "/profil",
  "/sos",
  "/contacts",
  "/moderation",
  "/mentions-legales",
  "/affiche",
];

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
for (const e of ECRANS) {
  const context = await browser.newContext({
    viewport: { width: e.width, height: e.height },
    deviceScaleFactor: 1,
    isMobile: e.mobile,
    hasTouch: e.mobile,
    locale: "fr-FR",
    timezoneId: "Pacific/Noumea",
    geolocation: { latitude: -22.1316, longitude: 166.358 },
    permissions: ["geolocation"],
  });
  // Accueil et astuce déjà vus : on capture l'appli elle-même.
  await context.addInitScript(() => {
    try {
      localStorage.setItem("vigie-nc:avertissement-v1", "1");
      localStorage.setItem("vigie-nc:astuce-signaler", "vue");
      localStorage.setItem("vigie-nc:trajet-invite", "1");
    } catch {}
  });
  const page = await context.newPage();
  for (const chemin of PAGES) {
    const nom = chemin === "/" ? "accueil" : chemin.slice(1).replace(/\//g, "-");
    try {
      await page.goto(BASE + chemin, { waitUntil: "networkidle", timeout: 30000 });
    } catch {
      await attendre(3000);
    }
    await attendre(chemin === "/" ? 3500 : 1200);
    await page.screenshot({ path: `${OUT}/${e.nom}-${e.width}-${nom}.png` });
    if (chemin === "/") {
      // Fiche d'un signalement ouverte depuis la liste
      const bouton = page.locator("#liste-proximite ul button").first();
      if (await bouton.count()) {
        await bouton.click();
        await attendre(1200);
        await page.screenshot({ path: `${OUT}/${e.nom}-${e.width}-accueil-fiche.png` });
      }
      // Ordinateur : panneau de gauche replié (la carte prend tout l'écran)
      await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
      await attendre(2500);
      const replier = page.getByRole("button", { name: "Replier le panneau pour agrandir la carte" });
      if (await replier.isVisible().catch(() => false)) {
        await replier.click();
        await attendre(1800);
        await page.screenshot({ path: `${OUT}/${e.nom}-${e.width}-accueil-replie.png` });
        await page.getByRole("button", { name: "Liste et menu" }).click().catch(() => {});
      }
    }
  }
  await context.close();
}
await browser.close();
console.log("captures faites");
