"use client";

import { FilesetResolver, FaceDetector } from "@mediapipe/tasks-vision";

// Outil de floutage (MediaPipe) : le runtime WASM et les modèles sont
// servis par Vigie NC (public/mediapipe/<version>/, préparés à la
// construction du site par scripts/preparer-floutage.mjs, copie exacte du
// paquet npm). Si un fichier manque chez nous, on le prend aux sources
// officielles (jsDelivr, Google). Il faut une connexion la première fois,
// puis le navigateur le garde en cache.
// ⚠️ Doit être la version de @mediapipe/tasks-vision du package-lock :
// la construction du site s'arrête sinon (scripts/preparer-floutage.mjs).
export const MEDIAPIPE_VERSION = "0.10.14";
const LOCAL = `/mediapipe/${MEDIAPIPE_VERSION}`;
const WASM_LOCAL = `${LOCAL}/wasm`;
const WASM_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
// Modèle « courte distance » : prévu pour les selfies (visages proches).
const MODELE_COURT = {
  local: `${LOCAL}/blaze_face_short_range.tflite`,
  cdn: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
};
// Modèle « longue distance », prévu pour la caméra arrière : sur une photo
// de route, les visages sont souvent loin. Utilisé EN PLUS du premier
// quand il se charge ; s'il manque, on garde le premier seul.
const MODELE_LONG = {
  local: `${LOCAL}/blaze_face_full_range.tflite`,
  cdn: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/latest/blaze_face_full_range.tflite",
};

// Taille maximale de la photo envoyée (plus grand côté) : largement assez
// pour voir une route inondée, et ~300 Ko au lieu de 3 à 5 Mo — compte pour
// les forfaits mobiles et le stockage.
const MAX_SIDE_PX = 1600;
const JPEG_QUALITY = 0.82;

let detectorsPromise: Promise<FaceDetector[]> | null = null;

async function creerDetecteurs(wasm: string): Promise<FaceDetector[]> {
  const vision = await FilesetResolver.forVisionTasks(wasm);
  const options = (modelAssetPath: string) => ({
    baseOptions: { modelAssetPath },
    runningMode: "IMAGE" as const,
    minDetectionConfidence: 0.4,
  });
  // Le modèle de chez nous d'abord, celui de Google sinon.
  const creer = (m: { local: string; cdn: string }) =>
    FaceDetector.createFromOptions(vision, options(m.local)).catch(() =>
      FaceDetector.createFromOptions(vision, options(m.cdn)),
    );
  // Le modèle courte distance est obligatoire (sinon : erreur, photo
  // bloquée) ; le longue distance est un plus.
  const [shortRange, fullRange] = await Promise.allSettled([creer(MODELE_COURT), creer(MODELE_LONG)]);
  if (shortRange.status === "rejected") throw shortRange.reason;
  return fullRange.status === "fulfilled" ? [shortRange.value, fullRange.value] : [shortRange.value];
}

function getDetectors(): Promise<FaceDetector[]> {
  if (!detectorsPromise) {
    // Le runtime de chez nous d'abord, celui de jsDelivr sinon.
    detectorsPromise = creerDetecteurs(WASM_LOCAL).catch(() => creerDetecteurs(WASM_CDN));
    // En cas d'échec (pas de réseau), on permet de réessayer plus tard.
    detectorsPromise.catch(() => {
      detectorsPromise = null;
    });
  }
  return detectorsPromise;
}

function pixelateRegion(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  // Floutage par pixellisation : on réduit la zone à quelques pixels puis
  // on la ré-agrandit sans lissage — irréversible, contrairement à un flou
  // gaussien léger qui peut parfois être partiellement inversé.
  const scale = 0.06;
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.floor(w * scale));
  small.height = Math.max(1, Math.floor(h * scale));
  const sctx = small.getContext("2d");
  if (!sctx) return;
  sctx.drawImage(source, x, y, w, h, 0, 0, small.width, small.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
  ctx.imageSmoothingEnabled = true;
}

export interface PreparedPhoto {
  file: File;
  facesBlurred: number;
}

/**
 * Prépare une photo avant l'envoi, entièrement sur le téléphone :
 *  1. réduit sa taille (1600 px max) ;
 *  2. détecte les visages et les pixellise ;
 *  3. la ré-encode en JPEG, ce qui retire TOUTES les métadonnées EXIF
 *     (coordonnées GPS précises, modèle du téléphone, date…).
 *
 * La photo d'origine ne quitte jamais l'appareil. Si la détection des
 * visages échoue (modèle non chargé, pas de réseau…), l'erreur remonte :
 * mieux vaut bloquer la photo que risquer d'envoyer un visage non traité.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const detectors = await getDetectors();

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const ratio = Math.min(1, MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Contexte canvas indisponible");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // Visages trouvés par l'un OU l'autre modèle, tous détectés avant de
  // flouter. Si le modèle principal échoue, l'erreur remonte (photo
  // bloquée) ; le modèle longue distance, lui, est un plus.
  const [main, ...extra] = detectors;
  const detections = [
    ...(main.detect(canvas).detections ?? []),
    ...extra.flatMap((d) => {
      try {
        return d.detect(canvas).detections ?? [];
      } catch {
        return [];
      }
    }),
  ];

  // Un même visage vu par les deux modèles ne compte qu'une fois.
  const zones: { x: number; y: number; w: number; h: number }[] = [];
  for (const detection of detections) {
    const box = detection.boundingBox;
    if (!box) continue;
    // Marge autour du visage détecté pour couvrir cheveux/oreilles/menton.
    const pad = Math.max(box.width, box.height) * 0.35;
    const x = Math.max(0, box.originX - pad);
    const y = Math.max(0, box.originY - pad);
    const w = Math.min(canvas.width - x, box.width + pad * 2);
    const h = Math.min(canvas.height - y, box.height + pad * 2);
    const cx = x + w / 2;
    const cy = y + h / 2;
    const known = zones.some((z) => cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h);
    if (!known) zones.push({ x, y, w, h });
    else pixelateRegion(ctx, canvas, x, y, w, h); // flouté quand même, compté une fois
  }
  for (const z of zones) pixelateRegion(ctx, canvas, z.x, z.y, z.w, z.h);
  const facesBlurred = zones.length;

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Export de l'image échoué"))),
      "image/jpeg",
      JPEG_QUALITY,
    ),
  );

  return {
    file: new File([blob], "photo.jpg", { type: "image/jpeg" }),
    facesBlurred,
  };
}
