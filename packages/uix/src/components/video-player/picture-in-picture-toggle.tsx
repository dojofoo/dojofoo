import { memo } from "react";
import { PictureInPicture2Icon, PictureInPictureIcon } from "./player-icons";

import { Button } from "./player-button";

import { useControlsOptions } from "./controls-context";
import { usePlayerActions, usePlayerValue } from "./player-context";

/**
 * Firefox n'implémente pas l'API standard et l'iPhone n'a pas de
 * Picture-in-Picture du tout : `canPictureInPicture` est faux plus souvent
 * qu'ailleurs. Le bouton reste là, grisé, comme les autres.
 */
export const PictureInPictureToggle = memo(function PictureInPictureToggle() {
  const { pictureInPicture } = useControlsOptions();
  const canPictureInPicture = usePlayerValue((state) => state.canPictureInPicture);
  const isPictureInPicture = usePlayerValue((state) => state.isPictureInPicture);
  const { togglePictureInPicture } = usePlayerActions();

  if (!pictureInPicture.enabled) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={!canPictureInPicture}
      onClick={togglePictureInPicture}
      aria-label={
        isPictureInPicture ? "Exit picture-in-picture" : "Enter picture-in-picture"
      }
    >
      {isPictureInPicture ? <PictureInPictureIcon /> : <PictureInPicture2Icon />}
    </Button>
  );
});
