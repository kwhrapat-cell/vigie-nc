"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { fetchAnnonces } from "./reports-api";
import { Annonce } from "./types";

// Annonces générales (toute la Calédonie), tenues à jour en direct.
// Le temps réel ne transporte aucun contenu (table vigie_annonce_signal) :
// à chaque signal, le téléphone recharge les annonces en cours.

// Filet de sécurité en plus du temps réel (connexion coupée, annonce expirée)
const REFRESH_EVERY_MS = 2 * 60_000;
// Les annonces expirées disparaissent sans attendre le prochain chargement.
const TICK_MS = 30_000;
// Petit délai au hasard : tous les téléphones ne rechargent pas en même temps.
const MAX_JITTER_MS = 3_000;

// Dernières annonces reçues, gardées sur le téléphone : sans réseau
// (cyclone, réseau saturé), l'annonce reste affichée jusqu'à son heure de fin.
const CACHE_KEY = "vigie-nc:annonces";

function saveCache(annonces: Annonce[]): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(annonces));
  } catch {
    // stockage plein ou indisponible : sans conséquence
  }
}

function readCache(): Annonce[] {
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

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const data = await fetchAnnonces();
      if (id !== requestId.current) return; // réponse périmée
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
    const scheduleRefresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        refresh();
      }, 300 + Math.random() * MAX_JITTER_MS);
    };

    const interval = setInterval(refresh, REFRESH_EVERY_MS);
    const tick = setInterval(() => {
      setAnnonces((list) => {
        const kept = enCours(list);
        return kept.length === list.length ? list : kept;
      });
    }, TICK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    let unsubscribe = () => {};
    if (supabase) {
      const client = supabase;
      const channel = client
        .channel("vigie-annonce")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "vigie_annonce_signal" }, scheduleRefresh)
        .subscribe();
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
