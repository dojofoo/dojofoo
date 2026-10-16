import { LIVE_EDGE_TOLERANCE } from "./controls-options";

/**
 * La tête de lecture ne passe pas par l'état React.
 *
 * `timeupdate` n'est émis que quatre fois par seconde : la valeur est juste,
 * mais une barre qui n'avance qu'à ce rythme saute par paliers. Interpoler
 * entre deux événements reviendrait à *deviner* la position — la barre
 * continuerait d'avancer pendant que la vidéo cale pour charger, et à contre-
 * temps dès qu'on passe en 2×. On lit donc la vraie valeur à chaque frame.
 *
 * Soixante fois par seconde dans l'état d'un contexte React re-rendrait tout le
 * lecteur, bouton play et curseur de volume compris. D'où ce store : la valeur
 * vit dans une clôture, et seuls les composants qui s'y abonnent — le scrubber,
 * l'horodatage — se re-rendent. `useSyncExternalStore` s'y branche directement.
 */

export interface PlayheadSnapshot {
  /**
   * Au bord du direct, ou aussi près qu'on puisse l'être de ce flux-là. Décidé
   * ici et nulle part ailleurs : la pastille, l'horodatage et le scrubber
   * doivent en dire la même chose, et un booléen ne les réveille qu'aux
   * bascules au lieu d'une fois par frame.
   *
   * Sans objet en vidéo à la demande, où le bord n'est que la fin du fichier :
   * les contrôles ne le lisent qu'en direct.
   */
  readonly atLiveEdge: boolean;
  readonly currentTime: number;
  /**
   * Bornes de la plage chargée qui contient la tête de lecture, ce que le
   * scrubber dessine en aperçu du buffer. Le début compte : après un saut à
   * 7:00, la plage part de 7:00, et la dessiner depuis zéro mentirait. Les
   * autres plages — celles d'avant le saut — ne le concernent pas.
   */
  readonly bufferedStart: number;
  readonly bufferedEnd: number;
  /**
   * La fenêtre où l'on a le droit de chercher. En vidéo à la demande, elle va
   * de zéro à la durée ; en direct, c'est la fenêtre encore diffusée, et elle
   * glisse en permanence.
   *
   * Lue sur `video.seekable` et non sur le moteur : elle est alors juste avec
   * Shaka comme avec le HLS natif d'un iPhone qui n'a pas de Shaka du tout.
   */
  readonly seekableStart: number;
  readonly seekableEnd: number;
  /**
   * La position demandée pendant un glissement, `null` le reste du temps. Elle
   * vit ici et non dans le curseur parce que plusieurs choses doivent suivre le
   * doigt plutôt que la vidéo — le scrubber, l'horodatage, le texte lu par un
   * lecteur d'écran — et qu'elles lisent toutes ce store.
   */
  readonly scrubTime: number | null;
}

export interface PlayheadStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): PlayheadSnapshot;
  getServerSnapshot(): PlayheadSnapshot;
  /** Branche le store sur l'élément. Renvoie le débranchement. */
  attach(video: HTMLVideoElement): () => void;
  /**
   * Pose la position d'aperçu d'un glissement, ou la retire avec `null`. Au
   * retrait, l'élément est relu dans le même mouvement : la recherche finale
   * l'a déjà positionné, donc rien ne revient en arrière à l'écran.
   */
  scrub(time: number | null): void;
}

/** Ce qu'il faut afficher : le doigt s'il y en a un, sinon la vidéo. */
export function displayedTime(snapshot: PlayheadSnapshot): number {
  return snapshot.scrubTime ?? snapshot.currentTime;
}

const EMPTY_PLAYHEAD: PlayheadSnapshot = Object.freeze({
  atLiveEdge: true,
  currentTime: 0,
  bufferedStart: 0,
  bufferedEnd: 0,
  seekableStart: 0,
  seekableEnd: 0,
  scrubTime: null,
});

/**
 * Tolérance de raccord : les navigateurs laissent des trous de quelques
 * millisecondes entre deux plages contiguës, qu'il ne faut pas lire comme une
 * interruption du buffer.
 */
const RANGE_TOLERANCE = 0.25;

/**
 * La fenêtre cherchable, de la première borne à la dernière. Plusieurs plages,
 * c'est un flux troué : on garde l'enveloppe, qui est ce que le scrubber
 * dessine. Aucune plage — les métadonnées manquent encore — donne une fenêtre
 * vide posée sur `time`, jamais `0 → 0`, qui ferait sauter la tête de lecture.
 */
function seekableWindow(video: HTMLVideoElement, time: number): [number, number] {
  const { seekable } = video;
  // A custom media element (YouTube's) has no `seekable`: no live window, so an empty one on `time`
  if (!seekable || seekable.length === 0) return [time, time];
  return [seekable.start(0), seekable.end(seekable.length - 1)];
}

/** La plage qui contient `time`, ou une plage vide posée sur `time`. */
function bufferedRangeAt(video: HTMLVideoElement, time: number): [number, number] {
  const { buffered } = video;
  for (let i = 0; i < buffered.length; i += 1) {
    if (time >= buffered.start(i) - RANGE_TOLERANCE && time <= buffered.end(i)) {
      return [buffered.start(i), buffered.end(i)];
    }
  }
  return [time, time];
}

