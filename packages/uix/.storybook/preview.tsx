import type { Preview } from "@storybook/react-vite";
import "../src/fonts.css";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/noto-sans";
import "../src/styles.css";
import { UIXProvider, type UIXProviderProps } from "../src/provider";

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
    options: { storySort: { order: ["Pages", "Web", "Docs", "Templates", "Components", ["Atoms", "Molecules", "Organisms"], "Archive"] } },
  },
  decorators: [
    (Story, context) => {
      document.documentElement.lang = "en";
      document.documentElement.classList.add("h-full");
      document.documentElement.style.fontSize = "16px";
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
      // Reduced motion is fewer and gentler, not none: transforms drop, opacity and colour fades stay
      return <UIXProvider key={context.id} mode={context.globals.theme as UIXProviderProps["mode"]} icons={context.globals.icons as UIXProviderProps["icons"]} font={context.globals.font as UIXProviderProps["font"]}><Story /></UIXProvider>;
    },
  ],
};

export default preview;
