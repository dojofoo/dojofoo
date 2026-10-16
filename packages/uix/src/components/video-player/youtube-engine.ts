import { NO_CAPABILITIES } from "./player-engine";
import type { PlayerEngine } from "./player-engine";

/*
 * uix: YouTube as an engine. The element is `<youtube-video>` (youtube-video-element, MIT): YouTube's IFrame player
 * behind the media element's API – play, pause, currentTime, volume, playbackRate and the same events – so our
 * controls, chapters and the stage's cues work on it as on a file. YouTube's own controls stay hidden (its `controls`
 * player option); there are no quality levels to offer and no picture-in-picture.
 */

/** A YouTube watch, short, live, embed or youtu.be link */
export const isYoutube = (src: string) => /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|shorts\/|live\/|watch\?))/.test(src);

/** Defines `<youtube-video>` once, on first use – the module touches `customElements`, so never at import */
let defined: Promise<unknown> | undefined;
export const defineYoutubeElement = () => (defined ??= import("youtube-video-element"));

export function createYoutubeEngine(): PlayerEngine {
  let video: HTMLVideoElement | null = null;
  const listeners = new Set<() => void>();
  return {
    source: "youtube",
    attach(element) {
      video = element;
    },
    load(src) {
      if (!video) return Promise.reject(new Error("The YouTube engine has no element: call attach() before load()."));
      video.src = src;
      return Promise.resolve();
    },
    destroy() {
      video?.removeAttribute("src");
      video = null;
      listeners.clear();
    },
    getCapabilities() {
      return NO_CAPABILITIES;
    },
    selectQuality() {},
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
