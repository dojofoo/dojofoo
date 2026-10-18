import type { Preview } from "@storybook/react-vite";
// Inter with its optical-size axis as well as weight, so a label keeps its width when it turns semibold
import "@fontsource-variable/inter/opsz.css";
// The app's editor font: Iosevka at 400 only, as packages/ui/src/app.css loads it
import "@fontsource/iosevka/400.css";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/noto-sans";
import "../src/styles.css";
import { IconSetContext, type IconSet } from "../src/lib/icons";
import { MotionConfig } from "motion/react";

const fontStacks = {
  default:
    'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
  common:
    '"Inter Variable", Inter, "Helvetica Rounded", Helvetica, ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
  modern:
    '"Plus Jakarta Sans Variable", "Plus Jakarta Sans", Geist, "Geist Sans", "Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
  noto:
    '"Noto Sans Variable", "Noto Sans", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
} as const;

type FontStack = keyof typeof fontStacks;

const tailwindTextSizes = {
  "--text-xs": "0.75rem",
  "--text-sm": "0.875rem",
  "--text-base": "1rem",
  "--text-lg": "1.125rem",
  "--text-xl": "1.25rem",
  "--text-2xl": "1.5rem",
  "--text-3xl": "1.875rem",
  "--text-4xl": "2.25rem",
  "--text-5xl": "3rem",
  "--text-6xl": "3.75rem",
  "--text-7xl": "4.5rem",
  "--text-8xl": "6rem",
  "--text-9xl": "8rem",
} as const;

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Color theme",
      toolbar: { icon: "circlehollow", items: [{ value: "light", title: "Light" }, { value: "dark", title: "Dark" }], dynamicTitle: true },
    },
    icons: {
      description: "Icon set",
      toolbar: { icon: "star", items: [{ value: "iconoir", title: "Iconoir" }, { value: "mingcute", title: "MingCute" }, { value: "solar", title: "Solar" }, { value: "fluent", title: "Fluent" }, { value: "hugeicons", title: "Hugeicons" }], dynamicTitle: true },
    },
    font: {
      description: "Global font stack",
      toolbar: {
        icon: "paragraph",
        items: [
          // Default keeps each part's own font: the system UI font (SF Pro on macOS), Inter in the affectUI components
          { value: "default", title: "System UI · Inter" },
          { value: "common", title: "Inter" },
          { value: "modern", title: "Plus Jakarta Sans" },
          { value: "noto", title: "Noto Sans" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: "dark",
    icons: "mingcute",
    font: "common",
  },
  parameters: {
    a11y: { test: "error" },
    layout: "fullscreen",
  },
  decorators: [
    (Story, context) => {
      const font = context.globals.font as FontStack;
      const fontFamily = fontStacks[font] ?? fontStacks.default;

      document.documentElement.lang = "en";
      document.documentElement.classList.toggle("dark", context.globals.theme === "dark");
      document.documentElement.style.colorScheme = context.globals.theme === "dark" ? "dark" : "light";
      document.documentElement.classList.add("h-full");
      document.documentElement.style.fontSize = "16px";
      document.documentElement.style.setProperty("--font-sans", fontFamily);
      // The affectUI components draw in Inter unless --ui-font names another font
      if (font === "default") document.documentElement.style.removeProperty("--ui-font");
      else document.documentElement.style.setProperty("--ui-font", fontFamily);
      if (font === "modern") {
        document.documentElement.style.setProperty("--font-weight-normal", "540");
        document.documentElement.style.setProperty("--font-weight-medium", "620");
      } else {
        document.documentElement.style.removeProperty("--font-weight-normal");
        document.documentElement.style.removeProperty("--font-weight-medium");
      }
      for (const [token, size] of Object.entries(tailwindTextSizes)) {
        if (font === "modern") {
          document.documentElement.style.setProperty(
            token,
            `calc(${size} * 0.9375)`,
          );
        } else {
          document.documentElement.style.removeProperty(token);
        }
      }
      document.body.classList.add(
        "m-0",
        "h-full",
        "bg-background",
        "text-foreground",
        "antialiased",
      );
      // Fullscreen stories are apps sized to the window – the page itself never scrolls; centered and padded ones
      // (a grid of variants, say) scroll when they run taller than the window
      document.body.classList.toggle("overflow-hidden", context.parameters.layout === "fullscreen");
      document.body.classList.toggle("overflow-auto", context.parameters.layout !== "fullscreen");
      document.body.style.fontFamily = "var(--font-sans)";
      document.body.style.fontWeight = "var(--font-weight-normal)";
      // Reduced motion is fewer and gentler, not none: transforms drop, opacity and colour fades stay
      return <MotionConfig reducedMotion="user"><IconSetContext.Provider value={(context.globals.icons as IconSet) ?? "mingcute"}><Story /></IconSetContext.Provider></MotionConfig>;
    },
  ],
};

export default preview;