export function createPlayheadStore(): PlayheadStore {
  const listeners = new Set<() => void>();
  let snapshot: PlayheadSnapshot = EMPTY_PLAYHEAD;
  let video: HTMLVideoElement | null = null;
  let frame = 0;
  /**
   * Le retard de croisière du flux : le plus petit écart au bord jamais observé
   * depuis le chargement. Mesuré et non supposé, comme les capacités du moteur
   * — il vaut trois secondes sur un flux à basse latence et une trentaine sur
   * un HLS classique, et c'est par rapport à **lui** qu'on juge si l'on est au
   * bord. `Infinity` tant qu'on n'a rien vu : tout écart fait alors référence.
   */
  let liveLatency = Number.POSITIVE_INFINITY;

  /**
   * `getSnapshot` doit renvoyer la même référence tant que rien ne change,
   * sans quoi `useSyncExternalStore` re-rend en boucle. On ne reconstruit
   * l'objet que sur un vrai changement de valeur — et c'est le seul endroit où
   * il est reconstruit, que la cause soit la vidéo ou le doigt.
   */
  function commit(next: PlayheadSnapshot) {
    if (
      next.currentTime === snapshot.currentTime &&
      next.bufferedStart === snapshot.bufferedStart &&
      next.bufferedEnd === snapshot.bufferedEnd &&
      next.seekableStart === snapshot.seekableStart &&
      next.seekableEnd === snapshot.seekableEnd &&
      next.atLiveEdge === snapshot.atLiveEdge &&
      next.scrubTime === snapshot.scrubTime
    ) {
      return;
    }
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function measure(scrubTime: number | null): PlayheadSnapshot | null {
    if (!video) return null;
    const currentTime = video.currentTime;
    const [bufferedStart, bufferedEnd] = bufferedRangeAt(video, currentTime);
    const [seekableStart, seekableEnd] = seekableWindow(video, currentTime);

    // La référence se prend sur la vidéo et non sur le doigt : pendant un
    // glissement, la position affichée n'est pas celle qu'on lit.
    if (!video.paused) {
      liveLatency = Math.min(liveLatency, seekableEnd - currentTime);
    }
    // Le doigt, lui, décide de l'affichage : la pastille s'éteint dès qu'on
    // quitte le bord, sans attendre que la vidéo ait cherché.
    const delay = seekableEnd - (scrubTime ?? currentTime);
    const atLiveEdge = delay <= liveLatency + LIVE_EDGE_TOLERANCE;

    return {
      atLiveEdge,
      currentTime,
      bufferedStart,
      bufferedEnd,
      seekableStart,
      seekableEnd,
      scrubTime,
    };
  }

  function read() {
    const next = measure(snapshot.scrubTime);
    if (next) commit(next);
  }

  function tick() {
    read();
    frame = requestAnimationFrame(tick);
  }

  function startTicking() {
    // La boucle ne tourne qu'entre `play` et `pause` : à l'arrêt, la tête ne
    // bouge pas et une frame toutes les seize millisecondes ne servirait qu'à
    // chauffer. Elle continue pendant un calage, où la tête peut encore avancer
    // de quelques images avant de s'immobiliser ; `read()` sort tôt quand la
    // valeur n'a pas changé, donc ça ne coûte rien.
    if (frame === 0) frame = requestAnimationFrame(tick);
  }

  function stopTicking() {
    if (frame !== 0) cancelAnimationFrame(frame);
    frame = 0;
  }

  function reset() {
    // Le retard de croisière appartient au flux qu'on quitte : le suivant aura
    // le sien, et garder l'ancien ferait juger le nouveau sur une référence
    // qui n'est pas la sienne.
    liveLatency = Number.POSITIVE_INFINITY;
    if (snapshot === EMPTY_PLAYHEAD) return;
    snapshot = EMPTY_PLAYHEAD;
    for (const listener of listeners) listener();
  }

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
    // Rien à lire au rendu serveur : la tête de lecture démarre à zéro.
    getServerSnapshot() {
      return EMPTY_PLAYHEAD;
    },
    scrub(time) {
      const scrubTime = time === null || !Number.isFinite(time) ? null : time;
      commit(measure(scrubTime) ?? { ...snapshot, scrubTime });
    },
    attach(element) {
      video = element;
      read();
      if (!element.paused) startTicking();

      element.addEventListener("play", startTicking);
      element.addEventListener("playing", startTicking);
      element.addEventListener("pause", stopTicking);
      element.addEventListener("ended", stopTicking);
      // Hors lecture, ces événements sont la seule source de fraîcheur — et
      // `timeupdate` prend le relais quand l'onglet passe en arrière-plan, où
      // le navigateur suspend `requestAnimationFrame`.
      element.addEventListener("timeupdate", read);
      element.addEventListener("seeking", read);
      element.addEventListener("seeked", read);
      element.addEventListener("progress", read);
      element.addEventListener("loadedmetadata", read);
      element.addEventListener("emptied", reset);

      return () => {
        stopTicking();
        element.removeEventListener("play", startTicking);
        element.removeEventListener("playing", startTicking);
        element.removeEventListener("pause", stopTicking);
        element.removeEventListener("ended", stopTicking);
        element.removeEventListener("timeupdate", read);
        element.removeEventListener("seeking", read);
        element.removeEventListener("seeked", read);
        element.removeEventListener("progress", read);
        element.removeEventListener("loadedmetadata", read);
        element.removeEventListener("emptied", reset);
        video = null;
        reset();
      };
    },
  };
}
