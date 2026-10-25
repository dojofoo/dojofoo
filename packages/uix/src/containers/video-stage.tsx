import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ambient } from "~/components/ambient";
import { VideoCn } from "~/components/video-player/video-cn";

/*
 * Video Stage – a lesson video in the 16:9 stage, where the editor otherwise sits, flush to its corners. Files and
 * streams play in videocn's player (its own controls, chapters, HLS and DASH); YouTube and Vimeo links as their own
 * embed, with their native controls – a watch link is turned into its embed.
 *
 * A video file glows. The light doesn't live in the stage, which would clip it: the stage places it, lined up with the
 * video, in the glow layer around it (`[data-glow-layer]`, a direct child of an ancestor) – in the shell, a layer over
 * every column. So the order is the video, then its light, then everything else; the light runs over the toolbar, the
 * window's edges and corners, the settings and the page, and the video stays clear on top.
 * YouTube plays in the same player (videocn's YouTube engine), so its time is ours too; it gets no glow – its frames
 * can't be read across origins. Vimeo stays its own embed, with its native controls.
 *
 * Cues run on the player's time, the same for files and YouTube – what the lesson tells the agent and what it lets the
 * learner skip, authored with the lesson:
 *   - marker  – a moment (`at`); reported once, when playback crosses it (not when a seek jumps over it)
 *   - done    – the video counts as watched: `before` seconds ahead of the end (default 10), or at `at` – so the
 *               chapter is finished before the video stops
 *   - skip    – a range (`from`–`to`), e.g. a sponsor mention: a "Skip" button while inside it, or skipped outright
 *               with `auto`; reported when skipped
 * Each is reported to `onCue` with the time it happened – where agent feedback hooks in.
 */
export type VideoCue =
  | { kind: "marker"; id: string; at: number; label: string }
  | { kind: "done"; id: string; at?: number; before?: number; label?: string }
  | { kind: "skip"; id: string; from: number; to: number; label: string; auto?: boolean };
export type VideoCueEvent = { cue: VideoCue; time: number };

/** Only Vimeo stays an embed */
function embedUrl(src: string) {
  const vimeo = src.match(/(?:player\.)?vimeo\.com\/(?:video\/)?(\d+)/);
  return vimeo ? `https://player.vimeo.com/video/${vimeo[1]}` : null;
}
const isYoutube = (src: string) => /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/)/.test(src);

/** The furthest one timeupdate step can move while playing (they come ~4 times a second); a bigger jump is a seek */
const PLAYING_STEP = 2;

/** Follows the player's time and reports cues; returns the skip range playback is in, if it offers a button */
function useVideoCues(element: HTMLVideoElement | null, cues: readonly VideoCue[], onCue?: (event: VideoCueEvent) => void) {
  const [offer, setOffer] = useState<Extract<VideoCue, { kind: "skip" }> | null>(null);
  const report = useRef(onCue);
  useEffect(() => {
    report.current = onCue;
  }, [onCue]);
  useEffect(() => {
    if (!element || cues.length === 0) return;
    const fired = new Set<string>();
    let last = element.currentTime;
    const tick = () => {
      const time = element.currentTime;
      const previous = last;
      last = time;
      const playing = time >= previous && time - previous <= PLAYING_STEP;
      const crossed = (at: number) => playing && previous < at && at <= time;
      let inside: Extract<VideoCue, { kind: "skip" }> | null = null;
      for (const cue of cues) {
        if (cue.kind === "skip") {
          if (time < cue.from || time >= cue.to) continue;
          if (cue.auto && !fired.has(cue.id)) {
            fired.add(cue.id);
            element.currentTime = cue.to;
            report.current?.({ cue, time });
          } else if (!cue.auto) inside = cue;
          continue;
        }
        if (fired.has(cue.id)) continue;
        const at = cue.kind === "marker" ? cue.at : cue.at ?? element.duration - (cue.before ?? 10);
        if (Number.isFinite(at) && crossed(at)) {
          fired.add(cue.id);
          report.current?.({ cue, time });
        }
      }
      setOffer(inside);
    };
    // A seek moves the baseline: jumping over a marker isn't watching it
    const seeked = () => {
      last = element.currentTime;
      tick();
    };
    element.addEventListener("timeupdate", tick);
    element.addEventListener("seeked", seeked);
    return () => {
      element.removeEventListener("timeupdate", tick);
      element.removeEventListener("seeked", seeked);
    };
  }, [element, cues]);
  const skip = () => {
    if (!element || !offer) return;
    const time = element.currentTime;
    element.currentTime = offer.to;
    report.current?.({ cue: offer, time });
    setOffer(null);
  };
  return { offer, skip };
}

