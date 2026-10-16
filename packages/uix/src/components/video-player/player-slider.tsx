import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { cn } from "~/lib/utils";

import { useHoldControlsVisible } from "./controls-context";

/**
 * Le curseur partagé par le scrubber et le volume. Un seul composant pour deux
 * plages : c'est ce qui permet au volume d'avoir enfin un nom accessible, et
 * aux chapitres de la phase 5 de se loger dans la piste sans refonte.
 *
 * **La position ne passe pas par React.** Le scrubber bouge soixante fois par
 * seconde ; une prop qui changerait à ce rythme re-rendrait le curseur autant
 * de fois, exactement ce que les stores du lecteur ont éliminé. Elle est donc
 * portée par la propriété CSS `--player-slider-fraction`, de 0 à 1 et **sans
 * unité** — les segments de chapitres en déduiront leur part jouée en CSS pur —,
 * posée sur la racine et héritée par toutes les couches.
 *
 * **Un seul écrivain : `paint()`.** Il *tire* la vérité au lieu de se la faire
 * pousser — le doigt d'abord, puis la position vive, puis `value` —, si bien
 * que l'ordre d'arrivée de ses déclencheurs n'a aucune importance : un `seeked`
 * tardif pendant un glissement ne peut pas écraser le doigt.
 *
 * **Cette clé ne doit jamais apparaître dans un `style` JSX.** React ne diffe
 * que les clés qu'il gère : tant qu'on ne la lui confie pas, il ne l'écrasera
 * jamais. La lui confier, ce serait deux écrivains pour une propriété.
 *
 * Ce que React rend, en revanche, c'est l'ARIA — sur `value`, une valeur
 * grossière (la seconde entière pour le scrubber). Un lecteur d'écran focalisé
 * sur un curseur qui s'annoncerait à 60 Hz deviendrait inutilisable.
 *
 * Aucune classe de positionnement que le CLI shadcn réécrit pour les projets
 * RTL : ni translation horizontale, ni point d'origine de transformation, ni
 * mise à l'échelle horizontale. Le point d'origine « gauche » y devient un
 * point d'origine « début » qui n'existe pas en Tailwind — la classe disparaît
 * sans bruit —, et la translation gagne une variante `rtl:` qui s'applique même
 * sous un îlot `dir="ltr"`. Tout est posé par `left` et `width`, et la racine
 * porte `dir="ltr"` : une timeline ne se met pas en miroir.
 */

/** Pourquoi la valeur change — le consommateur en déduit l'effet sur la vidéo. */
export type SliderChangeReason = "start" | "move" | "end" | "cancel" | "key";

/**
 * Une position vive, dessinée hors de React. Le scrubber y branche la tête de
 * lecture : elle bouge soixante fois par seconde, et la faire passer par une
 * prop re-rendrait le curseur autant de fois.
 */
export interface SliderPosition {
  subscribe(listener: () => void): () => void;
  getValue(): number;
}

export interface PlayerSliderProps {
  "aria-label": string;
  /** 0 par défaut. Différent de zéro pour la fenêtre DVR de la phase 4. */
  min?: number;
  /** Non fini ou inférieur à `min` : le curseur est inerte. */
  max: number;
  /**
   * La valeur annoncée aux technologies d'assistance. Dessinée aussi, quand
   * `position` est absent — c'est le cas du volume.
   */
  value: number;
  /** Si présent, c'est lui qui est dessiné, et `value` n'est plus qu'annoncée. */
  position?: SliderPosition;
  /** Le pas d'une flèche. */
  step: number;
  /** Le pas de `PageUp` / `PageDown`. */
  pageStep: number;
  /** Le texte lu à la place du nombre : « 42 seconds of 9 minutes 56 seconds ». */
  getValueText?: (value: number) => string;
  disabled?: boolean;
  onValueChange: (value: number, reason: SliderChangeReason) => void;
  className?: string;
  /** La ou les pistes, composées par l'appelant. */
  children: ReactNode;
}

const FRACTION_PROPERTY = "--player-slider-fraction";

/**
 * Distance à parcourir avant qu'un appui devienne un glissement. Plus large au
 * doigt, qui tremble à la pose : sans ce seuil, un simple tap mettrait la vidéo
 * en pause le temps d'un geste qui n'en était pas un.
 */
const DRAG_THRESHOLD_MOUSE = 3;
const DRAG_THRESHOLD_TOUCH = 8;

interface Range {
  min: number;
  max: number;
  /** `max` fini et strictement supérieur à `min`. */
  valid: boolean;
}

