import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * Quand la barre se montre, quand elle s'efface. Tout est ici et nulle part
 * ailleurs : un seul endroit décide, et les contrôles ne font que lire.
 *
 * La règle tient en une phrase : **on montre à la moindre activité, on ne
 * masque qu'à la réunion de toutes les conditions**. Montrer est toujours sûr ;
 * masquer ne l'est jamais — une barre qui disparaît sous la souris, sous le
 * focus clavier ou sous un menu ouvert est un bug, pas une animation.
 */

export interface UseControlsVisibilityOptions {
  containerRef: RefObject<HTMLElement | null>;
  /** La vidéo est à l'arrêt : la barre ne doit alors jamais se masquer. */
  paused: boolean;
  visibility: "auto" | "always" | "never";
  autoHideDelay: number;
}

export interface ControlsVisibility {
  visible: boolean;
  /** Pose un verrou, renvoie sa libération. Référence stable. */
  holdVisible: () => () => void;
  /**
   * Signale une activité venue d'ailleurs que du pointeur ou du focus — un
   * raccourci clavier : la barre apparaît et le minuteur repart. Référence
   * stable. Sans effet hors du mode `auto`.
   */
  reveal: () => void;
}

/**
 * Sur un écran tactile, un `pointerdown` bascule la visibilité : sans survol,
 * c'est le seul geste qui permette de faire disparaître la barre. Mais un doigt
 * qui vise un bouton *de* la barre ne demande pas à la faire disparaître — il
 * demande à appuyer dessus. D'où ce test sur la cible du geste.
 */
const CONTROLS_SELECTOR = '[data-slot="video-player-controls"]';

/**
 * Seul le focus **clavier** retient la barre : `:focus-visible`, et non `:focus`.
 * C'est le correctif d'un bug de la phase 1. Sous Chrome, un clic souris sur un
 * bouton lui donne le focus, qu'il garde jusqu'au prochain clic ailleurs ; en
 * comptant tout focus, la barre ne se masquait plus d'ici là. Avec le scrubber,
 * chaque recherche à la souris laisserait le focus sur le curseur, et la barre
 * resterait affichée en permanence. La classe de masquage de la barre suit la
 * même règle (`not-has-focus-visible`) : le CSS et ce hook doivent tomber
 * d'accord.
 */
function isKeyboardFocused(element: Element): boolean {
  return element.matches(":focus-visible");
}

/**
 * L'élément actif est dans le conteneur, et il y est arrivé au clavier.
 *
 * Le conteneur lui-même ne compte pas. Il prend le focus au clic, pour que les
 * raccourcis lui parviennent, et Chrome le passe en `:focus-visible` à la
 * première touche frappée — vérifié. Sans cette exclusion, un seul raccourci
 * empêcherait la barre de se masquer tant que le focus reste là.
 */
function hasKeyboardFocusWithin(container: HTMLElement): boolean {
  const active = document.activeElement;
  return (
    active !== null &&
    active !== container &&
    container.contains(active) &&
    isKeyboardFocused(active)
  );
}

