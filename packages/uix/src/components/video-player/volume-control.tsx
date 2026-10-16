import { memo, useRef } from "react";
import { Volume1Icon, Volume2Icon, VolumeXIcon } from "./player-icons";

import { Button } from "./player-button";

import { useControlsOptions } from "./controls-context";
import { DEFAULT_VOLUME_STEP } from "./controls-options";
import { usePlayerActions, usePlayerValue } from "./player-context";
import {
  PlayerSlider,
  PlayerSliderRange,
  PlayerSliderTrack,
  type SliderChangeReason,
} from "./player-slider";

/**
 * Le volume : la bascule muet et le curseur partagé, sur une plage de 0 à 1.
 * Aucune prop, comme les autres contrôles. Pas de `position` : le volume ne
 * bouge qu'au geste, sa `value` suffit à le dessiner.
 */

/** Ce qu'`Escape` rétablit : le volume **et** l'état muet d'avant le geste. */
interface VolumeSnapshot {
  volume: number;
  muted: boolean;
}

export const VolumeControl = memo(function VolumeControl() {
  const { volume: volumeOptions, keyboard } = useControlsOptions();
  const volume = usePlayerValue((state) => state.volume);
  const muted = usePlayerValue((state) => state.muted);
  const canControlVolume = usePlayerValue((state) => state.canControlVolume);
  const { setVolume, setMuted, stepVolume, toggleMuted } = usePlayerActions();
  const beforeGestureRef = useRef<VolumeSnapshot | null>(null);

  if (!volumeOptions.enabled) return null;

  const effectiveVolume = muted ? 0 : volume;
  const VolumeIcon =
    effectiveVolume === 0
      ? VolumeXIcon
      : effectiveVolume < 0.5
        ? Volume1Icon
        : Volume2Icon;

  const handleValueChange = (next: number, reason: SliderChangeReason) => {
    if (reason === "start") {
      beforeGestureRef.current = { volume, muted };
    }
    if (reason === "cancel" && beforeGestureRef.current) {
      // La valeur d'avant l'appui que renvoie le curseur ne suffit pas : depuis
      // l'état muet elle vaut 0, et le geste a pu rétablir le son en chemin.
      const before = beforeGestureRef.current;
      beforeGestureRef.current = null;
      setVolume(before.volume);
      setMuted(before.muted);
      return;
    }
    if (reason === "key") {
      // Une touche passe par la même action que la keymap du lecteur : depuis
      // le muet, `↑` rend le volume d'avant la coupure au lieu de repartir des
      // 0 % affichés. Le pas se lit dans l'écart à la valeur affichée.
      stepVolume(next - effectiveVolume);
      return;
    }
    setVolume(next);
    // Bouger le curseur depuis l'état muet rétablit le son.
    if (muted && next > 0) {
      setMuted(false);
    }
  };

  return (
    // `peer/volume` : l'horodatage, qui suit ce contrôle dans la même rangée,
    // s'efface dans une barre étroite pendant que le volet est déplié (voir
    // `time-display.tsx`). Il recopie les trois conditions du volet ci-dessous
    // — survol, focus clavier, glissement — et suppose de rester son voisin
    // immédiat : réordonner la barre casserait le masquage sans erreur.
    <div className="group/volume peer/volume flex min-w-0 items-center">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleMuted}
        aria-label={muted ? "Unmute" : "Mute"}
        aria-keyshortcuts={keyboard.enabled ? "m" : undefined}
      >
        <VolumeIcon />
      </Button>
      {/*
        Le volet qui replie le curseur. Seule sa largeur s'anime, en CSS : il
        s'ouvre quand le pointeur est sur le groupe, quand le focus clavier y
        est, et tant qu'un glissement est en cours — le pointeur peut alors
        sortir de la zone sans que le curseur ne se referme sous le doigt.

        Le curseur reste dans le DOM, replié : il garde sa place dans la
        tabulation, et le focus l'ouvre. Sans survol possible (`hover: none`),
        il n'est jamais affiché : toucher l'icône bascule le muet, et un curseur
        de 96 px ne se manie pas au doigt dans une barre qui en compte déjà dix.

        `overflow-hidden` a une largeur minimale nulle en flex, et le `min-w-0`
        de la racine lui laisse la même latitude : dans une barre étroite, le
        volet se comprime au lieu de la faire déborder.
      */}
      <div className="w-0 overflow-hidden transition-[width] duration-200 group-hover/volume:w-24 group-has-focus-visible/volume:w-24 group-has-data-dragging/volume:w-24 motion-reduce:transition-none [@media(hover:none)]:hidden">
        {/*
          Le curseur prend toute la largeur de son parent : c'est cette
          enveloppe qui lui donne la sienne, plutôt qu'une classe posée sur le
          composant. La marge laisse la place au thumb, centré sur la position,
          qui déborde de la moitié de sa taille — et de son anneau de focus — à
          0 % et à 100 % : l'`overflow-hidden` du volet les couperait.
        */}
        <div className="mx-2.5">
          <PlayerSlider
            aria-label="Volume"
            min={0}
            max={1}
            value={effectiveVolume}
            step={DEFAULT_VOLUME_STEP}
            pageStep={0.2}
            getValueText={(value) => (muted ? "Muted" : `${Math.round(value * 100)}%`)}
            // Sur iPhone, Safari ignore les écritures sur `video.volume` : le
            // curseur mentirait. Le bouton muet, lui, fonctionne — il reste actif.
            disabled={!canControlVolume}
            onValueChange={handleValueChange}
          >
            <PlayerSliderTrack>
              <PlayerSliderRange />
            </PlayerSliderTrack>
          </PlayerSlider>
        </div>
      </div>
    </div>
  );
});
