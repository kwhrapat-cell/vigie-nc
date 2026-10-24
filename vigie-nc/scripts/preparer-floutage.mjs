// Prépare l'outil de floutage des visages (MediaPipe) dans
// public/mediapipe/<version>/ avant chaque construction du site
// (« prebuild » de package.json) : les téléphones le téléchargent depuis
// vigie-nc.com plutôt que depuis jsDelivr et Google.
//   - le runtime WASM est copié depuis le paquet npm installé (version
//     figée par package-lock.json, toujours accordée au code de l'appli) ;
//   - les deux modèles de détection sont téléchargés chez Google. Si ça
//     échoue, la construction continue : les téléphones les prendront
//     chez Google (lib/face-blur.ts).
// Vérifie aussi que MEDIAPIPE_VERSION de lib/face-blur.ts est bien la
// version installée (sinon le runtime et le code ne s'accorderaient pas).
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const racine = new URL("../", import.meta.url);
const paquet = JSON.parse(
  await readFile(new URL("node_modules/@mediapipe/tasks-vision/package.json", racine), "utf8"),
);
const code = await readFile(new URL("lib/face-blur.ts", racine), "utf8");
const attendue = code.match(/MEDIAPIPE_VERSION = "([^"]+)"/)?.[1];
if (attendue !== paquet.version) {
  console.error(
    `Floutage : lib/face-blur.ts indique MEDIAPIPE_VERSION = "${attendue}", mais @mediapipe/tasks-vision ` +
      `installé est en ${paquet.version}. Mets la même version aux deux endroits.`,
  );
  process.exit(1);
}

const dossier = new URL(`public/mediapipe/${paquet.version}/`, racine);
await rm(new URL("public/mediapipe/", racine), { recursive: true, force: true });
await mkdir(dossier, { recursive: true });
await cp(new URL("node_modules/@mediapipe/tasks-vision/wasm/", racine), new URL("wasm/", dossier), {
  recursive: true,
});
console.log(`Floutage : runtime ${paquet.version} copié dans public/mediapipe/.`);

const MODELES = {
  "blaze_face_short_range.tflite":
    "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
  "blaze_face_full_range.tflite":
    "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/latest/blaze_face_full_range.tflite",
};
for (const [nom, url] of Object.entries(MODELES)) {
  try {
    const reponse = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!reponse.ok) throw new Error(`réponse ${reponse.status}`);
    const octets = Buffer.from(await reponse.arrayBuffer());
    if (octets.length < 50_000) throw new Error(`fichier trop petit (${octets.length} octets)`);
    await writeFile(new URL(nom, dossier), octets);
    console.log(`Floutage : modèle ${nom} téléchargé (${Math.round(octets.length / 1024)} Ko).`);
  } catch (e) {
    console.warn(`Floutage : modèle ${nom} non téléchargé (${e.message}) — les téléphones le prendront chez Google.`);
  }
}
