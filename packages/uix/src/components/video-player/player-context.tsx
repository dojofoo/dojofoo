import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

import type { PlayheadSnapshot, PlayheadStore } from "./playhead-store";
import type { PlayerState, PlayerStateStore } from "./player-state-store";
import type { PlayerActions, UsePlayerResult } from "./use-player";

/**
 * L'état est détenu une fois, par le composant racine, et distribué ici. Les
 * contrôles lisent et rendent ; aucun d'eux ne détient d'état, sans quoi deux
 * contrôles pourraient afficher deux vérités différentes.
 *
 * **Le contexte ne porte que des références stables** — deux stores et un objet
 * d'actions, qui ne changent jamais de la vie du lecteur. Rien ne transite par
 * sa valeur, donc le changer ne re-rend personne. Toute la réactivité passe par
 * des abonnements, et chaque contrôle ne se réveille que pour la tranche qu'il
 * lit. C'est ce qui fait qu'un glissement de volume ne re-rend plus le bouton
 * plein écran.
 */

interface PlayerHandle {
  store: PlayerStateStore;
  actions: PlayerActions;
  playhead: PlayheadStore;
}

const PlayerContext = createContext<PlayerHandle | null>(null);

export interface PlayerProviderProps {
  value: UsePlayerResult;
  children: ReactNode;
}

export function PlayerProvider({ value, children }: PlayerProviderProps) {
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

function usePlayerHandle(): PlayerHandle {
  const handle = useContext(PlayerContext);
  if (!handle) {
    throw new Error("The player controls must be rendered inside <VideoCn>.");
  }
  return handle;
}

/**
 * Lit **une tranche** de l'état, et ne re-rend que si elle change.
 *
 * Le sélecteur doit renvoyer une valeur comparable par `Object.is` : un nombre,
 * un booléen, une chaîne, ou une référence stable comme `capabilities`.
 * Fabriquer un objet dans le sélecteur — `(s) => ({ a: s.a })` — rendrait la
 * comparaison toujours fausse et re-rendrait à chaque notification.
 */
export function usePlayerValue<T>(select: (state: PlayerState) => T): T {
  return usePlayerStoreValue(usePlayerHandle().store, select);
}

/**
 * La même chose, sur un store qu'on tient déjà en main. Le composant racine en
 * a besoin : il lit deux champs *avant* de fournir le contexte, donc il ne peut
 * pas passer par `usePlayerValue`.
 */
export function usePlayerStoreValue<T>(
  store: PlayerStateStore,
  select: (state: PlayerState) => T,
): T {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.getSnapshot()),
    () => select(store.getServerSnapshot()),
  );
}

/** Les actions. Leurs références sont stables : les passer en prop ne re-rend rien. */
export function usePlayerActions(): PlayerActions {
  return usePlayerHandle().actions;
}

/**
 * Lit **une tranche** de la tête de lecture, et ne re-rend que si elle change.
 *
 * La tête bouge à chaque frame : c'est le sélecteur qui décide du rythme. Le
 * scrubber et l'horodatage lisent la seconde entière — un rendu par seconde de
 * média, pas soixante. Même règle que `usePlayerValue` : une valeur comparable
 * par `Object.is`, jamais un objet fabriqué dans le sélecteur.
 */
export function usePlayheadValue<T>(select: (snapshot: PlayheadSnapshot) => T): T {
  const { playhead } = usePlayerHandle();
  return useSyncExternalStore(
    playhead.subscribe,
    () => select(playhead.getSnapshot()),
    () => select(playhead.getServerSnapshot()),
  );
}

/**
 * Les stores tels quels, **jamais pour le rendu** : pour s'abonner dans un effet
 * ou lire une valeur dans un gestionnaire. Le scrubber s'en sert pour dessiner
 * sa position hors de React, soixante fois par seconde, sans le moindre rendu.
 */
export function usePlayheadStore(): PlayheadStore {
  return usePlayerHandle().playhead;
}

export function usePlayerStore(): PlayerStateStore {
  return usePlayerHandle().store;
}