interface Gesture {
  pointerId: number;
  /** Mémorisé une fois : une seule lecture de layout par geste. */
  rect: DOMRect;
  startX: number;
  threshold: number;
  /** Là où l'on revient sur `cancel` : la valeur d'avant l'appui. */
  startValue: number;
  /** La valeur sous le doigt, que `paint()` dessine en priorité. */
  value: number;
  /** Seuil franchi — une fois pour toutes, revenir en arrière ne le réarme pas. */
  moved: boolean;
  /** Retire l'écoute d'`Escape` posée pour ce geste. */
  release: () => void;
}

/** Ce que `paint()` et les écouteurs hors React lisent : le dernier rendu. */
interface Latest {
  range: Range;
  value: number;
  position: SliderPosition | undefined;
  onValueChange: (value: number, reason: SliderChangeReason) => void;
}

/**
 * Les bornes telles qu'on peut s'en servir. Une durée pas encore connue arrive
 * en `NaN`, un direct en `Infinity` : dans les deux cas on s'effondre sur
 * `min`, pour qu'aucun `NaN` ni `Infinity` n'atteigne un attribut ARIA.
 */
function resolveRange(min: number, max: number): Range {
  const safeMin = Number.isFinite(min) ? min : 0;
  const valid = Number.isFinite(max) && max > safeMin;
  return { min: safeMin, max: valid ? max : safeMin, valid };
}

function clamp(value: number, range: Range): number {
  if (Number.isNaN(value)) return range.min;
  return Math.min(Math.max(value, range.min), range.max);
}

/**
 * Retire le bruit de l'arithmétique flottante, sans aligner sur une grille.
 *
 * `0.8 + 0.05` vaut `0.8500000000000001` : la valeur part telle quelle dans
 * `aria-valuenow` et dans `video.volume`, et vingt `↓` d'affilée finissent à
 * `0.4999999999999996`, annoncé « 50 % » quand l'icône du volume a déjà basculé.
 * On n'arrondit pas au pas pour autant : sur le scrubber, `→` depuis 42,9 s doit
 * mener à 47,9 s et non à 48. Dix décimales effacent le bruit et laissent tout le
 * reste — et restent exactes jusqu'à des centaines d'heures de média.
 */
function trimFloat(value: number): number {
  return Math.round(value * 1e10) / 1e10;
}

function toFraction(value: number, range: Range): number {
  if (!range.valid) return 0;
  const fraction = (value - range.min) / (range.max - range.min);
  if (!Number.isFinite(fraction)) return 0;
  return Math.min(Math.max(fraction, 0), 1);
}

function valueAt(clientX: number, rect: DOMRect, range: Range): number {
  const fraction = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
  return clamp(range.min + fraction * (range.max - range.min), range);
}

