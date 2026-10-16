import { memo, type ReactElement } from "react";

import { Button } from "./player-button";
import { cn } from "~/lib/utils";

import { useControlsOptions } from "./controls-context";
import { usePlayerActions, usePlayerValue, usePlayheadValue } from "./player-context";
import { selectIsLive } from "./player-state-store";
import type { PlayheadSnapshot } from "./playhead-store";

/**
 * La pastille « Live » : elle dit si l'on regarde le bord du direct, et permet
 * d'y revenir quand on l'a quitté. Aucune prop, comme les autres contrôles.
 *
 * Elle n'existe que sur un flux en direct : en vidéo à la demande, le bord n'a
 * aucun sens et la place revient aux contrôles qui en ont un.
 */

/**
 * Un booléen, décidé par la tête de lecture : elle seule connaît le retard de
 * croisière du flux, et elle ne réveille la pastille qu'aux bascules — un
 * sélecteur qui renverrait des secondes la rendrait soixante fois par seconde.
 */
function selectAtLiveEdge(snapshot: PlayheadSnapshot): boolean {
  return snapshot.atLiveEdge;
}

export const LiveBadge = memo(function LiveBadge(): ReactElement | null {
  const { live } = useControlsOptions();
  const isLive = usePlayerValue(selectIsLive);
  const atEdge = usePlayheadValue(selectAtLiveEdge);
  const { goToLive } = usePlayerActions();

  if (!live.enabled || !isLive) return null;

  return (
    <Button
      variant="ghost"
      // Pas de `size="icon"` : il y a un libellé, et c'est lui qui donne son
      // nom au bouton.
      onClick={atEdge ? undefined : goToLive}
      // `disabled` et non un bouton qui ne ferait rien : au bord du direct, il
      // n'y a nulle part où aller, et c'est l'état désactivé qui le dit à un
      // lecteur d'écran — « Live, dimmed » — sans qu'on ait à l'écrire.
      disabled={atEdge}
      // Le nom dit ce que le bouton fait quand il est actif, et reprend le
      // libellé visible pour que le contrôle vocal puisse le viser. Au bord, le
      // libellé suffit : l'état est porté par `disabled`.
      aria-label={atEdge ? undefined : "Go to live"}
      // L'opacité de `disabled` est neutralisée : ici l'état désactivé est
      // l'état *allumé*, celui qu'on doit voir le mieux. Sans ça, la pastille
      // du bord serait plus pâle que celle du retard, exactement à l'envers de
      // ce qu'elle raconte.
      className={cn(atEdge ? "disabled:opacity-100" : "text-muted-foreground")}
    >
      {/* Un point et non une icône : deux états de couleur, rien d'autre à
          dessiner. `aria-hidden` parce qu'il ne dit rien de plus que le
          libellé qui le suit. */}
      <span
        aria-hidden="true"
        className={cn(
          // Le rayon de l'hôte : sur huit pixels il est écrêté et donne le
          // même point rond, mais un thème anguleux obtient un carré.
          "size-2 shrink-0 rounded-full [corner-shape:round]",
          atEdge ? "bg-destructive" : "bg-muted-foreground",
        )}
      />
      Live
    </Button>
  );
});
