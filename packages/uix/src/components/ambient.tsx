import { useEffect, useId, useRef, type CSSProperties, type RefObject } from "react";

/*
 * Ambient – the colors of what's on stage, glowing around it, the way YouTube's ambient mode does.
 *
 * It is a layer of light over the interface, with a hole where the stage is: the video stays on top, the light lies
 * between it and everything else. The light is an SVG filter, which runs inside the browser and so works on any video,
 * CORS or not: the frame copied small into a canvas (drawing someone else's pixels only taints it, showing it is
 * allowed), then blur, saturation and strength, then grain of a fixed ±2 steps added only where the light is – the
 * faint falloff included – to dither the bands. The grain moves as the filter's noise seed changes.
 * On a light theme the light is a tint, not a veil: its colors move halfway to white (and saturate more), and the glow
 * layer multiplies them onto the page – a dark frame then can't grey the page, and text under the light stays crisp.
 * There the grain is a jitter of the light's opacity in its own colour instead, zero on average: white specks vanish
 * under multiply, and the dark grain's small lift of the alpha would draw a grey rim where the light ends.
 * Place it over the stage's box; it reaches `room` past it.
 */
export function Ambient({ video, image, strength = 0.36, grain = true, className }: {
  /** A video element to follow frame by frame */
  video?: RefObject<HTMLVideoElement | null>;
  /** A still to glow from instead */
  image?: string;
  /** Opacity of the light next to the stage, 0–1 */
  strength?: number;
  /** A visible film grain where the light is (the dithering is always on) */
  grain?: boolean;
  className?: string;
}) {
  return (
    <div className={["ui-ambient", className].filter(Boolean).join(" ")} aria-hidden="true">
      <style href="ui-ambient" precedence="default">{css}</style>
      <FilteredLight video={video} image={image} strength={strength} grain={grain} />
    </div>
  );
}

const ROOM = 160; // px the light reaches past the stage – the same as --ui-ambient-room

const GRAIN = 4 / 255; // the SVG grain: ±2 steps of 8 bits
const JITTER = 24 / 255; // on a light page, the opacity jitter: ±12 steps – measured to dither the faint falloff as well as the grain does on dark

function FilteredLight({ video, image, strength, grain }: { video?: RefObject<HTMLVideoElement | null>; image?: string; strength: number; grain: boolean }) {
  const canvases = useRef<[HTMLCanvasElement | null, HTMLCanvasElement | null]>([null, null]);
  const defs = useRef<SVGSVGElement>(null);
  const filterId = "ui-ambient-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");

  useEffect(() => {
    const source = video?.current;
    if (!source || image) return;
    let front = 0;
    // The frame goes into a tiny canvas – drawing someone else's pixels only taints it, showing it is allowed
    const paint = () => {
      if (source.readyState < 2) return;
      const next = canvases.current[1 - front];
      const current = canvases.current[front];
      const context = next?.getContext("2d");
      if (!next || !current || !context) return;
      try {
        context.drawImage(source, 0, 0, next.width, next.height);
      } catch {
        return;
      }
      next.dataset.shown = "";
      delete current.dataset.shown;
      front = 1 - front;
    };
    paint();
    const timer = window.setInterval(() => !source.paused && paint(), 400);
    source.addEventListener("loadeddata", paint);
    source.addEventListener("seeked", paint);
    return () => {
      window.clearInterval(timer);
      source.removeEventListener("loadeddata", paint);
      source.removeEventListener("seeked", paint);
    };
  }, [video, image]);

  // The SVG grain moves by reseeding its noise, about 12 times a second (each reseed re-runs the filter)
  useEffect(() => {
    if (!grain || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let seed = 1;
    const timer = window.setInterval(() => {
      seed = (seed % 97) + 1;
      defs.current?.querySelectorAll("feTurbulence").forEach((noise) => noise.setAttribute("seed", String(seed)));
    }, 83);
    return () => window.clearInterval(timer);
  }, [grain]);

  const frames = image ? <img className="ui-ambient__frame" src={image} alt="" data-shown="" /> : (
    <>
      <canvas className="ui-ambient__frame" ref={(node) => { canvases.current[0] = node; }} width={64} height={36} />
      <canvas className="ui-ambient__frame" ref={(node) => { canvases.current[1] = node; }} width={64} height={36} />
    </>
  );
  return (
    <>
      {/* The theme picks the filter (see the CSS): dark draws the light as it is, light as a pastel tint */}
      <div className="ui-ambient__filtered" style={{ "--ui-ambient-dark": `url(#${filterId})`, "--ui-ambient-light": `url(#${filterId}-light)` } as CSSProperties}>{frames}</div>
      <svg ref={defs} className="ui-ambient__defs" width="0" height="0" aria-hidden="true">
        <LightFilter id={filterId} strength={strength} grain={grain} />
        <LightFilter id={`${filterId}-light`} strength={strength} grain={grain} pastel />
      </svg>
    </>
  );
}

