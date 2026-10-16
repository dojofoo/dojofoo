import { memo } from "react";
import { PauseIcon, PlayIcon } from "./player-icons";

import { Button } from "./player-button";

import { useControlsOptions } from "./controls-context";
import { usePlayerActions, usePlayerValue } from "./player-context";

/**
 * Un seul bouton, dont le libellé change — et pas d'`aria-pressed`. « Pause »
 * décrit ce que le bouton va faire ; un état pressé décrirait ce qu'il est, et
 * les deux ensemble se contredisent à l'oreille : « Pause, activé ».
 */
export const PlayToggle = memo(function PlayToggle() {
  const { play, keyboard } = useControlsOptions();
  const paused = usePlayerValue((state) => state.paused);
  const { togglePlay } = usePlayerActions();

  if (!play.enabled) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={togglePlay}
      aria-label={paused ? "Play" : "Pause"}
      aria-keyshortcuts={keyboard.enabled ? "k" : undefined}
    >
      {paused ? <PlayIcon /> : <PauseIcon />}
    </Button>
  );
});
