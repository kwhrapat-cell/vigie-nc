// Adresse publique de l'appli et texte d'invitation, tirés de la fiche du
// territoire (lib/territoire.ts). En Calédonie, l'ancienne adresse
// vigie-nc.vercel.app renvoie ici (voir next.config.mjs).

import { NOM_APPLI, PHRASES, TERRITOIRE } from "./territoire";

export const SITE_URL = TERRITOIRE.siteUrl;

export const SITE_NAME = NOM_APPLI;

export const SITE_DESCRIPTION =
  `L'état des routes ${PHRASES.enNom}, en direct : inondations, accidents, routes coupées, signalés anonymement par les ${PHRASES.habitants}. Gratuit, sans compte.`;

// Message envoyé quand on partage l'appli (WhatsApp, SMS, Messenger…).
export const SHARE_TEXT =
  `Je t'envoie ${NOM_APPLI} : la carte en direct de l'état des routes ${PHRASES.enNom} (inondations, accidents, routes coupées), signalé anonymement par les ${PHRASES.habitants}. Gratuit et sans compte.`;
