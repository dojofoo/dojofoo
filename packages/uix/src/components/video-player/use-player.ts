import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefCallback,
  type RefObject,
} from "react";

import { NO_CAPABILITIES } from "./player-engine";
import type { PlayerEngine, PlayerError, SourceType } from "./player-engine";
import {
  createInitialPlayerState,
  createPlayerStateStore,
  type PlayerState,
  type PlayerStateStore,
} from "./player-state-store";
import { createPlayheadStore, type PlayheadStore } from "./playhead-store";
import { resolveEngine } from "./resolve-engine";

export type { PlayerState } from "./player-state-store";

export interface PlayerActions {
  play(): Promise<void>;
  pause(): void;
  togglePlay(): void;
  seek(time: number): void;
  /** Avance (positif) ou recule (négatif) depuis la position réelle de l'élément. */
  seekBy(seconds: number): void;
  /** Ramène au bord du direct, et relance la lecture si elle était arrêtée. */
  goToLive(): void;
  setVolume(volume: number): void;
  /**
   * Monte ou baisse le volume d'un pas, en tenant compte du muet. La keymap et
   * le curseur de volume passent tous deux par ici : une flèche fait la même
   * chose des deux côtés.
   */
  stepVolume(delta: number): void;
  setMuted(muted: boolean): void;
  toggleMuted(): void;
  setPlaybackRate(rate: number): void;
  toggleFullscreen(): void;
  togglePictureInPicture(): void;
  selectQuality(id: string | null): void;
}

export interface UsePlayerOptions {
  src: string;
  type?: SourceType;
  /** 0 à 1. Défaut 0,5. */
  defaultVolume?: number;
  defaultMuted?: boolean;
  /** Cible du plein écran. À défaut, le `<video>` lui-même. */
  containerRef?: RefObject<HTMLElement | null>;
}

export interface UsePlayerResult {
  /**
   * À poser sur le `<video>`. C'est le hook qui fabrique la ref, et non
   * l'appelant qui lui en confie une : une callback ref adossée à un état
   * permet aux effets de suivre l'élément s'il est un jour remplacé — rendu
   * conditionnel, `key` différente. Avec un objet ref figé, ils resteraient
   * accrochés au nœud mort et le lecteur deviendrait inerte sans rien dire.
   */
  ref: RefCallback<HTMLVideoElement>;
  /** L'état, à lire par tranches. Référence stable pour la vie du composant. */
  store: PlayerStateStore;
  actions: PlayerActions;
  playhead: PlayheadStore;
}

/**
 * Assez fort pour être audible sans faire sursauter, assez bas pour qu'on
 * monte le son plutôt que de couper.
 */
const DEFAULT_VOLUME = 0.5;

/** Voir `goToLive` : la marge qui évite de se poser sur un segment absent. */
const LIVE_EDGE_MARGIN = 1;

/**
 * Les événements qui font bouger l'état « lent ». `timeupdate` et `progress`
 * n'y sont volontairement pas : ils appartiennent au store de la tête de
 * lecture, et les faire passer par React annulerait tout l'intérêt du store.
 */
const MEDIA_EVENTS = [
  "loadstart",
  "loadedmetadata",
  "canplay",
  "canplaythrough",
  "waiting",
  "stalled",
  "durationchange",
  "play",
  "playing",
  "pause",
  "ended",
  "seeking",
  "seeked",
  "emptied",
  "volumechange",
  "ratechange",
] as const;

/**
 * Safari n'a jamais retiré ses préfixes, et l'iPhone n'a jamais eu l'API
 * standard du tout. On teste la présence des méthodes plutôt que la marque du
 * navigateur : le jour où WebKit s'aligne, ce code n'a pas à changer.
 */
