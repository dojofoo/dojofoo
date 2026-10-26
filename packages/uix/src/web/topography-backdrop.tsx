import { Topography } from "~/components/topography";

/*
 * The landing's ground: the contour map (ColorCard's topography) under the footer, fading up into the page's color and
 * sharpest at the very bottom – a blurred copy holds the top of the fade, the sharp one the bottom. Its lines take the
 * page's ink: in the dark they're light lines added to the page (the canvas screened, as on a card), in the light the
 * same canvas inverted – dark lines on white – and multiplied, so only the lines darken the page.
 */
export function TopographyBackdrop({ seed = 7 }: { seed?: number }) {
  return (
    <div className="ui-topo" aria-hidden="true">
      <style href="ui-topography-backdrop" precedence="default">{css}</style>
      <div className="ui-topo__layer ui-topo__layer--soft"><Topography color="#ffffff" interactive={false} speed={0.4} density={1.1} seed={seed} /></div>
      <div className="ui-topo__layer ui-topo__layer--sharp"><Topography color="#ffffff" interactive={false} speed={0.4} density={1.1} seed={seed} /></div>
    </div>
  );
}

const css = /* css */ `
/* No z-index: it mustn't form a stacking context, or its layers would blend with nothing instead of the page */
.ui-topo { position: absolute; right: 0; bottom: 0; left: 0; height: 520px; overflow: hidden; pointer-events: none; }
.ui-topo__layer { position: absolute; inset: 0; mix-blend-mode: multiply; filter: invert(1); opacity: 0.35; }
:where(.dark, [data-theme="dark"]) .ui-topo__layer { mix-blend-mode: screen; filter: none; opacity: 0.5; }
/* Soft above, sharp below, both fading out toward the top */
.ui-topo__layer--soft { filter: invert(1) blur(5px); mask-image: linear-gradient(to bottom, transparent 0%, #000 45%, transparent 85%); }
:where(.dark, [data-theme="dark"]) .ui-topo__layer--soft { filter: blur(5px); }
.ui-topo__layer--sharp { mask-image: linear-gradient(to bottom, transparent 35%, #000 100%); }
`;
