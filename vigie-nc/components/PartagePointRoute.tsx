"use client";

import { useEffect, useState } from "react";
import { PrimaryButton, SecondaryButton } from "./ui";
import { imagePointRoute, textePartage, zonePointRoute } from "@/lib/point-route-partage";
import { Report } from "@/lib/types";

// Bouton « Partager » de l'accueil : fabrique sur le téléphone une image
// « Point route » de la zone affichée (lib/point-route-partage.ts) et la
// partage par le menu du téléphone (WhatsApp, Facebook, Messenger…). Si le
// téléphone ne sait pas partager une image : texte + lien sur WhatsApp, ou
// image à enregistrer. C'est la personne qui partage : rien d'automatique.

const NOM_FICHIER = "point-route-vigie-nc.png";

export function PartagePointRoute({
  reports,
  toutLeTerritoire,
  rayonKm,
}: {
  reports: Report[];
  toutLeTerritoire: boolean;
  rayonKm: number;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [image, setImage] = useState<{ blob: Blob; url: string; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Libère l'aperçu
  useEffect(() => {
    return () => {
      if (image) URL.revokeObjectURL(image.url);
    };
  }, [image]);

  async function ouvrir() {
    setOuvert(true);
    setMessage(null);
    setEnCours(true);
    try {
      const zone = zonePointRoute(reports, toutLeTerritoire, rayonKm);
      const blob = await imagePointRoute(reports, zone);
      setImage({ blob, url: URL.createObjectURL(blob), texte: textePartage(reports, zone) });
    } catch {
      setImage(null);
      setMessage("L'image n'a pas pu être préparée. Tu peux partager le texte à la place.");
    } finally {
      setEnCours(false);
    }
  }

  function fermer() {
    setOuvert(false);
    setImage(null);
    setMessage(null);
  }

  function texteSeul(): string {
    return image?.texte ?? textePartage(reports, zonePointRoute(reports, toutLeTerritoire, rayonKm));
  }

  async function partager() {
    setMessage(null);
    const texte = texteSeul();
    try {
      if (image) {
        const fichier = new File([image.blob], NOM_FICHIER, { type: "image/png" });
        if (navigator.canShare?.({ files: [fichier] })) {
          await navigator.share({ files: [fichier], text: texte });
          return;
        }
      }
      if (navigator.share) {
        await navigator.share({ text: texte });
        return;
      }
      envoyerWhatsApp();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // partage annulé
      setMessage("Le partage n'a pas marché. Essaie « Texte sur WhatsApp » ou enregistre l'image.");
    }
  }

  function envoyerWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(texteSeul())}`, "_blank", "noopener");
  }

  return (
    <>
      <button
        type="button"
        onClick={ouvrir}
        className="shrink-0 min-h-[44px] flex items-center gap-1.5 rounded-full border border-lagoon/50 bg-lagoon/10 px-3 text-[13.5px] font-semibold text-lagoon"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4" aria-hidden="true">
          <circle cx="18" cy="5" r="2.5" />
          <circle cx="6" cy="12" r="2.5" />
          <circle cx="18" cy="19" r="2.5" />
          <path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" />
        </svg>
        Partager
      </button>

      {ouvert && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-void/75 md:items-center md:p-6" onClick={fermer}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="partage-titre"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-[22px] bg-panel border-t border-line px-4 pt-4 max-h-[94dvh] overflow-y-auto md:rounded-[22px] md:border md:max-h-[90dvh]"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
          >
            <h2 id="partage-titre" className="font-display font-semibold text-[18px]">
              Partager le point route
            </h2>
            <p className="mt-0.5 text-[14px] text-mist-dim">
              Pour ta famille, ton quartier, ton groupe Facebook : une image avec ce qui est signalé autour de toi
              et le lien de Vigie NC.
            </p>

            <div className="mt-3 flex justify-center rounded-xl border border-line bg-void/50 p-2 min-h-[200px] items-center">
              {enCours && <p className="text-[14px] text-mist-dim">Préparation de l&apos;image…</p>}
              {image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image.url} alt="Aperçu de l'image du point route" className="max-h-[46dvh] w-auto rounded-lg" />
              )}
            </div>

            {message && (
              <p className="mt-2 text-[14px] text-warn" role="alert">
                {message}
              </p>
            )}

            <div className="mt-3 flex flex-col gap-2">
              <PrimaryButton onClick={partager} disabled={enCours}>
                Partager
              </PrimaryButton>
              <div className="grid grid-cols-2 gap-2">
                <SecondaryButton onClick={envoyerWhatsApp}>
                  Texte sur WhatsApp
                </SecondaryButton>
                {image ? (
                  <a
                    href={image.url}
                    download={NOM_FICHIER}
                    className="w-full rounded-xl border border-line bg-panel-2 py-3.5 text-center font-display font-semibold text-[15px] text-mist"
                  >
                    Enregistrer l&apos;image
                  </a>
                ) : (
                  <SecondaryButton disabled>
                    Enregistrer l&apos;image
                  </SecondaryButton>
                )}
              </div>
              <button type="button" onClick={fermer} className="min-h-[44px] text-[15px] text-mist-dim">
                Fermer
              </button>
            </div>
            <p className="mt-1 text-[12px] text-mist-dim">
              L&apos;image est faite sur ton téléphone. Elle montre seulement le type, le lieu et l&apos;heure des
              signalements : jamais de nom, de photo ni ta position.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