interface WebkitFullscreenElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface WebkitFullscreenDocument {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

/**
 * Sur iPhone, seule la vidéo passe en plein écran, et c'est le système qui la
 * rend : notre interface disparaît le temps du plein écran. C'est un repli, pas
 * un choix — on ne l'utilise que s'il est la seule option.
 */
interface WebkitFullscreenVideo {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
}

type FullscreenMode = "element" | "webkit" | "video" | "none";

function webkitDocument(): Document & WebkitFullscreenDocument {
  return document as Document & WebkitFullscreenDocument;
}

function webkitVideo(video: HTMLVideoElement): HTMLVideoElement & WebkitFullscreenVideo {
  return video as HTMLVideoElement & WebkitFullscreenVideo;
}

function detectFullscreenMode(target: HTMLElement, video: HTMLVideoElement): FullscreenMode {
  if (typeof target.requestFullscreen === "function") return "element";
  const prefixed = target as HTMLElement & WebkitFullscreenElement;
  if (typeof prefixed.webkitRequestFullscreen === "function") return "webkit";
  if (typeof webkitVideo(video).webkitEnterFullscreen === "function") return "video";
  return "none";
}

function isFullscreenActive(target: HTMLElement, video: HTMLVideoElement): boolean {
  const doc = webkitDocument();
  const active = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
  // Un autre élément de la page peut être en plein écran sans que ça nous
  // concerne ; on ne répond vrai que si c'est bien notre cible.
  if (active) return active === target || active.contains(target);
  // Plein écran natif iOS : le document n'en sait rien, seule la vidéo le sait.
  return webkitVideo(video).webkitDisplayingFullscreen === true;
}

/**
 * Plein écran et Picture-in-Picture rejettent quand le geste utilisateur
 * manque ou quand l'utilisateur refuse. Ce n'est pas une erreur du lecteur : le
 * `PlayerState.error` est réservé à ce qui empêche la lecture.
 */
function ignoreRejection(result: unknown): void {
  if (result instanceof Promise) void result.catch(() => undefined);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function toPlayerError(error: MediaError | null): PlayerError {
  // Les navigateurs remplissent rarement `message`, et jamais dans la langue de
  // l'hôte : c'est le `code` qui porte l'information exploitable.
  const message = error?.message || "Playback failed.";
  if (error) {
    if (error.code === error.MEDIA_ERR_ABORTED) return { code: "aborted", message };
    if (error.code === error.MEDIA_ERR_NETWORK) return { code: "network", message };
    if (error.code === error.MEDIA_ERR_DECODE) return { code: "decode", message };
  }
  // `MEDIA_ERR_SRC_NOT_SUPPORTED`, et le cas où l'élément a émis `error` sans
  // exposer de `MediaError` : dans les deux cas le navigateur ne sait pas lire
  // cette source.
  return { code: "unsupported", message };
}

function engineErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "The video engine could not load the source.";
}

export function usePlayer(options: UsePlayerOptions): UsePlayerResult {
  const { src, type, defaultVolume = DEFAULT_VOLUME, defaultMuted, containerRef } = options;

  // L'élément vit à deux endroits, et c'est voulu. L'état le fait suivre aux
  // effets, qui doivent se rejouer s'il change. La ref le donne aux actions
  // sans leur faire changer d'identité, pour que les contrôles qui les
  // reçoivent en props ne se re-rendent pas pour autant.
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);

