import { useCallback, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { DEFAULT_SEEK_STEP, DEFAULT_VOLUME_STEP } from "./controls-options";
import type { PlayerState, PlayerStateStore } from "./player-state-store";
import type { PlayerActions } from "./use-player";

/**
 * La keymap du lecteur, active tant que le focus est dans le lecteur, et
 * nulle part ailleurs : une page qui porte deux lecteurs ne les pilote pas
 * ensemble, et les champs de la page hôte ne sont jamais concernés.
 *
 * **Un gestionnaire React, jamais un écouteur natif.** React délègue ses
 * événements à sa racine. Un écouteur natif posé sur le conteneur recevrait la
 * touche avant que le curseur ou le menu ne l'aient traitée et arrêtée, et une
 * flèche sur le scrubber agirait deux fois. Un `onKeyDown`, lui, est arrêté
 * par leur `stopPropagation()`. `defaultPrevented` est le filet pour ce qui
 * empêcherait l'action par défaut sans arrêter la propagation.
 *
 * Le conteneur prend le focus au clic (`tabIndex={-1}`) : sans ça, un clic sur
 * l'image ne focaliserait rien, et aucune touche n'arriverait jusqu'ici.
 */

interface Shortcut {
  /**
   * Une bascule ne se répète pas quand on laisse la touche enfoncée : la
   * lecture ou le plein écran clignoteraient à la cadence du clavier.
   */
  toggle: boolean;
  run(actions: PlayerActions, state: PlayerState): void;
}

const TOGGLE_PLAY: Shortcut = {
  toggle: true,
  run: (actions) => actions.togglePlay(),
};

const TOGGLE_MUTED: Shortcut = {
  toggle: true,
  run: (actions) => actions.toggleMuted(),
};

const TOGGLE_FULLSCREEN: Shortcut = {
  toggle: true,
  run: (actions, state) => {
    if (state.canFullscreen) actions.toggleFullscreen();
  },
};

function seekBy(seconds: number): Shortcut {
  return {
    toggle: false,
    run: (actions, state) => {
      // Rien à parcourir tant que la durée est inconnue. `Infinity` passe :
      // en direct, reculer dans la fenêtre DVR a un sens.
      if (state.duration > 0) actions.seekBy(seconds);
    },
  };
}

function stepVolume(delta: number): Shortcut {
  return { toggle: false, run: (actions) => actions.stepVolume(delta) };
}

function seekToFraction(fraction: number): Shortcut {
  return {
    toggle: false,
    run: (actions, state) => {
      // Une fraction d'une durée inconnue ou infinie ne désigne aucun instant.
      if (Number.isFinite(state.duration) && state.duration > 0) {
        actions.seek(state.duration * fraction);
      }
    },
  };
}

/**
 * Le chiffre d'abord par sa valeur : c'est elle qui est gravée sur la touche,
 * sur le pavé numérique comme sur la rangée du haut d'un clavier QWERTY. À
 * défaut, par la position sur la rangée du haut : en AZERTY, la touche `1`
 * donne `&` sans Maj, et `key` ne vaudrait jamais `1`.
 */
function digitOf(event: ReactKeyboardEvent): number | null {
  if (/^[0-9]$/.test(event.key)) return Number(event.key);
  const match = /^Digit([0-9])$/.exec(event.code);
  return match ? Number(match[1]) : null;
}

/**
 * Les flèches par leur nom. Pas de miroir en RTL : le scrubber ne se retourne
 * pas (`dir="ltr"`), donc `←` recule partout. Les lettres par leur valeur et
 * non par leur position : `m` est là où la disposition l'a mis, et Verr. Maj
 * ne doit rien changer.
 */
function resolveShortcut(event: ReactKeyboardEvent): Shortcut | null {
  switch (event.key) {
    case " ":
      return TOGGLE_PLAY;
    case "ArrowLeft":
      return seekBy(-DEFAULT_SEEK_STEP);
    case "ArrowRight":
      return seekBy(DEFAULT_SEEK_STEP);
    case "ArrowUp":
      return stepVolume(DEFAULT_VOLUME_STEP);
    case "ArrowDown":
      return stepVolume(-DEFAULT_VOLUME_STEP);
    default:
      break;
  }
  switch (event.key.toLowerCase()) {
    case "k":
      return TOGGLE_PLAY;
    case "m":
      return TOGGLE_MUTED;
    case "f":
      return TOGGLE_FULLSCREEN;
    default:
      break;
  }
  const digit = digitOf(event);
  return digit === null ? null : seekToFraction(digit / 10);
}

/**
 * Un champ où l'on tape. Aucun n'existe dans le lecteur aujourd'hui, et ceux
 * de la page hôte n'envoient jamais leurs touches jusqu'au conteneur ; le
 * filtre est là pour le jour où le lecteur en aura un.
 */
function isEditable(target: EventTarget): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches("input, textarea, select");
}

/** `Espace` y déclenche le bouton lui-même, et c'est lui qui doit gagner. */
function isButton(target: EventTarget): boolean {
  return target instanceof Element && target.matches('button, [role="button"]');
}

export interface UseKeyboardShortcutsOptions {
  enabled: boolean;
  /** Lu à la frappe et jamais par abonnement : la keymap ne provoque aucun rendu. */
  store: PlayerStateStore;
  actions: PlayerActions;
  /** Un raccourci est une activité : la barre apparaît, et on voit son effet. */
  reveal: () => void;
}

/** Le gestionnaire à poser sur le conteneur, ou `undefined` si la keymap est coupée. */
export function useKeyboardShortcuts(
  options: UseKeyboardShortcutsOptions,
): ((event: ReactKeyboardEvent<HTMLElement>) => void) | undefined {
  const { enabled, store, actions, reveal } = options;

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.defaultPrevented) return;
      // Les combinaisons appartiennent au navigateur et au système : `Cmd+0`
      // remet le zoom à 100 %, `Cmd+F` cherche dans la page. `Shift` passe :
      // c'est lui qui donne les chiffres en AZERTY.
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      // Une composition en cours (IME) : la touche forme un caractère, elle ne
      // commande rien.
      if (event.nativeEvent.isComposing) return;
      if (isEditable(event.target)) return;
      if (event.key === " " && isButton(event.target)) return;

      const shortcut = resolveShortcut(event);
      if (!shortcut) return;

      // Le lecteur a le focus et la touche est à lui : ni défilement de la
      // page, ni composant parent qui réagirait aussi à `←`.
      event.preventDefault();
      event.stopPropagation();
      // La répétition est avalée — sans quoi `Espace` enfoncé ferait défiler
      // la page —, mais une bascule n'agit qu'une fois.
      if (event.repeat && shortcut.toggle) return;

      shortcut.run(actions, store.getSnapshot());
      reveal();
    },
    [actions, reveal, store],
  );

  return enabled ? handleKeyDown : undefined;
}
