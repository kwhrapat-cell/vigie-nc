// AUDIT RÉSEAU (branche temporaire, jamais fusionnée) : ouvre vigie-nc.com
// avec une fausse position (Païta) et note chaque requête : hôte, chemin,
// et si l'adresse ou le contenu envoyé contient la position.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = process.env.OUT_DIR ?? "captures";
mkdirSync(OUT, { recursive: true });
const SITE = "https://vigie-nc-git-fraicheur-sos-pkd-ev.vercel.app";
const LAT = -22.13161, LNG = 166.35823;
const POSITION = /-22\.1[0-9]*|166\.3[0-9]*|-22%2E1|166%2E3/;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const lignes = [];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 380, height: 800 }, isMobile: true, hasTouch: true, locale: "fr-FR",
  timezoneId: "Pacific/Noumea", geolocation: { latitude: LAT, longitude: LNG }, permissions: ["geolocation"],
});
await context.addInitScript(() => {
  try {
    localStorage.setItem("vigie-nc:avertissement-v1", "1");
    localStorage.setItem("vigie-nc:astuce-signaler", "vue");
    localStorage.setItem("vigie-nc:astuce-carte", "vue");
    localStorage.setItem("vigie-nc:emergency-contacts", JSON.stringify([{ id: "x", name: "Essai", phone: "+687000000" }]));
  } catch {}
});
// Pas compté dans les chiffres d'utilisation de Patrice.
await context.route("**/rpc/vigie_presence", (r) => r.abort());

let etape = "";
context.on("request", (req) => {
  const u = new URL(req.url());
  if (u.protocol === "data:" || u.protocol === "blob:") return;
  const corps = req.postData() ?? "";
  const dansUrl = POSITION.test(req.url());
  const dansCorps = POSITION.test(corps);
  const tuile = /\/\d+\/\d+\/\d+(\.png)?$/.test(u.pathname) || /tile/.test(u.pathname);
  lignes.push([etape, req.method(), u.host, u.pathname.slice(0, 70), tuile ? "TUILE" : "", dansUrl ? "POSITION-URL" : "", dansCorps ? "POSITION-CORPS" : ""].join("\t"));
});

const page = await context.newPage();
for (const [nom, chemin, ms] of [["accueil", "/", 15000], ["alertes", "/alertes", 6000], ["signaler", "/signaler", 6000], ["sos", "/sos", 3000]]) {
  etape = nom;
  await page.goto(SITE + chemin, { waitUntil: "load", timeout: 45000 }).catch((e) => lignes.push(`${nom}\tERREUR ${e.message}`));
  await attendre(ms);
}
// SOS déclenché (appui 3,5 s) avec un faux contact : rien ne doit partir sur le réseau.
etape = "sos-declenche";
const bouton = page.getByRole("button", { name: /Déclencher le SOS/ });
const boite = await bouton.boundingBox().catch(() => null);
if (boite) {
  await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
  await page.mouse.down();
  await attendre(3600);
  await page.mouse.up();
  await attendre(3000);
} else lignes.push("sos-declenche\tbouton introuvable");
await page.screenshot({ path: `${OUT}/sos-apres.png` }).catch(() => {});

writeFileSync(`${OUT}/reseau.tsv`, lignes.join("\n") + "\n");
const resume = {};
for (const l of lignes) {
  const [e, m, h, , t, pu, pc] = l.split("\t");
  const k = `${e}\t${h}\t${t || ""}\t${pu || ""}\t${pc || ""}`;
  resume[k] = (resume[k] ?? 0) + 1;
}
writeFileSync(`${OUT}/reseau-resume.tsv`, Object.entries(resume).map(([k, n]) => `${n}\t${k}`).join("\n") + "\n");
await browser.close();
console.log("audit fait");
