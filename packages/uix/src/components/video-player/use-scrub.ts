import { useCallback, useEffect, useRef } from "react";

import { usePlayerActions, usePlayerStore, usePlayheadStore } from "./player-context";
import type { SliderChangeReason } from "./player-slider";

/**
 * Le protocole glissement → vidéo, sur le modèle de YouTube : la lecture se met
 * en pause au premier vrai déplacement, la vidéo cherche en continu à mesure
 * que le doigt bouge, et la lecture reprend au relâchement si elle tournait.
 *
 * Le curseur ne sait rien de la vidéo : il dit seulement *pourquoi* sa valeur
 * change. C'est ici qu'on en déduit l'effet, pour que le volume puisse se
 * brancher sur le même curseur sans hériter de ce protocole.
 */

/**
 * Une recherche au plus toutes les 150 ms pendant un glissement. Chaque
 * écriture de `currentTime` interrompt le décodage en cours et, sur un fichier
 * progressif, relance une requête de plage : à la cadence d'un `pointermove`,
 * aucune recherche n'aboutirait et l'image resterait figée tout le geste. À ce
 * rythme, chaque recherche a le temps de peindre une image.
 */
const SEEK_INTERVAL = 150;

/**
 * L'état d'un geste. Il vit dans une ref et non dans un état : il change à
 * chaque `move`, et rien ne doit se re-rendre pour autant.
 */
interface ScrubGesture {
  /** La lecture tournait au moment du `start`. */
  wasPlaying: boolean;
  /** C'est nous qui avons mis en pause, donc c'est à nous de relancer. */
  pausedByUs: boolean;
  /** Au moins un `move` depuis le `start` — un simple clic n'en a aucun. */
  moved: boolean;
  /** La dernière valeur envoyée à la vidéo, `NaN` tant qu'il n'y en a pas. */
  lastSeek: number;
  /** Quand elle a été envoyée, pour le limiteur. */
  lastSeekAt: number;
  /** La dernière valeur reçue : c'est elle que la recherche de queue enverra. */
  latest: number;
  timer: ReturnType<typeof setTimeout> | null;
}

function idleGesture(): ScrubGesture {
  return {
    wasPlaying: false,
    pausedByUs: false,
    moved: false,
    lastSeek: Number.NaN,
    lastSeekAt: Number.NEGATIVE_INFINITY,
    latest: Number.NaN,
    timer: null,
  };
}

function resetGesture(gesture: ScrubGesture): void {
  if (gesture.timer !== null) clearTimeout(gesture.timer);
  // L'objet est muté et non remplacé : le nettoyage du démontage en garde une
  // référence, et doit pouvoir y trouver le minuteur en cours.
  Object.assign(gesture, idleGesture());
}

/**
 * Renvoie un gestionnaire de référence stable, à passer tel quel au
 * `onValueChange` du curseur. Il lit l'état et la tête de lecture **dans
 * l'événement**, sans s'y abonner : le scrubber ne doit pas se re-rendre parce
 * que la vidéo a avancé.
 */
export function useScrub(): (value: number, reason: SliderChangeReason) => void {
  const store = usePlayerStore();
  const playhead = usePlayheadStore();
  const { seek, play, pause } = usePlayerActions();

  const gestureRef = useRef<ScrubGesture>(idleGesture());

  useEffect(() => {
    const gesture = gestureRef.current;
    return () => {
      if (gesture.timer !== null) clearTimeout(gesture.timer);
      gesture.timer = null;
    };
  }, []);

  return useCallback(
    (value: number, reason: SliderChangeReason) => {
      const gesture = gestureRef.current;

      const seekNow = (time: number) => {
        seek(time);
        gesture.lastSeek = time;
        gesture.lastSeekAt = performance.now();
      };

      const flush = () => {
        gesture.timer = null;
        if (gesture.latest !== gesture.lastSeek) seekNow(gesture.latest);
      };

      /**
       * Limiteur en tête et en queue. En tête, pour que la vidéo réagisse dès
       * le premier mouvement après une pause du doigt ; en queue, avec la
       * dernière valeur reçue, pour que l'image rattrape le doigt quand il
       * s'immobilise sans lâcher. La recherche du `start` compte dans la
       * fenêtre : un clic suivi d'un déplacement n'en fait pas deux d'affilée.
       */
      const throttledSeek = (time: number) => {
        gesture.latest = time;
        if (gesture.timer !== null) return;
        const elapsed = performance.now() - gesture.lastSeekAt;
        if (elapsed >= SEEK_INTERVAL) seekNow(time);
        else gesture.timer = setTimeout(flush, SEEK_INTERVAL - elapsed);
      };

      /** Fin du geste, qu'il soit relâché ou annulé. */
      const finish = (time: number, alwaysSeek: boolean) => {
        const { pausedByUs, lastSeek } = gesture;
        // Annule la recherche de queue en attente : la recherche exacte qui
        // suit la remplace.
        resetGesture(gesture);
        // Un simple clic a déjà cherché cette valeur exacte au `start` : pas de
        // seconde recherche. La recherche passe avant le retrait de l'aperçu —
        // le store relit l'élément au retrait et le trouve déjà à sa place,
        // donc la tête ne revient pas en arrière le temps d'une frame.
        if (alwaysSeek || time !== lastSeek) seek(time);
        playhead.scrub(null);
        // Relâché au bout de la vidéo, `play()` repartirait de zéro : la
        // lecture reste arrêtée, comme si elle s'était terminée d'elle-même.
        // `play()` rejette si le navigateur refuse — onglet en arrière-plan,
        // politique d'autoplay — et ce n'est pas une erreur du lecteur.
        if (pausedByUs && time < store.getSnapshot().duration) play().catch(() => {});
      };

      switch (reason) {
        case "start": {
          resetGesture(gesture);
          gesture.wasPlaying = !store.getSnapshot().paused;
          playhead.scrub(value);
          seekNow(value);
          gesture.latest = value;
          return;
        }
        case "move": {
          // La pause attend le premier vrai déplacement : un simple clic cherche
          // sans interrompre la lecture, et le bouton lecture ne clignote pas
          // au geste le plus fréquent.
          if (!gesture.moved) {
            gesture.moved = true;
            if (gesture.wasPlaying) {
              pause();
              gesture.pausedByUs = true;
            }
          }
          playhead.scrub(value);
          throttledSeek(value);
          return;
        }
        case "end": {
          finish(value, false);
          return;
        }
        case "cancel": {
          // La valeur est celle d'avant le geste. On a déjà cherché dès le
          // `start`, donc il faut toujours y retourner, même sans déplacement.
          finish(value, true);
          return;
        }
        case "key": {
          // Un pas de flèche est une recherche ponctuelle : ni aperçu, ni pause.
          seek(value);
          return;
        }
      }
    },
    [pause, play, playhead, seek, store],
  );
}