export function PlayerSlider({
  "aria-label": ariaLabel,
  min = 0,
  max,
  value,
  position,
  step,
  pageStep,
  getValueText,
  disabled = false,
  onValueChange,
  className,
  children,
}: PlayerSliderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  /** La dernière fraction écrite : on n'écrit pas deux fois la même. */
  const paintedRef = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const range = resolveRange(min, max);
  const inert = disabled || !range.valid;
  const announced = clamp(value, range);

  const latestRef = useRef<Latest>({ range, value, position, onValueChange });

  // Tant qu'on tient un curseur, la barre ne se masque pas sous le doigt.
  useHoldControlsVisible(dragging);

  const paint = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const latest = latestRef.current;
    // Priorité fixe : le doigt, puis la position vive, puis la valeur.
    const shown =
      gestureRef.current?.value ??
      (latest.position ? latest.position.getValue() : latest.value);
    const fraction = toFraction(shown, latest.range);
    if (fraction === paintedRef.current) return;
    paintedRef.current = fraction;
    root.style.setProperty(FRACTION_PROPERTY, String(fraction));
  }, []);

  // Déclencheur n° 2 : après chaque rendu, sans tableau de dépendances. C'est
  // le chemin de `value`, `min` et `max` — donc du volume, et d'une durée qui
  // arrive ou qui change. En layout effect, pour que la position soit juste
  // dans la frame même où le rendu est peint.
  useLayoutEffect(() => {
    latestRef.current = { range, value, position, onValueChange };
    paint();
  });

  // Déclencheur n° 1 : la position vive. Le curseur n'a pas de boucle à lui —
  // c'est la boucle `requestAnimationFrame` du store qui le cadence pendant la
  // lecture, et ses événements hors lecture.
  useEffect(() => {
    if (!position) return;
    return position.subscribe(paint);
  }, [paint, position]);

  const finish = useCallback(
    (reason: "end" | "cancel") => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      // Remis à `null` d'abord : c'est ce qui rend la main à la position vive
      // dans `paint()`, et ce qui neutralise le `lostpointercapture` que la
      // libération ci-dessous va déclencher.
      gestureRef.current = null;
      gesture.release();
      const root = rootRef.current;
      if (root?.hasPointerCapture(gesture.pointerId)) {
        root.releasePointerCapture(gesture.pointerId);
      }
      setDragging(false);
      latestRef.current.onValueChange(
        reason === "cancel" ? gesture.startValue : gesture.value,
        reason,
      );
      // Après l'effet et non avant : la recherche finale a déjà repositionné
      // l'élément, donc la position tirée ici est la nouvelle, sans retour en
      // arrière d'une frame.
      paint();
    },
    [paint],
  );

  // Un démontage en plein geste — l'option retirée, le lecteur démonté — ne
  // doit laisser ni écouteur sur `window` ni aperçu figé dans le store : on
  // l'annule comme un `Escape`.
  useEffect(() => () => finish("cancel"), [finish]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Jamais de `stopPropagation` ni de `preventDefault` ici : les menus
    // ferment sur un `pointerdown` du document, la visibilité de la
    // barre l'écoute sur le conteneur, et c'est le comportement natif qui pose
    // le focus sur la racine.
    if (inert || gestureRef.current) return;
    if (event.button !== 0 || !event.isPrimary) return;

    const root = event.currentTarget;
    root.setPointerCapture(event.pointerId);
    const rect = root.getBoundingClientRect();
    const startValue = clamp(position ? position.getValue() : value, range);
    const pointerValue = valueAt(event.clientX, rect, range);

    // `Escape` en capture sur `window` : le focus peut être n'importe où
    // pendant un glissement, et aucun `stopPropagation` en chemin ne doit
    // empêcher d'annuler.
    const handleEscape = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== "Escape") return;
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      finish("cancel");
    };
    window.addEventListener("keydown", handleEscape, true);

    gestureRef.current = {
      pointerId: event.pointerId,
      rect,
      startX: event.clientX,
      threshold: event.pointerType === "touch" ? DRAG_THRESHOLD_TOUCH : DRAG_THRESHOLD_MOUSE,
      startValue,
      value: pointerValue,
      moved: false,
      release: () => window.removeEventListener("keydown", handleEscape, true),
    };
    setDragging(true);
    paint();
    onValueChange(pointerValue, "start");
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    // Hors geste, rien pour l'instant. C'est ici que les miniatures écriront
    // plus tard leur variable de survol.
    if (!gesture || event.pointerId !== gesture.pointerId) return;

    // Seule la distance horizontale compte : une dérive verticale ne change pas
    // la valeur, et ne doit pas suffire à mettre la vidéo en pause.
    if (!gesture.moved && Math.abs(event.clientX - gesture.startX) < gesture.threshold) return;

    const next = valueAt(event.clientX, gesture.rect, range);
    // Au-delà d'un bord, la valeur reste bornée : inutile de réémettre la même.
    if (gesture.moved && next === gesture.value) return;
    gesture.moved = true;
    gesture.value = next;
    paint();
    onValueChange(next, "move");
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (gestureRef.current?.pointerId !== event.pointerId) return;
    finish("end");
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (gestureRef.current?.pointerId !== event.pointerId) return;
    finish("cancel");
  };

  // La capture perdue sans `pointerup` — un autre élément l'a prise, la
  // fenêtre a perdu la main : le geste s'arrête là où il en était.
  const handleLostPointerCapture = () => finish("end");

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // `Cmd+←`, c'est « Précédent » : les combinaisons appartiennent au
    // navigateur et au système, on les laisse passer.
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (inert) return;

    // La base est la position précise, jamais la seconde arrondie annoncée :
    // `→` depuis 42,9 s doit mener à 47,9 s, pas à 47 s.
    const base = clamp(position ? position.getValue() : value, range);
    let next: number;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        next = base - step;
        break;
      case "ArrowRight":
      case "ArrowUp":
        next = base + step;
        break;
      case "PageDown":
        next = base - pageStep;
        break;
      case "PageUp":
        next = base + pageStep;
        break;
      case "Home":
        next = range.min;
        break;
      case "End":
        next = range.max;
        break;
      default:
        // `Espace` compris : il revient à la keymap du lecteur.
        return;
    }

    // `stopPropagation` en plus du `preventDefault` : la keymap du lecteur
    // donne aussi `←`/`→` et `↑`/`↓` au lecteur entier, et sans ça une flèche
    // sur le scrubber agirait deux fois.
    event.preventDefault();
    event.stopPropagation();
    // Pendant un glissement, la touche est avalée sans effet : la vidéo suit
    // le doigt, et une flèche qui la déplacerait en parallèle se ferait
    // écraser au relâchement.
    if (gestureRef.current || !Number.isFinite(next)) return;
    onValueChange(clamp(trimFloat(next), range), "key");
  };

  return (
    <div
      ref={rootRef}
      // Le rôle est sur la racine et non sur le thumb : toute la hauteur est
      // cliquable, un clic sur la piste y pose le focus, et le thumb reste
      // libre de grandir ou de disparaître.
      role="slider"
      tabIndex={inert ? -1 : 0}
      aria-label={ariaLabel}
      aria-valuemin={range.min}
      aria-valuemax={range.max}
      aria-valuenow={announced}
      aria-valuetext={getValueText?.(announced)}
      aria-disabled={inert || undefined}
      data-slot="player-slider"
      data-dragging={dragging ? "" : undefined}
      dir="ltr"
      // Jamais `overflow-hidden` ici — seule la piste l'est. Le thumb déborde
      // aux extrémités, et la heatmap de la phase 5 se posera au-dessus.
      // `h-6` : 24 px de cible minimum (WCAG 2.5.8), quelle que soit la piste.
      className={cn(
        "group/slider relative flex h-6 w-full cursor-pointer touch-none items-center outline-none select-none aria-disabled:cursor-default",
        className,
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handleLostPointerCapture}
      onKeyDown={handleKeyDown}
    >
      {children}
      {/*
        Un conteneur de largeur nulle posé sur la position, qui centre la
        pastille en flex : un enfant plus large qu'un parent `justify-center`
        déborde à parts égales des deux côtés. Aucun `translate`, donc rien que
        la conversion RTL puisse réécrire.
      */}
      <div
        data-slot="player-slider-thumb"
        className="pointer-events-none absolute inset-y-0 left-[calc(var(--player-slider-fraction,0)*100%)] flex w-0 items-center justify-center"
      >
        {/*
          Aucune transition sur la position — le thumb traînerait derrière le
          doigt —, seulement sur la taille. Visible au survol (Tailwind limite
          `hover` aux écrans qui survolent vraiment), au focus clavier, pendant
          un geste, et en permanence sur écran tactile, où rien ne survole.
        */}
        <div
          // `rounded-lg` et non `rounded-full` : à quatorze pixels, le rayon
          // de l'hôte est écrêté à la moitié et donne le même rond. Un thème
          // anguleux, lui, obtient une poignée carrée — comme la sienne.
          className="size-0 shrink-0 rounded-full [corner-shape:round] bg-primary ring-ring/50 transition-[width,height] duration-150 motion-reduce:transition-none group-hover/slider:size-3.5 group-focus-visible/slider:size-3.5 group-focus-visible/slider:ring-3 group-data-dragging/slider:size-3.5 pointer-coarse:size-3.5"
        />
      </div>
    </div>
  );
}

export interface PlayerSliderLayerProps {
  className?: string;
  children?: ReactNode;
}

/**
 * Le rail : la piste de fond, qui découpe ses couches aux coins arrondis. Elle
 * s'épaissit au survol et pendant un geste, depuis son centre — la racine la
 * centre verticalement.
 */
export function PlayerSliderTrack({ className, children }: PlayerSliderLayerProps) {
  return (
    <div
      data-slot="player-slider-track"
      className={cn(
        // Le rayon de l'hôte, écrêté par la hauteur de la piste : identique à
        // une pilule partout, sauf sur un thème à angles vifs.
        "relative h-1 w-full overflow-hidden rounded-full [corner-shape:round] bg-foreground/20 transition-[height] duration-150 motion-reduce:transition-none group-hover/slider:h-1.5 group-data-dragging/slider:h-1.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** La partie jouée, de 0 jusqu'à la position courante. */
export function PlayerSliderRange({ className, children }: PlayerSliderLayerProps) {
  return (
    <div
      data-slot="player-slider-range"
      className={cn(
        "absolute inset-y-0 left-0 w-[calc(var(--player-slider-fraction,0)*100%)] bg-primary",
        className,
      )}
    >
      {children}
    </div>
  );
}
