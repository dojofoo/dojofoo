import { NO_CAPABILITIES } from "./player-engine";
import type { EngineCapabilities, EngineStatus, PlayerError } from "./player-engine";

/**
 * Tout l'état du lecteur **sauf la tête de lecture**, qui a son propre store
 * dans `playhead-store.ts` parce qu'elle avance à chaque frame.
 *
 * Pourquoi un store ici aussi, et pas un `useState` : cet état est distribué à
 * tous les contrôles, et un `useState` ne se distribue que par contexte. Or un
 * contexte porte **une seule valeur** — la changer re-rend tous ceux qui la
 * lisent, même ceux dont le champ n'a pas bougé. Mesuré sur la barre : un
 * glissement de volume re-rendait le bouton plein écran et le bouton
 * Picture-in-Picture vingt et une fois, et `memo` n'y pouvait rien puisque le
 * re-rendu vient du contexte et non des props.
 *
 * Avec un store, chaque contrôle lit **sa** tranche par `useSyncExternalStore`,
 * et React ne le re-rend que si cette tranche a changé. Deuxième bénéfice : on
 * ne recopie plus un système extérieur dans un état React depuis un effet, ce
 * que React déconseille — un élément `<video>` est justement un système
 * extérieur, et `useSyncExternalStore` est l'outil prévu pour s'y abonner.
 */

export interface PlayerState {
  paused: boolean;
  ended: boolean;
  /**
   * La vidéo veut avancer et n'a pas de quoi. Distinct de
   * `engineStatus: "loading"`, qui décrit le moteur et non le flux : l'un se
   * résout une fois, l'autre peut revenir à chaque trou de réseau.
   */
  isBuffering: boolean;
  duration: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  canControlVolume: boolean;
  canFullscreen: boolean;
  isFullscreen: boolean;
  canPictureInPicture: boolean;
  isPictureInPicture: boolean;
  engineStatus: EngineStatus;
  error: PlayerError | null;
  capabilities: EngineCapabilities;
}

/**
 * En direct, et pas seulement d'après le moteur : une durée non finie le dit
 * aussi, et c'est la seule source dont on dispose en HLS natif, là où Shaka ne
 * tourne pas. Les deux comptent, sans quoi un iPhone d'avant iOS 17.1
 * afficherait une vidéo à la demande sans fin.
 */
export function selectIsLive(state: PlayerState): boolean {
  return state.capabilities.isLive || !Number.isFinite(state.duration);
}

export interface PlayerStateStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): PlayerState;
  getServerSnapshot(): PlayerState;
  /** Fusionne et ne prévient que si quelque chose a réellement changé. */
  patch(next: Partial<PlayerState>): void;
}

/**
 * Optimiste sur les capacités qu'on ne peut pas connaître sans le DOM : on ne
 * grise pas un bouton le temps d'un rendu pour le réactiver juste après.
 */
export function createInitialPlayerState(overrides?: Partial<PlayerState>): PlayerState {
  return {
    paused: true,
    ended: false,
    isBuffering: false,
    duration: 0,
    volume: 1,
    muted: false,
    playbackRate: 1,
    canControlVolume: true,
    canFullscreen: false,
    isFullscreen: false,
    canPictureInPicture: false,
    isPictureInPicture: false,
    engineStatus: "idle",
    error: null,
    capabilities: NO_CAPABILITIES,
    ...overrides,
  };
}

export function createPlayerStateStore(initial: PlayerState): PlayerStateStore {
  const listeners = new Set<() => void>();
  // Figé : `getServerSnapshot` doit renvoyer la même référence à chaque appel,
  // et le rendu serveur ne doit jamais voir une valeur venue du navigateur.
  const server: PlayerState = Object.freeze({ ...initial });
  let snapshot = initial;

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return snapshot;
    },
    getServerSnapshot() {
      return server;
    },
    patch(next) {
      let changed = false;
      for (const key of Object.keys(next) as (keyof PlayerState)[]) {
        if (!Object.is(snapshot[key], next[key])) {
          changed = true;
          break;
        }
      }
      // Sans ce garde-fou, un `volumechange` qui réécrit la même valeur — il y
      // en a à chaque frame sur certains navigateurs — réveillerait tous les
      // abonnés pour rien.
      if (!changed) return;
      snapshot = { ...snapshot, ...next };
      for (const listener of listeners) listener();
    },
  };
}
