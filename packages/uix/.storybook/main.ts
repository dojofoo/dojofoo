import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { monacoAssets } from "../monaco-assets.ts";
import { languageApi } from "./language-api.ts";

const proxy = process.env.PORTLESS_URL ? new URL(process.env.PORTLESS_URL) : undefined;
// `pnpm storybook:web` (uix.dojofoo.td): only the website's sections, Web and Docs, beside the full Storybook – with
// its own Vite cache, so the two servers can run at once
const web = process.env.UIX_STORIES === "web";

const config: StorybookConfig = {
  stories: web ? ["../src/stories/web.stories.tsx", "../src/stories/docs.stories.tsx"] : ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y"],
  staticDirs: ["../public"],
  framework: "@storybook/react-vite",
  core: {
    allowedHosts: ["ui.dojofoo.td", "uix.dojofoo.td"],
  },
  viteFinal: async (viteConfig) => ({
    ...viteConfig,
    ...(web && { cacheDir: "node_modules/.cache/storybook-web" }),
    server: {
      ...viteConfig.server,
      ...(proxy && { hmr: {
        protocol: proxy.protocol === "https:" ? "wss" : "ws",
        host: proxy.hostname,
        clientPort: Number(proxy.port || (proxy.protocol === "https:" ? 443 : 80)),
      } }),
    },
    plugins: [languageApi(), monacoAssets(), tailwindcss(), ...(viteConfig.plugins ?? []).flat()],
    resolve: {
      ...viteConfig.resolve,
      alias: {
        ...(typeof viteConfig.resolve?.alias === "object"
          ? viteConfig.resolve.alias
          : {}),
        "~": fileURLToPath(new URL("../src", import.meta.url)),
        "shiki/core": "shiki/dist/core.mjs",
        "@": fileURLToPath(new URL("../src", import.meta.url)),
      },
    },
  }),
};

export default config;