/** The light: blurred, saturated, at its strength, then dithered with grain; `pastel` moves its colors halfway to white */
function LightFilter({ id, strength, grain, pastel = false }: { id: string; strength: number; grain: boolean; pastel?: boolean }) {
  return (
    <filter id={id} x="0" y="0" width="1" height="1" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
      <feGaussianBlur in="SourceGraphic" stdDeviation="26" result="blur" />
      <feColorMatrix in="blur" type="saturate" values={pastel ? "1.8" : "1.35"} result="saturated" />
      <feComponentTransfer in="saturated" result="light">
        <feFuncA type="linear" slope={strength} />
        {pastel && <>
          <feFuncR type="linear" slope="0.5" intercept="0.5" />
          <feFuncG type="linear" slope="0.5" intercept="0.5" />
          <feFuncB type="linear" slope="0.5" intercept="0.5" />
        </>}
      </feComponentTransfer>
      {/* Where the light is at all: white, opaque wherever its alpha is at least one step */}
      <feColorMatrix in="light" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 255 0" result="where" />
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="1" stitchTiles="stitch" result="noise" />
      {pastel ? <>
        {/* Light page: jitter the light's opacity in its own colour, ±12 steps around zero – white specks would vanish
            under multiply, and a lift that isn't zero-mean draws a grey rim where the light ends. out = light + s·c·(n − ½) */}
        <feColorMatrix in="light" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1" result="solid" />
        <feComposite in="solid" in2="where" operator="in" result="tint" />
        <feColorMatrix in="noise" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1 0 0 0 0" result="amount" />
        <feComposite in="tint" in2="amount" operator="arithmetic" k1={grain ? JITTER : 0} k2="0" k3="0" k4="0" result="jitter" />
        <feComposite in="light" in2="jitter" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="lifted" />
        <feComposite in="lifted" in2="tint" operator="arithmetic" k1="0" k2="1" k3={grain ? -JITTER / 2 : 0} k4="0" />
      </> : <>
        {/* Dark page: gray noise, kept to where the light is – light + grain − half its range: ±2 steps around the
            light, the same in the faint falloff as next to the stage (its small lift of the alpha can't show on dark) */}
        <feColorMatrix in="noise" type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1" result="gray" />
        <feComposite in="gray" in2="where" operator="in" result="grain" />
        <feComposite in="light" in2="grain" operator="arithmetic" k1="0" k2="1" k3={grain ? GRAIN * 2 : 0} k4="0" result="lifted" />
        <feComposite in="lifted" in2="where" operator="arithmetic" k1="0" k2="1" k3={grain ? -GRAIN : 0} k4="0" />
      </>}
    </filter>
  );
}

const css = /* css */ `
/* The layer reaches 160px past the stage on every side – room for the whole halo */
.ui-ambient { --ui-ambient-room: ${ROOM}px; position: absolute; inset: calc(-1 * var(--ui-ambient-room)); pointer-events: none; }
/* A hole where the stage is keeps the video on top */
.ui-ambient {
  -webkit-mask-image: linear-gradient(#000, #000), linear-gradient(#000, #000);
  mask-image: linear-gradient(#000, #000), linear-gradient(#000, #000);
  -webkit-mask-size: 100% 100%, calc(100% - 2 * var(--ui-ambient-room)) calc(100% - 2 * var(--ui-ambient-room));
  mask-size: 100% 100%, calc(100% - 2 * var(--ui-ambient-room)) calc(100% - 2 * var(--ui-ambient-room));
  -webkit-mask-position: 0 0, var(--ui-ambient-room) var(--ui-ambient-room);
  mask-position: 0 0, var(--ui-ambient-room) var(--ui-ambient-room);
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}
/* The frame, lined up with the stage and 5% larger; frames cross-fade */
.ui-ambient__frame {
  position: absolute;
  inset: var(--ui-ambient-room);
  width: calc(100% - 2 * var(--ui-ambient-room));
  height: calc(100% - 2 * var(--ui-ambient-room));
  opacity: 0;
  transform: scale(1.05);
  transition: opacity 600ms ease;
}
/* The filter blurs, saturates and sets the strength of the whole layer – the light one on a light theme */
.ui-ambient__filtered { position: absolute; inset: 0; filter: var(--ui-ambient-light); }
:is(.dark, [data-theme="dark"]) .ui-ambient__filtered { filter: var(--ui-ambient-dark); }
.ui-ambient__defs { position: absolute; width: 0; height: 0; }
.ui-ambient__frame[data-shown] { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .ui-ambient__frame { transition: none; } }
`;