  const attachVideo = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    setVideo(node);
  }, []);

  // Les valeurs par défaut n'entrent que dans l'état initial : le lecteur est
  // non contrôlé, et le store n'est jamais recréé si elles changent ensuite.
  const [store] = useState(() =>
    createPlayerStateStore(
      createInitialPlayerState({
        volume: clamp01(defaultVolume),
        muted: defaultMuted ?? false,
      }),
    ),
  );

  // Un seul store pour la vie du composant : l'initialiseur paresseux de
  // `useState` est le seul moyen que React garantisse de n'appeler qu'une fois.
  const [playhead] = useState(createPlayheadStore);

  const engineRef = useRef<PlayerEngine | null>(null);
  /**
   * Le démontage du moteur précédent, tant qu'il n'a pas rendu l'élément. Une
   * ref et non un état : personne ne se rend pour ça, et c'est le prochain
   * effet qui doit la lire.
   */
  const teardownRef = useRef<Promise<void> | null>(null);
  const fullscreenModeRef = useRef<FullscreenMode>("none");
  const defaultsAppliedRef = useRef(false);

  useEffect(() => {
    if (!video) return;
    return playhead.attach(video);
  }, [playhead, video]);

  useEffect(() => {
    if (!video) return;

    const sync = () => {
      const next: Partial<PlayerState> = {
        paused: video.paused,
        ended: video.ended,
        // Déduit de l'élément plutôt que mémorisé sur `waiting` / `playing` :
        // un état qui se recalcule ne peut pas rester coincé sur vrai après un
        // événement manqué.
        isBuffering: !video.paused && video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA,
        // `NaN` tant que les métadonnées manquent. `Infinity` en live est
        // conservé tel quel : c'est une information, pas une valeur absente.
        duration: Number.isNaN(video.duration) ? 0 : video.duration,
        volume: video.volume,
        muted: video.muted,
        playbackRate: video.playbackRate,
      };
      // `engineStatus` n'est pas ici : c'est l'effet du moteur qui le tient, et
      // il en sait plus que l'élément — notamment pendant le chargement de Shaka.
      store.patch(next);
    };

    const handleError = () => {
      // Un `error` sans `MediaError` est un résidu : l'élément est déjà reparti
      // sur une autre source et a effacé la précédente. Le rapporter
      // inventerait une panne.
      if (!video.error) return;
      // Libérer une source — au démontage, ou avant d'en charger une autre —
      // laisse l'élément sans candidat, ce que le navigateur signale comme un
      // format illisible. Il n'y a rien à lire, donc rien qui ait échoué.
      if (!video.currentSrc && !video.getAttribute("src")) return;
      store.patch({ error: toPlayerError(video.error), engineStatus: "error" });
    };

    sync();
    for (const event of MEDIA_EVENTS) video.addEventListener(event, sync);
    video.addEventListener("error", handleError);

    return () => {
      for (const event of MEDIA_EVENTS) video.removeEventListener(event, sync);
      video.removeEventListener("error", handleError);
    };
  }, [store, video]);

  useEffect(() => {
    if (!video) return;
    // Le nœud repasse par la ref pour être **écrit**. C'est le même élément :
    // l'état déclenche l'effet, la ref l'autorise à agir. Muter directement
    // `video`, qui vient de l'état, reviendrait à modifier une valeur issue du
    // rendu — ce que React interdit, et ce que le compilateur refuse.
    const element = videoRef.current;
    if (!element) return;

    if (!defaultsAppliedRef.current) {
      defaultsAppliedRef.current = true;
      // Le lecteur est **non contrôlé** : ces valeurs sont un point de départ,
      // pas une source de vérité. Rien ne les réapplique ensuite.
      element.volume = clamp01(defaultVolume);
      if (defaultMuted !== undefined) element.muted = defaultMuted;
    }

    // Sur iPhone, Safari ignore les écritures sur `video.volume` : la propriété
    // vaut toujours 1 et le curseur de volume n'aurait aucun effet. Rien ne
    // l'annonce, il faut essayer. La valeur trouvée est restaurée aussitôt.
    const found = element.volume;
    const probe = found === 1 ? 0.5 : 1;
    element.volume = probe;
    const canControlVolume = element.volume === probe;
    element.volume = found;

    // Publié seulement maintenant, et il n'y a pas d'autre moyen : la capacité
    // ne se connaît qu'en essayant, et essayer pendant le rendu casserait le
    // rendu serveur.
    store.patch({ canControlVolume, volume: element.volume, muted: element.muted });
  }, [defaultMuted, defaultVolume, store, video]);

  useEffect(() => {
    if (!video) return;

    let active = true;
    const engine = resolveEngine(src, type);
    engineRef.current = engine;

    const syncCapabilities = () => {
      if (active) store.patch({ capabilities: engine.getCapabilities() });
    };
    // `ready` ne vient pas de la promesse du moteur : celle-ci dit seulement
    // que la source est prise en charge. C'est l'élément qui dit quand la
    // lecture devient possible.
    const markReady = () => {
      if (active) store.patch({ engineStatus: "ready" });
    };

    // On ne sait qu'un chargement commence qu'une fois le moteur résolu, ce qui
    // exige l'élément, qui n'existe qu'après le montage.
    store.patch({ engineStatus: "loading", error: null, capabilities: engine.getCapabilities() });
    const unsubscribe = engine.subscribe(syncCapabilities);
    video.addEventListener("loadedmetadata", markReady);
    video.addEventListener("canplay", markReady);

    const start = async () => {
      // Le moteur précédent peut être encore en train de rendre l'élément : un
      // changement de `src` démonte l'un et monte l'autre dans la même frame,
      // alors que Shaka détache de façon asynchrone. Attacher sans attendre
      // laisse la balise à deux maîtres, et elle reste muette — mesuré :
      // « chargement » perpétuel, `readyState 0`, aucune erreur pour le dire.
      const teardown = teardownRef.current;
      if (teardown) {
        await teardown;
        if (teardownRef.current === teardown) teardownRef.current = null;
        if (!active) return;
      }

      engine.attach(video);
      try {
        await engine.load(src);
        if (!active) return;
        syncCapabilities();
        // Un élément qui portait déjà cette source a émis `loadedmetadata`
        // avant qu'on écoute : l'événement ne reviendra pas.
        // The constants come from the class: a custom media element (YouTube's) is no `<video>` and lacks them
        if (video.readyState >= HTMLMediaElement.HAVE_METADATA) markReady();
      } catch (cause: unknown) {
        if (!active) return;
        store.patch({
          engineStatus: "error",
          error: { code: "engine", message: engineErrorMessage(cause) },
        });
      }
    };
    void start();

    return () => {
      active = false;
      unsubscribe();
      video.removeEventListener("loadedmetadata", markReady);
      video.removeEventListener("canplay", markReady);
      // La promesse, quand il y en a une, dit quand l'élément est réellement
      // rendu. C'est elle qu'attendra le moteur suivant.
      teardownRef.current = Promise.resolve(engine.destroy());
      if (engineRef.current === engine) engineRef.current = null;
      // La source vient d'être libérée : repartir de zéro plutôt que de laisser
      // l'ancien statut décrire la suivante.
      store.patch({ engineStatus: "idle", error: null, capabilities: NO_CAPABILITIES });
    };
  }, [src, store, type, video]);

  useEffect(() => {
    if (!video) return;
    const target = containerRef?.current ?? video;

    const mode = detectFullscreenMode(target, video);
    fullscreenModeRef.current = mode;

    const sync = () => {
      store.patch({
        canFullscreen: mode !== "none",
        isFullscreen: isFullscreenActive(target, video),
      });
    };
    sync();

    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    // Le plein écran natif iOS n'émet rien sur le document : la vidéo est la
    // seule à en parler.
    video.addEventListener("webkitbeginfullscreen", sync);
    video.addEventListener("webkitendfullscreen", sync);

    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
      video.removeEventListener("webkitbeginfullscreen", sync);
      video.removeEventListener("webkitendfullscreen", sync);
    };
  }, [containerRef, store, video]);

  useEffect(() => {
    if (!video) return;

    const sync = () => {
      store.patch({
        canPictureInPicture:
          Boolean(document.pictureInPictureEnabled) && !video.disablePictureInPicture && typeof video.requestPictureInPicture === "function",
        isPictureInPicture: document.pictureInPictureElement === video,
      });
    };
    sync();

    video.addEventListener("enterpictureinpicture", sync);
    video.addEventListener("leavepictureinpicture", sync);
    // L'attribut `disablePictureInPicture` peut arriver avec une nouvelle
    // source : on repasse dessus à chaque chargement.
    video.addEventListener("loadedmetadata", sync);

    return () => {
      video.removeEventListener("enterpictureinpicture", sync);
      video.removeEventListener("leavepictureinpicture", sync);
      video.removeEventListener("loadedmetadata", sync);
    };
  }, [store, video]);

  const play = useCallback(() => {
    const video = videoRef.current;
    return video ? video.play() : Promise.resolve();
  }, []);

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    // On lit l'élément plutôt que l'état : entre deux rendus, la vidéo peut
    // s'être arrêtée d'elle-même, et c'est elle qui a raison.
    if (video.paused || video.ended) ignoreRejection(video.play());
    else video.pause();
  }, []);

  const seek = useCallback(
    (time: number) => {
      const video = videoRef.current;
      if (!video || !Number.isFinite(time)) return;
      // En live, `duration` vaut `Infinity` : il n'y a pas de borne haute à
      // appliquer, le navigateur ramènera lui-même dans la fenêtre DVR.
      const upperBound = Number.isFinite(video.duration) ? video.duration : time;
      video.currentTime = Math.min(Math.max(time, 0), upperBound);
    },
    [],
  );

  const seekBy = useCallback(
    (seconds: number) => {
      const video = videoRef.current;
      if (!video) return;
      // L'élément et non la tête de lecture du store : `currentTime` est à
      // jour dès l'écriture, alors que le store attend `seeking`. Deux `←`
      // rapprochés partiraient sinon du même point, et l'un serait perdu.
      seek(video.currentTime + seconds);
    },
    [seek],
  );

  /**
   * Le bord du direct se vise avec une marge : la dernière seconde diffusée
   * n'est pas encore téléchargée, et s'y poser fait caler la lecture le temps
   * que le segment arrive. Une seconde, c'est assez pour tomber dans ce qui est
   * déjà là sans qu'on se sente en retard.
   */
  const goToLive = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const { seekable } = video;
    if (!seekable || seekable.length === 0) return;
    const edge = seekable.end(seekable.length - 1);
    const start = seekable.start(0);
    video.currentTime = Math.max(edge - LIVE_EDGE_MARGIN, start);
    // Revenir au direct sur une vidéo en pause n'aurait aucun sens : c'est
    // repartir qu'on demande.
    if (video.paused) ignoreRejection(video.play());
  }, []);

  const setVolume = useCallback(
    (volume: number) => {
      const video = videoRef.current;
      if (!video) return;
      // On écrit sur l'élément et on s'arrête là : l'état suivra
      // `volumechange`. L'inverse ferait mentir l'interface sur un iPhone, où
      // l'écriture n'a aucun effet.
      video.volume = clamp01(volume);
    },
    [],
  );

  /**
   * Depuis le muet, un pas vers le haut rend le son au volume d'avant la
   * coupure, sans l'augmenter : c'est ce qu'on attend en appuyant, et repartir
   * des 0 % affichés obligerait à remonter pas à pas. Si ce volume était nul,
   * le pas lui-même sert de volume. Vers le bas, le muet reste muet : baisser un
   * son qu'on n'entend pas ne veut rien dire, et écraser le volume mémorisé
   * ferait perdre ce que `m` rétablira.
   */
  const stepVolume = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(delta)) return;
    if (video.muted) {
      if (delta <= 0) return;
      // `max` et non le seul volume mémorisé : `End` sur le curseur arrive ici
      // avec un pas de 1, et doit mener au maximum.
      video.volume = Math.max(video.volume, clamp01(delta));
      video.muted = false;
      return;
    }
    // Arrondi au millième : 0,05 ajouté pas à pas ne tombe pas juste en
    // virgule flottante, et `aria-valuenow` porterait 0.6000000000000001.
    video.volume = clamp01(Math.round((video.volume + delta) * 1000) / 1000);
  }, []);

  const setMuted = useCallback(
    (muted: boolean) => {
      const video = videoRef.current;
      if (video) video.muted = muted;
    },
    [],
  );

  const toggleMuted = useCallback(() => {
    const video = videoRef.current;
    if (video) video.muted = !video.muted;
  }, []);

  const setPlaybackRate = useCallback(
    (rate: number) => {
      const video = videoRef.current;
      if (!video || !Number.isFinite(rate) || rate <= 0) return;
      video.playbackRate = rate;
    },
    [],
  );

  const toggleFullscreen = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const target = containerRef?.current ?? video;
    const doc = webkitDocument();
    const prefixedVideo = webkitVideo(video);

    if (isFullscreenActive(target, video)) {
      if (typeof doc.exitFullscreen === "function") ignoreRejection(doc.exitFullscreen());
      else if (typeof doc.webkitExitFullscreen === "function") doc.webkitExitFullscreen();
      else prefixedVideo.webkitExitFullscreen?.();
      return;
    }

    switch (fullscreenModeRef.current) {
      case "element":
        ignoreRejection(target.requestFullscreen());
        break;
      case "webkit":
        (target as HTMLElement & WebkitFullscreenElement).webkitRequestFullscreen?.();
        break;
      case "video":
        prefixedVideo.webkitEnterFullscreen?.();
        break;
      default:
        break;
    }
  }, [containerRef]);

  const togglePictureInPicture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (document.pictureInPictureElement === video) {
      ignoreRejection(document.exitPictureInPicture());
      return;
    }
    if (typeof video.requestPictureInPicture === "function") {
      ignoreRejection(video.requestPictureInPicture());
    }
  }, []);

  const selectQuality = useCallback((id: string | null) => {
    engineRef.current?.selectQuality(id);
  }, []);

  /**
   * Les actions sont stables pour la vie du composant : les contrôles les
   * reçoivent en props et ne doivent pas se re-rendre parce que la tête de
   * lecture a avancé.
   */
  const actions = useMemo<PlayerActions>(
    () => ({
      play,
      pause,
      togglePlay,
      seek,
      seekBy,
      goToLive,
      setVolume,
      stepVolume,
      setMuted,
      toggleMuted,
      setPlaybackRate,
      toggleFullscreen,
      togglePictureInPicture,
      selectQuality,
    }),
    [
      play,
      pause,
      togglePlay,
      seek,
      seekBy,
      goToLive,
      setVolume,
      stepVolume,
      setMuted,
      toggleMuted,
      setPlaybackRate,
      toggleFullscreen,
      togglePictureInPicture,
      selectQuality,
    ],
  );

  // Que des références stables : l'objet ne change plus d'identité après le
  // montage, et le contexte qui le porte ne re-rend donc jamais personne.
  return useMemo(
    () => ({ ref: attachVideo, store, actions, playhead }),
    [attachVideo, store, actions, playhead],
  );
}
