import { memo, useEffect, useMemo, useRef } from "react";

import { ChapterSegments } from "./chapter-segments";
import { findChapterIndex } from "./chapters";
import { useChapters } from "./chapters-context";
import { useControlsOptions } from "./controls-context";
import { DEFAULT_SEEK_STEP, LIVE_EDGE_TOLERANCE } from "./controls-options";
import { formatSpokenTime } from "./format-time";
import { usePlayerValue, usePlayheadStore, usePlayheadValue } from "./player-context";
import { PlayerSlider, PlayerSliderRange, type SliderPosition } from "./player-slider";
import { selectIsLive } from "./player-state-store";
import { displayedTime, type PlayheadSnapshot } from "./playhead-store";
import { useScrub } from "./use-scrub";

/**
 * Le scrubber : le curseur partagé, branché sur la tête de lecture et sur
 * `useScrub`, avec l'aperçu du buffer. Aucune prop, comme les autres contrôles.
 *
 * Il ne se re-rend qu'une fois par seconde de média, pour l'ARIA. Tout ce qui
 * bouge plus vite — la position, le buffer — est écrit hors de React, en
 * propriétés CSS, chacune par un seul écrivain : le curseur pour sa fraction,
 * ce composant pour les bornes du buffer.
 *
 * En direct, la plage n'est plus `0 → durée` mais la fenêtre encore diffusée,
 * qui glisse en permanence. Tout ce que le curseur reçoit — bornes, pas de
 * page, aperçu du buffer — est exprimé dans cette plage ; en vidéo à la
 * demande, rien ne change.
 *
 * Les couches qu'il compose ne sont pas rendues directement dans une piste mais
 * confiées à `ChapterSegments`, qui **est** la piste et les réplique dans chaque
 * chapitre. Le partage est net : le scrubber décide de ce qui est dessiné, le
 * découpage décide d'où. Sans chapitres, le découpage rend un segment unique et
 * le résultat est celui d'avant, au pixel près.
 */

const BUFFER_START_PROPERTY = "--player-buffer-start";
const BUFFER_END_PROPERTY = "--player-buffer-end";

/**
 * En dessous de cette fenêtre, le curseur reste inerte en direct.
 *
 * Un direct sans DVR expose quand même quelques segments — une playlist HLS en
 * garde trois, soit une vingtaine de secondes —, mais cette fenêtre n'est pas
 * un historique : c'est la réserve de lecture, elle glisse aussi vite qu'on la
 * parcourt, et toute la largeur de la barre n'y vaudrait qu'une poignée de
 * secondes. Trente secondes séparent les flux qu'on peut réellement remonter
 * de ceux où chercher ne ferait que provoquer un recalage.
 */
const MIN_LIVE_SEEKABLE_WINDOW = 30;

/**
 * Les bornes de la fenêtre cherchable, arrondies **vers l'intérieur** : elles
 * ne changent alors qu'une fois par seconde, et le scrubber garde sa propriété
 * de ne se re-rendre qu'à ce rythme — les passer brutes le re-rendrait soixante
 * fois par seconde. Vers l'intérieur, pour qu'on ne puisse jamais viser un
 * instant que le flux n'a pas.
 */
function selectSeekableStart(snapshot: PlayheadSnapshot): number {
  return Math.ceil(snapshot.seekableStart);
}

function selectSeekableEnd(snapshot: PlayheadSnapshot): number {
  return Math.floor(snapshot.seekableEnd);
}

/** Un instant rapporté à la plage du curseur. Plage vide : zéro, rien de travers. */
function toFraction(time: number, min: number, max: number): number {
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) return 0;
  const fraction = (time - min) / span;
  if (!Number.isFinite(fraction)) return 0;
  return Math.min(Math.max(fraction, 0), 1);
}

