"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { demoActive } from "./demo";
import { fetchAnnonces } from "./reports-api";
import { doitRecharger, EXPIRATION_MS, RYTHME_ANNONCES, suivreDirect, VERIFICATION_MS } from "./rafraichissement";
import { Annonce } from "./types";

// Annonces générales (toute la Calédonie), tenues à jour en direct.
// Le temps réel ne transporte aucun contenu (table vigie_annonce_signal) :
// à chaque signal, le téléphone recharge les annonces en cours.
// Filet de sécurité en plus du temps réel (lib/rafraichissement.ts) :
// toutes les 2 minutes si le direct est coupé, toutes les 6 minutes s'il
// est connecté, rien quand l'appli n'est pas à l'écran.

// Les annonces expirées disparaissent sans attendre le prochain chargement.
const TICK_MS = EXPIRATION_MS;
// Petit délai au hasard : tous les téléphones ne rechargent pas en même temps.
const MAX_JITTER_MS = 3_000;

// Dernières annonces reçues, gardées sur le téléphone : sans réseau
// (cyclone, réseau saturé), l'annonce reste affichée jusqu'à son heure de fin.
const CACHE_KEY = "vigie-nc:annonces";

function saveCache(annonces: Annonce[]): void {
  // Démonstration : l'annonce fictive n'est jamais gardée.
  if (demoActive()) return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(annonces));
  } catch {
    // stockage plein ou indisponible : sans conséquence
  }
}

function readCache(): Annonce[] {
  if (demoActive()) return [];
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    const list = raw ? (JSON.parse(raw) as Annonce[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function enCours(list: Annonce[], now = Date.now()): Annonce[] {
  return list.filter((a) => new Date(a.expiresAt).getTime() > now);
}

export function useAnnonces() {
  const [annonces, setAnnonces] = useState<Annonce[]>([]);
  const requestId = useRef(0);
  // Heure du dernier chargement réussi (pour le rythme du filet de sécurité).
  const dernierChargement = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const data = await fetchAnnonces();
      if (id !== requestId.current) return; // réponse périmée
      dernierChargement.current = Date.now();
      setAnnonces(data);
      saveCache(data);
    } catch {
      // pas de réseau : on garde ce qui est affiché (ou la dernière copie)
    }
  }, []);

  useEffect(() => {
    setAnnonces(enCours(readCache()));
    refresh();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const aLEcran = () => document.visibilityState === "visible";
    const scheduleRefresh = () => {
      // Appli pas à l'écran : rien maintenant, elle recharge en revenant.
      if (!aLEcran()) return;
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        refresh();
      }, 300 + Math.random() * MAX_JITTER_MS);
    };

    const direct = suivreDirect();
    const interval = setInterval(() => {
      const etat = {
        visible: aLEcran(),
        directConnecte: direct.connecte(),
        depuisDernierMs: Date.now() - dernierChargement.current,
      };
      if (doitRecharger(etat, RYTHME_ANNONCES)) refresh();
    }, VERIFICATION_MS);
    const tick = setInterval(() => {
      setAnnonces((list) => {
        const kept = enCours(list);
        return kept.length === list.length ? list : kept;
      });
    }, TICK_MS);
    const onVisible = () => {
      if (aLEcran()) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    let unsubscribe = () => {};
    if (supabase) {
      const client = supabase;
      const channel = client
        .channel("vigie-annonce")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "vigie_annonce_signal" }, scheduleRefresh)
        .subscribe((statut) => {
          // Rebranché après une coupure : rattraper une annonce manquée.
          // (sauf si la page vient d'être rechargée, en revenant à l'écran).
          if (direct.statut(statut) && Date.now() - dernierChargement.current > 10_000) scheduleRefresh();
        });
      unsubscribe = () => {
        client.removeChannel(channel);
      };
    }

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(interval);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe();
    };
  }, [refresh]);

  return annonces;
}
