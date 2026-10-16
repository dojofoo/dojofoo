import { createContext, useContext } from "react";

// Lets a demo know whether it's showing in an index card, and whether that
// card is hovered or focused. Demos use it to act themselves out on hover:
// a star button stars itself, a checkbox scribbles, and so on.
//
// null: not in a preview (the component's own page, or real use).
// false: in a preview, at rest.
// true: in a preview, being hovered or focused: play the show.
export const PreviewPlayContext = createContext<boolean | null>(null);

export function usePreviewPlay() {
  return useContext(PreviewPlayContext);
}
