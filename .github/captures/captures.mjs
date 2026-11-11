// Captures d'écran de l'appli (mode démo) à plusieurs largeurs : téléphone,
// tablette, ordinateur. Lancé par .github/workflows/captures.yml.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

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
  "/alertes#prevenir",
  "/historique",
  "/profil",
  "/sos",
  "/contacts",
  "/moderation",
  "/mentions-legales",
  "/affiche",
];

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

// Téléphone : la liste de l'accueil est repliée par défaut (la carte
// d'abord) ; « Voir la liste » la déplie avant de toucher un signalement.
async function deplierListe(page) {
  const bouton = page.getByRole("button", { name: /Voir la liste/ });
  if (await bouton.isVisible().catch(() => false)) {
    await bouton.click().catch(() => {});
    await attendre(700);
    return true;
  }
  return false;
}

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
    const nom = chemin === "/" ? "accueil" : chemin.slice(1).replace(/[/#]/g, "-");
    try {
      await page.goto(BASE + chemin, { waitUntil: "networkidle", timeout: 30000 });
    } catch {
      await attendre(3000);
    }
    await attendre(chemin === "/" ? 3500 : 1200);
    await page.screenshot({ path: `${OUT}/${e.nom}-${e.width}-${nom}.png` });
    if (chemin === "/sos") {
      // Écran SOS en entier : « Comment marche le SOS »
      await page.screenshot({ path: `${OUT}/${e.nom}-${e.width}-sos-entier.png`, fullPage: true });
    }
    if (chemin === "/") {
      // Légende ouverte depuis l'astuce « cercle + SOS » (montrée une fois :
      // les captures suivantes de l'accueil ne l'ont plus).
      const legende = page.getByRole("button", { name: "Légende", exact: true });
      if (await legende.isVisible().catch(() => false)) {
        await legende.click();
        await attendre(900);
        await page.screenshot({ path: `${OUT}/${e.nom}-${e.width}-accueil-legende.png` });
        // Bas de la légende : SOS, position, mise à jour
        await page
          .locator('[aria-labelledby="legende-titre"]')
          .evaluate((el) => (el.scrollTop = el.scrollHeight))
          .catch(() => {});
        await attendre(400);
        await page.screenshot({ path: `${OUT}/${e.nom}-${e.width}-accueil-legende-bas.png` });
        await page.getByRole("button", { name: "Fermer la légende" }).click().catch(() => {});
        await attendre(500);
      }
      // Liste dépliée, puis fiche d'un signalement ouverte depuis la liste
      if (await deplierListe(page)) {
        await page.screenshot({ path: `${OUT}/${e.nom}-${e.width}-accueil-liste.png` });
      }
      const bouton = page.locator("#liste-proximite ul button").first();
      if (await bouton.count()) {
        await bouton.click({ timeout: 8000 }).catch(() => {});
        await attendre(1200);
        await page.screenshot({ path: `${OUT}/${e.nom}-${e.width}-accueil-fiche.png` });
      }
      // Fiche d'un signalement « ancien » (lib/fraicheur.ts)
      await page.keyboard.press("Escape").catch(() => {});
      await attendre(400);
      const ancien = page.locator("#liste-proximite ul button", { hasText: "ancien" }).first();
      if (await ancien.count()) {
        await ancien.scrollIntoViewIfNeeded().catch(() => {});
        await ancien.click().catch(() => {});
        await attendre(1200);
        await page.screenshot({ path: `${OUT}/${e.nom}-${e.width}-accueil-fiche-ancien.png` });
        await page.keyboard.press("Escape").catch(() => {});
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
  // Démonstration Mont-Dore (lib/demo.ts) : page /demo, puis la carte du
  // scénario fictif, une fiche, et la carte seule (panneau replié).
  try {
    await page.goto(BASE + "/demo", { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    await attendre(1000);
    await page.screenshot({ path: `${OUT}/${e.nom}-${e.width}-demo.png` });
    await page.getByRole("button", { name: "Lancer la démo" }).click();
    await page.waitForURL(BASE + "/", { timeout: 15000 }).catch(() => {});
    await attendre(4500);
    await page.screenshot({ path: `${OUT}/${e.nom}-${e.width}-demo-accueil.png` });
    if (await deplierListe(page)) {
      await page.screenshot({ path: `${OUT}/${e.nom}-${e.width}-demo-liste.png` });
    }
    const fiche = page.locator("#liste-proximite ul button").first();
    if (await fiche.count()) {
      await fiche.click({ timeout: 8000 }).catch(() => {});
      await attendre(1200);
      await page.screenshot({ path: `${OUT}/${e.nom}-${e.width}-demo-fiche.png` });
    }
    await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    await attendre(3000);
    const replierDemo = page.getByRole("button", { name: "Replier le panneau pour agrandir la carte" });
    if (await replierDemo.isVisible().catch(() => false)) {
      await replierDemo.click();
      await attendre(2500);
      await page.screenshot({ path: `${OUT}/${e.nom}-${e.width}-demo-replie.png` });
      await page.getByRole("button", { name: "Liste et menu" }).click().catch(() => {});
    }
    await page.evaluate(() => sessionStorage.removeItem("vigie-nc:demo"));
  } catch (err) {
    console.log(`démo (${e.nom}) :`, err instanceof Error ? err.message : err);
  }
  await context.close();

  // Bouton Retour (lib/retour-fenetre.ts) : il doit fermer la fenêtre ouverte
  // sans quitter la carte ni recharger la page. Résultat dans retour.txt.
  if (e.nom === "telephone" || e.nom === "portable") {
    const ctx = await browser.newContext({
      viewport: { width: e.width, height: e.height },
      deviceScaleFactor: 1,
      isMobile: e.mobile,
      hasTouch: e.mobile,
      locale: "fr-FR",
      timezoneId: "Pacific/Noumea",
      geolocation: { latitude: -22.1316, longitude: 166.358 },
      permissions: ["geolocation"],
    });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("vigie-nc:avertissement-v1", "1");
        localStorage.setItem("vigie-nc:astuce-signaler", "vue");
        localStorage.setItem("vigie-nc:astuce-carte", "vue");
        localStorage.setItem("vigie-nc:trajet-invite", "1");
      } catch {}
    });
    const lignes = [];
    const noter = (ok, quoi) => {
      const l = `${ok ? "OK    " : "ÉCHEC "} ${e.nom} : ${quoi}`;
      lignes.push(l);
      console.log(`retour — ${l}`);
    };
    try {
      const p = await ctx.newPage();
      await p.goto(BASE + "/demo", { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
      await p.getByRole("button", { name: "Lancer la démo" }).click();
      await p.waitForURL(BASE + "/", { timeout: 15000 }).catch(() => {});
      await attendre(4000);
      await p.evaluate(() => {
        window.__sansRecharge = true;
      });
      const fenetreOuverte = () => p.locator('[role="dialog"][aria-modal="true"]').count();
      const etat = async () =>
        p.evaluate(() => ({
          recharge: window.__sansRecharge !== true,
          url: location.pathname,
          fenetres: (history.state && history.state.vigieFenetres) || [],
        }));

      // 1. Fiche ouverte, puis Retour
      await deplierListe(p);
      const premiere = p.locator("#liste-proximite ul button").first();
      await premiere.click({ timeout: 8000 });
      await attendre(1200);
      noter((await fenetreOuverte()) > 0, "la fiche s'ouvre");
      await p.goBack().catch(() => {});
      await attendre(1200);
      let s = await etat();
      noter((await fenetreOuverte()) === 0, "Retour ferme la fiche");
      noter(s.url === "/" && !s.recharge, `on reste sur la carte sans recharger (page ${s.url}, rechargée : ${s.recharge})`);

      // 2. Fiche fermée par Échap : l'étape est retirée, pas de fenêtre fantôme
      await premiere.click({ timeout: 8000 });
      await attendre(1000);
      await p.keyboard.press("Escape");
      await attendre(1200);
      s = await etat();
      noter((await fenetreOuverte()) === 0 && s.fenetres.length === 0 && !s.recharge, "fiche fermée par Échap : étape retirée");

      // 3. Légende « ? », puis Retour
      const legende = p.getByRole("button", { name: "Légende", exact: true });
      if (await legende.isVisible().catch(() => false)) {
        await legende.click();
        await attendre(900);
        noter((await fenetreOuverte()) > 0, "la légende s'ouvre");
        await p.goBack().catch(() => {});
        await attendre(1000);
        s = await etat();
        noter((await fenetreOuverte()) === 0 && s.url === "/" && !s.recharge, "Retour ferme la légende");
      } else {
        noter(false, "bouton Légende introuvable");
      }
      await p.screenshot({ path: `${OUT}/${e.nom}-${e.width}-apres-retour.png` });
      await p.evaluate(() => sessionStorage.removeItem("vigie-nc:demo"));
    } catch (err) {
      noter(false, `essai interrompu : ${err instanceof Error ? err.message : err}`);
    }
    writeFileSync(`${OUT}/retour-${e.nom}.txt`, lignes.join("\n") + "\n");
    await ctx.close();
  }

  // Position bloquée (ordinateur de mairie, Windows qui refuse…) : l'aide,
  // puis le choix de « Ma zone » sur la carte, puis la zone choisie.
  const bloque = await browser.newContext({
    viewport: { width: e.width, height: e.height },
    deviceScaleFactor: 1,
    isMobile: e.mobile,
    hasTouch: e.mobile,
    locale: "fr-FR",
    timezoneId: "Pacific/Noumea",
    permissions: [],
  });
  await bloque.addInitScript(() => {
    try {
      localStorage.setItem("vigie-nc:avertissement-v1", "1");
      localStorage.setItem("vigie-nc:astuce-signaler", "vue");
      localStorage.setItem("vigie-nc:astuce-carte", "vue");
      localStorage.setItem("vigie-nc:trajet-invite", "1");
    } catch {}
  });
  try {
    const p = await bloque.newPage();
    await p.goto(BASE + "/", { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    await attendre(3000);
    await p.screenshot({ path: `${OUT}/${e.nom}-${e.width}-position-bloquee.png` });
    await p.getByRole("button", { name: "Activer ma position" }).click();
    await attendre(1500);
    await p.screenshot({ path: `${OUT}/${e.nom}-${e.width}-position-aide.png` });
    await p.getByRole("button", { name: "Choisir ma zone sur la carte" }).click();
    await attendre(1200);
    await p.screenshot({ path: `${OUT}/${e.nom}-${e.width}-zone-choix.png` });
    await p.getByRole("button", { name: "Choisir cet endroit" }).click();
    await attendre(2500);
    await p.screenshot({ path: `${OUT}/${e.nom}-${e.width}-zone-choisie.png` });
    // Rechargée : la zone est gardée sur l'appareil
    await p.reload({ waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    await attendre(3500);
    await p.screenshot({ path: `${OUT}/${e.nom}-${e.width}-zone-rechargee.png` });
  } catch (err) {
    console.log(`position bloquée (${e.nom}) :`, err instanceof Error ? err.message : err);
  }
  await bloque.close();

  // Sans JavaScript (comme un lecteur de page) : ce que montre la page
  // envoyée par le serveur.
  const sansJs = await browser.newContext({
    viewport: { width: e.width, height: e.height },
    deviceScaleFactor: 1,
    isMobile: e.mobile,
    hasTouch: e.mobile,
    locale: "fr-FR",
    javaScriptEnabled: false,
  });
  try {
    const p = await sansJs.newPage();
    await p.goto(BASE + "/", { waitUntil: "load", timeout: 30000 }).catch(() => {});
    await attendre(800);
    await p.screenshot({ path: `${OUT}/${e.nom}-${e.width}-accueil-sans-js.png` });
  } catch (err) {
    console.log(`sans JavaScript (${e.nom}) :`, err instanceof Error ? err.message : err);
  }
  await sansJs.close();
}
await browser.close();
console.log("captures faites");
