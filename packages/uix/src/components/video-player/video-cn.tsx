import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DetailedHTMLProps,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from "react";

/**
 * `cn` vient du paquet npm et non de l'alias `utils` : `lib/utils.ts` n'est plus
 * qu'une réexportation chez shadcn, les primitives générées importent déjà
 * depuis `"cn"`, et rien ne garantit que le fichier existe chez le consommateur
 * — vérifié en le retirant d'un projet de test, l'installation n'en dit rien.
 */
import { cn } from "~/lib/utils";

import type { Chapter } from "./chapters";
import { ChaptersProvider } from "./chapters-context";
import { ControlsProvider } from "./controls-context";
import { resolveControlsOptions, type ControlsOptions } from "./controls-options";
import { PlayerControls } from "./player-controls";
import { PlayerProvider, usePlayerStoreValue } from "./player-context";
import type { SourceType } from "./player-engine";
import { useControlsVisibility } from "./use-controls-visibility";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";
import { usePlayer } from "./use-player";
import { detectSourceType } from "./resolve-engine";
import { defineYoutubeElement } from "./youtube-engine";

/* uix: `<youtube-video>`, youtube-video-element's media element (see youtube-engine) */
declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "youtube-video": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

export interface VideoCnProps {
  src: string;
  /**
   * Échappement pour les URL signées, sans extension ou trompeuses, que la
   * détection automatique ne saurait pas lire.
   */
  type?: SourceType;
  poster?: string;
  /**
   * Les chapitres, un début et un titre par entrée, le temps en secondes.
   *
   * L'ordre n'a pas d'importance, les doublons et les valeurs hors de la vidéo
   * sont écartés, et le premier chapitre est ramené à zéro — un trou en tête de
   * barre ne voudrait rien dire. Sans effet sur un flux en direct, où un
   * chapitre n'aurait ni fin ni place fixe.
   */
  chapters?: readonly Chapter[];
  autoPlay?: boolean;
  loop?: boolean;
  /**
   * Volume de départ, entre 0 et 1. Valeur *initiale* : le lecteur détient son
   * volume et le garde. Repasser une autre valeur ensuite ne le repilote pas.
   */
  defaultVolume?: number;
  defaultMuted?: boolean;
  /** Ce que la barre affiche et comment elle se comporte. Voir `ControlsOptions`. */
  controls?: ControlsOptions;
  className?: string;
  /** Transmis à l'élément `<video>` interne. */
  ref?: Ref<HTMLVideoElement>;
  /** uix: the inner `<video>`'s accessible name */
  title?: string;
}

/**
 * Un clic bascule la lecture, un double-clic le plein écran : le premier doit
 * donc attendre de savoir s'il est seul. Ce délai est la rançon du geste — trop
 * court, le double-clic lance aussi la lecture ; trop long, le clic traîne.
 */
const DOUBLE_CLICK_WINDOW = 250;

/**
 * Le composant racine. Il détient l'état, le distribue, et rend le conteneur
 * dans lequel vivent les contrôles.
 *
 * Il n'accepte pas de `children` : la barre est toujours la nôtre, et c'est aux
 * props de la piloter. Le lecteur s'installe et fonctionne — masquer un
 * contrôle ou changer un comportement doit rester une prop, jamais une
 * modification à faire à la main dans le code livré. Le découpage en un fichier
 * par contrôle est là pour la lisibilité, pas pour sous-traiter le travail.
 */