const NO_CUES: readonly VideoCue[] = [];

type Placement = { layer: HTMLElement; left: number; top: number; width: number; height: number };

/** The glow layers around a node, nearest first */
function glowLayers(node: HTMLElement) {
  const layers: HTMLElement[] = [];
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    const layer = parent.querySelector<HTMLElement>(":scope > [data-glow-layer]");
    if (layer) layers.push(layer);
  }
  return layers;
}

export function VideoStage({ src, title, cues = NO_CUES, onCue }: { src: string; title: string; cues?: readonly VideoCue[]; onCue?: (event: VideoCueEvent) => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const embed = embedUrl(src);
  const glows = !embed && !isYoutube(src);
  // The media element as state too: YouTube's arrives a moment after mount, once its element is defined, and the cues
  // must follow it there
  const [media, setMedia] = useState<HTMLVideoElement | null>(null);
  const attachMedia = useCallback((node: HTMLVideoElement | null) => {
    video.current = node;
    setMedia(node);
  }, []);
  const { offer, skip } = useVideoCues(media, cues, onCue);

  // Follow the stage's place in each layer, so the light stays lined up as columns resize or the rail folds
  useLayoutEffect(() => {
    const node = stage.current;
    if (!glows || !node) return;
    const layers = glowLayers(node);
    const place = () => {
      const box = node.getBoundingClientRect();
      setPlacements(layers.map((layer) => {
        const frame = layer.getBoundingClientRect();
        return { layer, left: box.left - frame.left, top: box.top - frame.top, width: box.width, height: box.height };
      }));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(node);
    layers.forEach((layer) => observer.observe(layer));
    // The rail animates the columns; follow it to the end of the move
    const app = node.closest(".ui-as-app");
    app?.addEventListener("transitionend", place);
    return () => {
      observer.disconnect();
      app?.removeEventListener("transitionend", place);
    };
  }, [glows]);

  return (
    <div ref={stage} className="ui-vs" data-embed={embed ? "" : undefined}>
      <style href="ui-video-stage" precedence="default">{css}</style>
      {embed ? (
        <iframe src={embed} title={title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      ) : (
        <>
          <VideoCn
            ref={attachMedia}
            src={src}
            title={title}
            autoPlay
            // A video with cues plays through once – its end means something
            loop={cues.length === 0}
            defaultMuted
            className="flex h-full items-center rounded-none border-0"
          />
          {offer && (
            <button type="button" className="ui-vs__skip" onClick={skip}>
              Skip {offer.label}
              <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M3 3.5 8 8l-5 4.5M9 3.5 14 8l-5 4.5" /></svg>
            </button>
          )}
          {glows && placements.map(({ layer, ...box }, index) => (
            <Fragment key={index}>
              {createPortal(
                <div className="ui-vs__light" style={box}>
                  <Ambient video={video} />
                </div>,
                layer,
              )}
            </Fragment>
          ))}
        </>
      )}
    </div>
  );
}

const css = /* css */ `
.ui-vs { position: relative; height: 100%; min-height: 0; }
/* Skip, while playback is inside a skip range: over the picture, above the control bar – dark glass on any theme */
.ui-vs__skip {
  position: absolute; z-index: 2; right: 16px; bottom: 64px;
  display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px 0 14px; border-radius: calc(8px * var(--squircle-factor, 1));
  background: rgb(0 0 0 / 0.62); color: #fff; font-size: var(--fs-body); font-weight: 550;
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.12);
  animation: ui-vs-skip-in var(--motion-fast) var(--ease-fast);
}
.ui-vs__skip:hover { background: rgb(0 0 0 / 0.78); }
.ui-vs__skip:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.ui-vs__skip svg { width: 14px; height: 14px; }
@keyframes ui-vs-skip-in { from { opacity: 0; } }
.ui-vs > iframe { display: block; width: 100%; height: 100%; border: 0; background: #000; }
/* A copy of the light in a glow layer, exactly where the video is */
.ui-vs__light { position: absolute; isolation: isolate; }
/* On a light theme the glow layer multiplies its (pastel) light onto the page: a tint over white, text stays crisp */
:root:not(.dark, [data-theme="dark"]) [data-glow-layer] { mix-blend-mode: multiply; }
`;
