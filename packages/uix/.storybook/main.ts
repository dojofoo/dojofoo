import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { monacoAssets } from "../monaco-assets.ts";

const proxy = process.env.PORTLESS_URL ? new URL(process.env.PORTLESS_URL) : undefined;

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y"],
  staticDirs: ["../public"],
  framework: "@storybook/react-vite",
  core: {
    allowedHosts: ["ui.dojofoo.td"],
  },
  viteFinal: async (viteConfig) => ({
    ...viteConfig,
    server: {
      ...viteConfig.server,
      ...(proxy && { hmr: {
        protocol: proxy.protocol === "https:" ? "wss" : "ws",
        host: proxy.hostname,
        clientPort: Number(proxy.port || (proxy.protocol === "https:" ? 443 : 80)),
      } }),
    },
    plugins: [monacoAssets(), tailwindcss(), ...(viteConfig.plugins ?? []).flat()],
    resolve: {
      ...viteConfig.resolve,
      alias: {
        ...(typeof viteConfig.resolve?.alias === "object"
          ? viteConfig.resolve.alias
          : {}),
        "~": fileURLToPath(new URL("../src", import.meta.url)),
        "@": fileURLToPath(new URL("../src", import.meta.url)),
      },
    },
  }),
};

export default config;