export const PlayerScrubber = memo(function PlayerScrubber() {
  const { scrubber } = useControlsOptions();
  // La seconde entière et non le temps exact : un rendu par seconde de média,
  // pas soixante. Elle ne sert qu'à l'annonce ; le dessin passe par `position`.
  const second = usePlayheadValue((snapshot) => Math.floor(displayedTime(snapshot)));
  const duration = usePlayerValue((state) => state.duration);
  const isLive = usePlayerValue(selectIsLive);
  const seekableStart = usePlayheadValue(selectSeekableStart);
  const seekableEnd = usePlayheadValue(selectSeekableEnd);
  // Une lecture de contexte, pas un abonnement : la liste ne change qu'avec la
  // durée, donc le scrubber garde son rendu par seconde de média.
  const chapters = useChapters();
  const playhead = usePlayheadStore();
  const onValueChange = useScrub();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // `displayedTime` et non `currentTime` : pendant un glissement, le store
  // porte la position du doigt, et tout ce qui la lit la suit.
  const position = useMemo<SliderPosition>(
    () => ({
      subscribe: playhead.subscribe,
      getValue: () => displayedTime(playhead.getSnapshot()),
    }),
    [playhead],
  );

  const enabled = scrubber.enabled;
  const finite = Number.isFinite(duration) && duration > 0;

  // En direct, la fenêtre encore diffusée ; sinon la vidéo entière, telle
  // qu'elle a toujours été. `seekable` n'est pas consulté en vidéo à la
  // demande : il s'y confond avec la durée, et une fenêtre qui n'arriverait
  // qu'après les métadonnées ferait sauter les bornes pour rien.
  const min = isLive ? seekableStart : 0;
  const max = isLive ? seekableEnd : duration;
  const span = max - min;

  // Le buffer, par abonnement et jamais par un rendu : la plage chargée grossit
  // au fil des `progress`, et chaque pas re-rendrait le scrubber pour rien.
  // Écrit sur l'enveloppe et non sur la racine du curseur, qui a déjà son
  // écrivain : les variables descendent par cascade, et chaque élément garde au
  // plus un écrivain impératif.
  useEffect(() => {
    if (!enabled) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    // `NaN` au départ : la première comparaison échoue toujours, donc la
    // première écriture a lieu.
    let paintedStart = Number.NaN;
    let paintedEnd = Number.NaN;

    const paintBuffer = () => {
      const { bufferedStart, bufferedEnd } = playhead.getSnapshot();
      const start = toFraction(bufferedStart, min, max);
      // Jamais de largeur négative, même si les deux bornes se croisent le
      // temps d'une mesure.
      const end = Math.max(toFraction(bufferedEnd, min, max), start);
      if (start !== paintedStart) {
        paintedStart = start;
        wrapper.style.setProperty(BUFFER_START_PROPERTY, String(start));
      }
      if (end !== paintedEnd) {
        paintedEnd = end;
        wrapper.style.setProperty(BUFFER_END_PROPERTY, String(end));
      }
    };

    paintBuffer();
    return playhead.subscribe(paintBuffer);
    // Les bornes changent au plus une fois par seconde, y compris en direct :
    // ce réabonnement ne coûte rien, et il garde l'aperçu du buffer dans la
    // même plage que la poignée.
  }, [enabled, max, min, playhead]);

  if (!enabled) return null;

  // En direct, une fenêtre trop courte ne se cherche pas ; ailleurs, c'est la
  // durée qui doit être connue.
  const seekable = isLive ? span >= MIN_LIVE_SEEKABLE_WINDOW : finite;

  // « 42 seconds of 9 minutes 56 seconds, Installation ». En direct, la durée
  // totale n'existe pas : c'est le retard sur le bord qu'on annonce, la seule
  // mesure qui ait un sens sur un flux sans fin. Sans durée ni fenêtre — les
  // métadonnées ne sont pas arrivées —, la position seule : « of 0 seconds »
  // serait faux.
  //
  // Le libellé du chapitre en dernier, après le temps : c'est la seule partie
  // qui ne change pas à chaque seconde, et un lecteur d'écran qui réannonce en
  // continu doit donner d'abord ce qu'on lui demande. Le chapitre de la valeur
  // annoncée, et non celui de la lecture : au clavier comme sous le doigt, ce
  // qu'on entend doit décrire là où on va.
  const getValueText = (value: number) => {
    if (isLive) {
      // Ici c'est la valeur annoncée qu'on qualifie, et non l'état du lecteur :
      // la tolérance suffit, à un segment près du bout de la fenêtre.
      const delay = max - value;
      return delay <= LIVE_EDGE_TOLERANCE ? "Live" : `${formatSpokenTime(delay)} behind live`;
    }
    const time = finite
      ? `${formatSpokenTime(value)} of ${formatSpokenTime(duration)}`
      : formatSpokenTime(value);
    const index = findChapterIndex(chapters, value);
    return index === -1 ? time : `${time}, ${chapters[index].label}`;
  };

  // Un dixième de la plage parcourue — la vidéo entière, ou la fenêtre du
  // direct —, jamais moins qu'une flèche. Fini même quand la durée ne l'est
  // pas : `PageUp` ne doit pas envoyer à l'infini.
  const pageStep =
    Number.isFinite(span) && span > 0 ? Math.max(span * 0.1, DEFAULT_SEEK_STEP) : DEFAULT_SEEK_STEP;

  return (
    <div ref={wrapperRef} data-slot="video-player-scrubber">
      <PlayerSlider
        aria-label="Seek"
        min={min}
        max={max}
        value={second}
        position={position}
        step={DEFAULT_SEEK_STEP}
        pageStep={pageStep}
        getValueText={getValueText}
        disabled={!seekable}
        onValueChange={onValueChange}
      >
        {/*
          Pas de `PlayerSliderTrack` ici, et c'est la seule différence avec le
          curseur de volume : la piste du scrubber est faite de segments, et une
          piste haute de quatre pixels ne pourrait pas en laisser un dépasser au
          survol. `ChapterSegments` la remplace et tient toute la hauteur.
        */}
        <ChapterSegments>
          {/* Avant la partie jouée, pour passer dessous. */}
          <div
            data-slot="video-player-scrubber-buffer"
            className="absolute inset-y-0 left-[calc(var(--player-buffer-start,0)*100%)] w-[calc((var(--player-buffer-end,0)_-_var(--player-buffer-start,0))*100%)] bg-foreground/40"
          />
          <PlayerSliderRange />
        </ChapterSegments>
      </PlayerSlider>
    </div>
  );
});