export function VideoCn({
  src,
  type,
  poster,
  chapters,
  autoPlay,
  loop,
  defaultVolume,
  defaultMuted,
  controls,
  className,
  ref,
  title,
}: VideoCnProps) {
  // Le plein écran est demandé sur le conteneur, pas sur le `<video>` : sinon
  // les contrôles, qui sont à côté de la vidéo et non dedans, disparaîtraient.
  const containerRef = useRef<HTMLDivElement>(null);
  // uix: a YouTube link plays in `<youtube-video>`, defined on first use – the element renders once it is, so the
  // engine never writes to an element that isn't upgraded yet
  const youtube = (type ?? detectSourceType(src)) === "youtube";
  const [youtubeDefined, setYoutubeDefined] = useState(() => typeof customElements !== "undefined" && customElements.get("youtube-video") !== undefined);
  useEffect(() => {
    if (!youtube || youtubeDefined) return;
    let active = true;
    defineYoutubeElement().then(() => active && setYoutubeDefined(true));
    return () => {
      active = false;
    };
  }, [youtube, youtubeDefined]);

  const player = usePlayer({
    src,
    type,
    defaultVolume,
    defaultMuted,
    containerRef,
  });

  const { actions } = player;
  const paused = usePlayerStoreValue(player.store, (state) => state.paused);
  const isFullscreen = usePlayerStoreValue(player.store, (state) => state.isFullscreen);
  const { togglePlay, toggleFullscreen } = actions;

  // Résolue une fois : l'objet part dans un contexte, et en fabriquer un
  // nouveau à chaque rendu re-rendrait tous les contrôles pour rien.
  // uix: YouTube's player can't go picture-in-picture – the button would only ever be greyed out, so it goes
  const controlsOptions = useMemo(() => resolveControlsOptions(youtube ? { ...controls, pictureInPicture: false } : controls), [controls, youtube]);

  const { visible, holdVisible, reveal } = useControlsVisibility({
    containerRef,
    paused,
    visibility: controlsOptions.visibility,
    autoHideDelay: controlsOptions.autoHideDelay,
  });

  const handleKeyDown = useKeyboardShortcuts({
    enabled: controlsOptions.keyboard.enabled,
    store: player.store,
    actions,
    reveal,
  });

  // La ref du consommateur passe par une ref à nous, jamais par les
  // dépendances : une callback ref écrite en ligne change à chaque rendu, et
  // React détacherait puis rattacherait l'élément à chaque changement d'état.
  const forwardedRef = useRef(ref);
  useEffect(() => {
    forwardedRef.current = ref;
  }, [ref]);

  const attachPlayerVideo = player.ref;
  const attachVideo = useCallback(
    (node: HTMLVideoElement | null) => {
      attachPlayerVideo(node);
      const forwarded = forwardedRef.current;
      if (typeof forwarded === "function") {
        forwarded(node);
      } else if (forwarded) {
        forwarded.current = node;
      }
    },
    [attachPlayerVideo],
  );

  /**
   * Les deux gestes sur l'image. Ils sont posés sur le `<video>` et non sur le
   * conteneur : sur le conteneur, un clic dans la barre déclencherait la
   * lecture.
   *
   * Réservés à la souris. Au doigt, un appui bascule déjà la barre — la seule
   * façon de la faire disparaître sans survol — et lui faire aussi mettre la
   * vidéo en pause donnerait deux effets pour un geste.
   */
  const pointerTypeRef = useRef("mouse");
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    pointerTypeRef.current = event.pointerType;
  }, []);

  const handleClick = useCallback(() => {
    if (pointerTypeRef.current !== "mouse") return;
    // Le deuxième clic d'un double-clic ne réarme rien : le minuteur en cours
    // sera annulé par le `dblclick` qui suit.
    if (clickTimerRef.current !== null) return;
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      togglePlay();
    }, DOUBLE_CLICK_WINDOW);
  }, [togglePlay]);

  const handleDoubleClick = useCallback(() => {
    if (pointerTypeRef.current !== "mouse") return;
    if (clickTimerRef.current !== null) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    toggleFullscreen();
  }, [toggleFullscreen]);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current !== null) clearTimeout(clickTimerRef.current);
    };
  }, []);

  // `""` plutôt que `"true"` : seule la présence de l'attribut compte pour les
  // variantes Tailwind, et `undefined` le retire vraiment du DOM.
  const fullscreenAttribute = isFullscreen ? "" : undefined;
  const hiddenAttribute = visible ? undefined : "";

  return (
    <PlayerProvider value={player}>
      <div
        ref={containerRef}
        // Repère de la hauteur mesurée par les menus : ils bornent leur popup à
        // la place qui reste dans ce conteneur.
        data-slot="video-player"
        data-fullscreen={fullscreenAttribute}
        // Le curseur se masque avec la barre, et pour la même raison : plus
        // rien ne doit flotter au-dessus de l'image.
        data-hidden={hiddenAttribute}
        // Focalisable au clic, pas à la tabulation : un clic sur l'image donne
        // le focus au lecteur, et ses raccourcis répondent. Sans raccourcis, le
        // focus ne servirait à rien.
        tabIndex={handleKeyDown ? -1 : undefined}
        onKeyDown={handleKeyDown}
        className={cn(
          // Le cadre du lecteur est noir, pas thématique : en plein écran,
          // une vidéo moins haute que l'écran laisse voir ses bandes, et du
          // blanc y serait aveuglant. Un token, jamais une couleur en dur.
          "bg-player-backdrop relative isolate overflow-hidden rounded-lg border",
          // Chrome passe le conteneur cliqué en `:focus-visible` à la première
          // touche frappée, et l'entourerait d'un contour. Il n'est pas dans
          // l'ordre de tabulation : ce contour ne guiderait personne.
          "outline-none",
          // En plein écran, le conteneur occupe l'écran entier : sans ça la
          // vidéo reste collée en haut d'un cadre arrondi et bordé.
          "data-fullscreen:flex data-fullscreen:h-full data-fullscreen:items-center data-fullscreen:justify-center data-fullscreen:rounded-none data-fullscreen:border-0",
          "data-hidden:cursor-none",
          className,
        )}
      >
        {youtube ? (
          youtubeDefined && (
            <>
              {/* uix: YouTube's frame would take every click; it lets them through to a layer that carries the same
                  gestures as the <video> */}
              <youtube-video
                ref={attachVideo as unknown as Ref<HTMLElement>}
                title={title}
                data-fullscreen={fullscreenAttribute}
                className="pointer-events-none block aspect-video h-auto w-full data-fullscreen:h-full"
              />
              <div
                aria-hidden
                onPointerDown={handlePointerDown}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                className="absolute inset-0"
              />
            </>
          )
        ) : (
          <video
            ref={attachVideo}
            // `src` n'est volontairement pas posé ici : c'est le moteur qui
            // charge la source, et deux écritures concurrentes sur la même
            // propriété rechargeraient la vidéo à chaque rendu.
            poster={poster}
            title={title}
            autoPlay={autoPlay}
            loop={loop}
            // Sans `playsInline`, l'iPhone bascule en plein écran natif dès la
            // lecture et toute notre interface disparaît.
            playsInline
            // Assez pour connaître la durée, que le scrubber exige, sans tirer la
            // vidéo entière à ceux qui ne la liront pas.
            preload="metadata"
            data-fullscreen={fullscreenAttribute}
            // Ni `role` ni `tabIndex` : l'équivalent clavier de ces gestes passe
            // par les boutons de la barre, qui sont déjà dans l'ordre de
            // tabulation, et par les raccourcis. Un second point focalisable ne
            // ferait qu'allonger le parcours sans rien apporter.
            onPointerDown={handlePointerDown}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            className="block h-auto w-full data-fullscreen:h-full data-fullscreen:object-contain"
          />
        )}
        {/* Autour des contrôles et non du lecteur entier : les chapitres ne
            servent qu'à la barre, et ce fournisseur s'abonne à la durée. */}
        <ChaptersProvider chapters={chapters}>
          <ControlsProvider options={controlsOptions} visible={visible} holdVisible={holdVisible}>
            <PlayerControls />
          </ControlsProvider>
        </ChaptersProvider>
      </div>
    </PlayerProvider>
  );
}
