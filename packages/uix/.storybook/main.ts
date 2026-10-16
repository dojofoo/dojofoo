import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { monacoAssets } from "../../ui/monaco-assets";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y"],
  framework: "@storybook/react-vite",
  core: {
    allowedHosts: ["ui.dojofoo.td"],
  },
  viteFinal: async (viteConfig) => ({
    ...viteConfig,
    plugins: [monacoAssets(), tailwindcss(), ...(viteConfig.plugins ?? []).flat()],
    resolve: {
      ...viteConfig.resolve,
      alias: {
        ...(typeof viteConfig.resolve?.alias === "object"
          ? viteConfig.resolve.alias
          : {}),
        "~": fileURLToPath(new URL("../src", import.meta.url)),
        "@": fileURLToPath(new URL("../../ui/src", import.meta.url)),
      },
    },
  }),
};

export default config;
