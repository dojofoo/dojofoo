import type { CSSProperties } from "react";
import darkDesktop from "../assets/learning/dark-desktop.webp?no-inline";
import darkDesktopRetina from "../assets/learning/dark-desktop@2x.webp?no-inline";
import lightDesktop from "../assets/learning/light-desktop.webp?no-inline";
import lightDesktopRetina from "../assets/learning/light-desktop@2x.webp?no-inline";
import darkPhone from "../assets/learning/dark-phone.webp?no-inline";
import darkPhoneRetina from "../assets/learning/dark-phone@2x.webp?no-inline";
import lightPhone from "../assets/learning/light-phone.webp?no-inline";
import lightPhoneRetina from "../assets/learning/light-phone@2x.webp?no-inline";

import darkDesktopAvif from "../assets/learning/dark-desktop.avif?no-inline";
import darkDesktopRetinaAvif from "../assets/learning/dark-desktop@2x.avif?no-inline";
import lightDesktopAvif from "../assets/learning/light-desktop.avif?no-inline";
import lightDesktopRetinaAvif from "../assets/learning/light-desktop@2x.avif?no-inline";
import darkPhoneAvif from "../assets/learning/dark-phone.avif?no-inline";
import darkPhoneRetinaAvif from "../assets/learning/dark-phone@2x.avif?no-inline";
import lightPhoneAvif from "../assets/learning/light-phone.avif?no-inline";
import lightPhoneRetinaAvif from "../assets/learning/light-phone@2x.avif?no-inline";

const imageSet = (normal: string, retina: string, avif: string, avifRetina: string) =>
  `image-set(url("${avif}") type("image/avif") 1x, url("${avifRetina}") type("image/avif") 2x, url("${normal}") type("image/webp") 1x, url("${retina}") type("image/webp") 2x)`;
const images = {
  "--learning-dark-desktop": imageSet(darkDesktop, darkDesktopRetina, darkDesktopAvif, darkDesktopRetinaAvif),
  "--learning-light-desktop": imageSet(lightDesktop, lightDesktopRetina, lightDesktopAvif, lightDesktopRetinaAvif),
  "--learning-dark-phone": imageSet(darkPhone, darkPhoneRetina, darkPhoneAvif, darkPhoneRetinaAvif),
  "--learning-light-phone": imageSet(lightPhone, lightPhoneRetina, lightPhoneAvif, lightPhoneRetinaAvif),
} as CSSProperties;
/** The complete approved UIX composition, captured once instead of mounting a mock application. */
export function LearningIllustration() {
  return <div data-learning-illustration="" style={images}
    className="absolute inset-0 bg-cover [background-position:0_0] bg-[image:var(--learning-light-desktop)] dark:bg-[image:var(--learning-dark-desktop)] @max-[600px]/preview:bg-[image:var(--learning-light-phone)] dark:@max-[600px]/preview:bg-[image:var(--learning-dark-phone)]" />;
}

// The initial document uses the brand's dark theme. Match CSS image-set selection
// so the browser discovers the above-the-fold artwork before parsing styles.
export const learningImagePreloads = [
  { rel: "preload", as: "image", type: "image/avif", imageSrcSet: `${darkPhoneAvif} 1x, ${darkPhoneRetinaAvif} 2x`, media: "(width <= 640px)", fetchPriority: "high" },
  { rel: "preload", as: "image", type: "image/avif", imageSrcSet: `${darkDesktopAvif} 1x, ${darkDesktopRetinaAvif} 2x`, media: "(width > 640px)", fetchPriority: "high" },
] as const;