export function useControlsVisibility(options: UseControlsVisibilityOptions): ControlsVisibility {
  const { containerRef, paused, visibility, autoHideDelay } = options;

  const [autoVisible, setAutoVisible] = useState(true);
  /**
   * Un compteur et non un booléen : les phases suivantes ajouteront d'autres
   * menus, et deux verrous posés en même temps ne doivent pas s'écraser l'un
   * l'autre. En état plutôt qu'en ref, parce que c'est le retour à zéro qui
   * doit relancer le minuteur.
   */
  const [holds, setHolds] = useState(0);
  /** Le focus clavier est dans le conteneur — voir `isKeyboardFocused`. */
  const [keyboardFocus, setKeyboardFocus] = useState(false);

  /**
   * Réarme le minuteur de masquage sans passer par l'état. Posé par l'effet du
   * minuteur quand toutes les conditions de masquage sont réunies, `null`
   * sinon.
   *
   * C'est le correctif d'un second bug de la phase 1. Un mouvement de souris
   * appelait `setAutoVisible(true)` ; quand la barre était déjà visible, la
   * valeur ne changeait pas, l'effet ne se relançait pas, et le minuteur
   * n'était **jamais** réarmé : la barre disparaissait trois secondes après être
   * apparue, même sous une souris qui ne s'arrêtait pas, puis revenait au
   * mouvement suivant. Un clignotement toutes les trois secondes. Passer par un
   * compteur d'activité en état l'aurait corrigé au prix d'un rendu du lecteur
   * entier à chaque mouvement, soixante fois par seconde : le minuteur se
   * réarme donc hors de React, et l'état ne change qu'aux vraies transitions.
   */
  const rearmRef = useRef<(() => void) | null>(null);

  /**
   * La souris a quitté le lecteur pendant qu'un verrou tenait la barre : elle
   * disparaîtra dès qu'il tombera, sans attendre le délai.
   *
   * C'est le correctif d'un troisième bug de la phase 1. Sortir par le bas,
   * c'est traverser la barre, et le survol de la barre est un verrou. Le
   * `pointerleave` du conteneur arrive avant que React n'ait libéré ce verrou —
   * il le fait dans un effet, après le rendu —, trouvait donc la barre encore
   * retenue et renonçait ; quand le verrou tombait enfin, c'est le minuteur
   * complet qui repartait. Mesuré : trois secondes pile entre la sortie et le
   * masquage. Le même drapeau couvre un glissement relâché hors du lecteur et
   * un menu refermé une fois la souris partie.
   *
   * Une ref et non un état : il ne décide de rien seul, il ne fait que choisir
   * le délai du prochain minuteur, que la chute du verrou relance déjà.
   */
  const hideOnReleaseRef = useRef(false);

  /**
   * Ajustement pendant le rendu, et non dans un effet : la barre doit être là
   * dans la frame où la lecture s'arrête. Un effet la ferait apparaître une
   * frame plus tard, ce qui se voit exactement au moment où l'utilisateur
   * regarde l'endroit où elle doit apparaître.
   */
  const [wasPaused, setWasPaused] = useState(paused);
  if (wasPaused !== paused) {
    setWasPaused(paused);
    if (paused) setAutoVisible(true);
  }

  const reveal = useCallback(() => {
    hideOnReleaseRef.current = false;
    // Masquée : l'état change, et l'effet du minuteur repart de lui-même.
    // Déjà visible : l'état ne bouge pas, et c'est le réarmement qui compte.
    setAutoVisible(true);
    rearmRef.current?.();
  }, []);

  const holdVisible = useCallback(() => {
    setHolds((count) => count + 1);
    setAutoVisible(true);
    let released = false;
    return () => {
      // Le nettoyage d'un effet peut être rejoué ; le compteur ne doit pas
      // passer sous zéro, sans quoi le verrou suivant ne bloquerait plus rien.
      if (released) return;
      released = true;
      setHolds((count) => count - 1);
    };
  }, []);

  useEffect(() => {
    // `always` et `never` n'installent rien : ni écouteur, ni minuteur.
    if (visibility !== "auto") return;
    const container = containerRef.current;
    if (!container) return;

    const handlePointerMove = (event: PointerEvent) => {
      // Masquer le curseur avec la barre provoque un `pointermove` sans
      // déplacement. Sans ce filtre, réafficher le curseur relancerait le cycle
      // tout seul : la barre clignoterait indéfiniment sur une souris immobile.
      if (event.movementX === 0 && event.movementY === 0) return;
      reveal();
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      const onControls = target instanceof Element && target.closest(CONTROLS_SELECTOR) !== null;
      if (event.pointerType !== "mouse" && !onControls) {
        setAutoVisible((current) => !current);
        return;
      }
      reveal();
    };

    const handlePointerLeave = (event: PointerEvent) => {
      // La souris a quitté le lecteur : il n'y a plus rien à attendre. Un doigt,
      // lui, « quitte » au relâchement — ce n'est pas un départ.
      if (event.pointerType !== "mouse") return;
      if (autoHideDelay <= 0 || paused || keyboardFocus) return;
      if (hasKeyboardFocusWithin(container)) return;
      if (holds > 0) {
        hideOnReleaseRef.current = true;
        return;
      }
      setAutoVisible(false);
    };

    const handleFocusIn = (event: FocusEvent) => {
      // Un focus souris remet l'indicateur à faux au lieu d'être ignoré : si le
      // clavier avait posé le focus sur un bouton et qu'un clic le déplace sur
      // un autre, aucun `focusout` ne sort du conteneur pour le remettre à
      // zéro, et la barre resterait retenue par un focus qui n'est plus visible.
      const target = event.target;
      // Le conteneur est exclu, pour la raison dite sur `hasKeyboardFocusWithin`.
      const keyboard = target instanceof Element && target !== container && isKeyboardFocused(target);
      setKeyboardFocus(keyboard);
      if (keyboard) reveal();
    };

    const handleFocusOut = (event: FocusEvent) => {
      // Un déplacement de focus d'un bouton à l'autre émet `focusout` puis
      // `focusin` : sans ce test, le minuteur repartirait à chaque tabulation.
      const next = event.relatedTarget;
      if (next instanceof Node && container.contains(next)) return;
      setKeyboardFocus(false);
    };

    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerdown", handlePointerDown);
    container.addEventListener("pointerleave", handlePointerLeave);
    container.addEventListener("focusin", handleFocusIn);
    container.addEventListener("focusout", handleFocusOut);

    return () => {
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerdown", handlePointerDown);
      container.removeEventListener("pointerleave", handlePointerLeave);
      container.removeEventListener("focusin", handleFocusIn);
      container.removeEventListener("focusout", handleFocusOut);
    };
  }, [autoHideDelay, containerRef, holds, keyboardFocus, paused, reveal, visibility]);

  useEffect(() => {
    if (visibility !== "auto") return;
    if (!autoVisible) return;
    // `autoHideDelay: 0` dit « ne masque jamais » sans renoncer au reste du
    // comportement automatique.
    if (autoHideDelay <= 0) return;
    // Une vidéo arrêtée ne cache rien derrière sa barre.
    if (paused) return;
    if (holds > 0) return;
    if (keyboardFocus) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      // Lu à chaque armement : le drapeau se lève pendant que la barre est
      // retenue, et c'est la chute du verrou qui relance cet effet.
      const delay = hideOnReleaseRef.current ? 0 : autoHideDelay;
      timer = setTimeout(() => {
        hideOnReleaseRef.current = false;
        // Dernier mot au DOM : un focus posé par le code de l'hôte n'est pas
        // passé par `focusin` ici, et masquer un élément focalisé le rendrait
        // invisible sans le rendre inatteignable — le pire des deux. Focus
        // clavier seulement, là aussi : voir `isKeyboardFocused`.
        const container = containerRef.current;
        if (container && hasKeyboardFocusWithin(container)) return;
        setAutoVisible(false);
      }, delay);
    };
    arm();
    rearmRef.current = arm;

    return () => {
      clearTimeout(timer);
      if (rearmRef.current === arm) rearmRef.current = null;
    };
  }, [autoHideDelay, autoVisible, containerRef, holds, keyboardFocus, paused, visibility]);

  return {
    /**
     * `never` renvoie `true` comme `always`, et ce n'est pas une inattention :
     * il n'y a pas de barre à masquer, et le conteneur masque le curseur avec
     * elle. Renvoyer `false` cacherait le curseur pour de bon.
     */
    visible: visibility === "auto" ? autoVisible : true,
    holdVisible,
    reveal,
  };
}
