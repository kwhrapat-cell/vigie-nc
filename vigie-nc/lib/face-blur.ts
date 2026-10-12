"use client";

import { FilesetResolver, FaceDetector } from "@mediapipe/tasks-vision";

// Modèle et runtime WASM chargés depuis les CDN officiels de MediaPipe au
// premier usage — rien à télécharger manuellement, mais ça nécessite une
// connexion internet la première fois (puis mis en cache par le navigateur).
// La version du runtime WASM est figée sur celle du paquet npm.
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

// Taille maximale de la photo envoyée (plus grand côté) : largement assez
// pour voir une route inondée, et ~300 Ko au lieu de 3 à 5 Mo — compte pour
// les forfaits mobiles et le stockage.
const MAX_SIDE_PX = 1600;
const JPEG_QUALITY = 0.82;

let detectorPromise: Promise<FaceDetector> | null = null;

function getDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      return FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: "IMAGE",
      });
    })();
    // En cas d'échec (pas de réseau), on permet de réessayer plus tard.
    detectorPromise.catch(() => {
      detectorPromise = null;
    });
  }
  return detectorPromise;
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
  const detector = await getDetector();

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const ratio = Math.min(1, MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Contexte canvas indisponible");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const result = detector.detect(canvas);
  let facesBlurred = 0;

  for (const detection of result.detections ?? []) {
    const box = detection.boundingBox;
    if (!box) continue;
    // Marge autour du visage détecté pour couvrir cheveux/oreilles/menton.
    const pad = Math.max(box.width, box.height) * 0.35;
    const bx = Math.max(0, box.originX - pad);
    const by = Math.max(0, box.originY - pad);
    const bw = Math.min(canvas.width - bx, box.width + pad * 2);
    const bh = Math.min(canvas.height - by, box.height + pad * 2);
    pixelateRegion(ctx, canvas, bx, by, bw, bh);
    facesBlurred++;
  }

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
