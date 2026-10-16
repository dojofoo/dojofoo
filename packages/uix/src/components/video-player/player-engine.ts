/**
 * Le lecteur ne parle jamais directement à un moteur de streaming : tout passe
 * par cette interface. Elle est implémentée une première fois en natif —
 * `<video src>` seul, pour les MP4 et WebM progressifs — et le sera une seconde
 * fois par Shaka quand la source est HLS ou DASH.
 *
 * L'API publique du lecteur ne varie pas d'un moteur à l'autre ; seules les
 * capacités varient, et elles sont **observables** plutôt que figées : Shaka
 * découvre les pistes après le chargement et fait varier la liste des qualités
 * en cours de lecture. Un objet rendu une fois pour toutes ne pourrait pas le
 * refléter.
 */

/** Le type de source servie, pas l'implémentation qui la sert. */
export type SourceType = "native" | "hls" | "dash" | "youtube";

/**
 * Le chargement d'un moteur est asynchrone — `await import("shaka-player")` —
 * donc distinct du buffering. `loading` couvre l'intervalle entre le montage et
 * le moment où la lecture est possible, pendant lequel le poster reste affiché.
 */
export type EngineStatus = "idle" | "loading" | "ready" | "error";

export interface QualityLevel {
  /** Identifiant opaque, propre au moteur. */
  id: string;
  height: number;
  bitrate: number | null;
  /** Prêt à afficher, « 1080p ». */
  label: string;
}

export interface EngineCapabilities {
  /**
   * Vide avec le moteur natif : le navigateur ne dit pas ce qu'il y a dans un
   * MP4 progressif. Le sélecteur de qualité reste alors affiché et passe
   * `disabled`, comme sur YouTube — un contrôle qui disparaît déroute plus
   * qu'un contrôle grisé.
   */
  readonly qualities: readonly QualityLevel[];
  /** `null` quand la sélection est automatique, c'est-à-dire adaptative. */
  readonly activeQualityId: string | null;
  /**
   * Ce qui est réellement joué en ce moment, sélection automatique comprise.
   * C'est ce qui permet d'écrire « Auto (720p) » : en adaptatif, `activeQualityId`
   * vaut `null` et ne dit rien de l'image qu'on est en train de regarder.
   */
  readonly playingQualityId: string | null;
  readonly isLive: boolean;
}

export const NO_CAPABILITIES: EngineCapabilities = Object.freeze({
  qualities: Object.freeze([]),
  activeQualityId: null,
  playingQualityId: null,
  isLive: false,
});

/**
 * Les quatre premiers codes sont ceux de `MediaError`, le dernier couvre ce qui
 * casse avant la vidéo elle-même : moteur introuvable, manifeste illisible.
 */
export type PlayerErrorCode = "aborted" | "network" | "decode" | "unsupported" | "engine";

export interface PlayerError {
  code: PlayerErrorCode;
  message: string;
}

export interface PlayerEngine {
  /** Le type de source, une fois la détection et la prop `type` résolues. */
  readonly source: SourceType;
  /** Reçoit l'élément avant tout `load`. */
  attach(video: HTMLVideoElement): void;
  /**
   * Résout quand la source est prise en charge par le moteur — la balise a sa
   * source en natif, le manifeste est analysé avec Shaka. Ce n'est pas le
   * moment où la lecture devient possible : ça, ce sont les événements de
   * `<video>` qui le disent.
   */
  load(src: string): Promise<void>;
  /**
   * Libère l'élément. **Peut rendre une promesse** : Shaka détache l'élément et
   * démonte `MediaSource` de façon asynchrone, et tant que ce n'est pas fini,
   * l'élément ne peut pas être confié à un autre moteur. Le lecteur attend donc
   * cette promesse avant de brancher le suivant — sans quoi un simple
   * changement de `src` laisse la balise muette.
   */
  destroy(): void | Promise<void>;
  getCapabilities(): EngineCapabilities;
  /** `null` rend la sélection automatique. Sans effet si `qualities` est vide. */
  selectQuality(id: string | null): void;
  /** Prévient d'un changement de capacités. Renvoie le désabonnement. */
  subscribe(listener: () => void): () => void;
}
