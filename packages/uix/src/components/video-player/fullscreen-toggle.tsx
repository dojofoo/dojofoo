import { memo } from "react";
import { MaximizeIcon, MinimizeIcon } from "./player-icons";

import { Button } from "./player-button";

import { useControlsOptions } from "./controls-context";
import { usePlayerActions, usePlayerValue } from "./player-context";

/**
 * Indisponible, le bouton passe `disabled` — il n'est jamais démonté. C'est la
 * règle du sélecteur de qualité grisé, appliquée ici : un contrôle qui
 * disparaît déplace tous les autres et laisse croire à une panne.
 */
export const FullscreenToggle = memo(function FullscreenToggle() {
  const { fullscreen, keyboard } = useControlsOptions();
  const canFullscreen = usePlayerValue((state) => state.canFullscreen);
  const isFullscreen = usePlayerValue((state) => state.isFullscreen);
  const { toggleFullscreen } = usePlayerActions();

  if (!fullscreen.enabled) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={!canFullscreen}
      onClick={toggleFullscreen}
      aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      aria-keyshortcuts={keyboard.enabled ? "f" : undefined}
    >
      {isFullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
    </Button>
  );
});
