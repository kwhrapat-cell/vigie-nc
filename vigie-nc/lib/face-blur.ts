"use client";

import { FilesetResolver, FaceDetector } from "@mediapipe/tasks-vision";

// Modèle et runtime WASM chargés depuis les CDN officiels de MediaPipe au
// premier usage — rien à télécharger manuellement, mais ça nécessite une
// connexion internet la première fois (puis mis en cache par le navigateur).
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

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
}

/**
 * Détecte les visages dans la photo et les pixellise, entièrement dans le
 * navigateur. Retourne un nouveau fichier — l'original n'est jamais
 * uploadé si un visage est détecté.
 *
 * Si aucun visage n'est détecté, la photo est retournée inchangée.
 * En cas d'échec de la détection elle-même (modèle non chargé, erreur
 * réseau...), l'erreur remonte à l'appelant : mieux vaut bloquer l'envoi
 * de la photo que risquer d'envoyer un visage non traité.
 */
export async function blurFacesInImage(file: File): Promise<File> {
  const detector = await getDetector();

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Contexte canvas indisponible");
  ctx.drawImage(bitmap, 0, 0);

  const result = detector.detect(canvas);

  if (!result.detections || result.detections.length === 0) {
    return file;
  }

  for (const detection of result.detections) {
    const box = detection.boundingBox;
    if (!box) continue;
    // Marge autour du visage détecté pour couvrir cheveux/oreilles/menton.
    const pad = Math.max(box.width, box.height) * 0.35;
    const bx = Math.max(0, box.originX - pad);
    const by = Math.max(0, box.originY - pad);
    const bw = Math.min(canvas.width - bx, box.width + pad * 2);
    const bh = Math.min(canvas.height - by, box.height + pad * 2);
    pixelateRegion(ctx, canvas, bx, by, bw, bh);
  }

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Export de l'image échoué"))),
      file.type || "image/jpeg",
      0.9,
    ),
  );

  return new File([blob], file.name, { type: blob.type });
}
