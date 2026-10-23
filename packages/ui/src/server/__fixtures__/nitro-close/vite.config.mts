import { appendFileSync } from "node:fs";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

// Minimal adaptation of nitrojs/nitro#4593's close-hook fixture.
export default defineConfig({
  plugins: [nitro({ serverDir: process.env.DOJO_NITRO_BUILD_OUTPUT ? "./production" : "./", features: { websocket: true },
    ...(process.env.DOJO_NITRO_BUILD_OUTPUT ? { output: { dir: process.env.DOJO_NITRO_BUILD_OUTPUT } } : {}),
    hooks: { close() {
    appendFileSync(process.env.DOJO_NITRO_CLOSE_LOG!, "build:close\n");
  } } })],
});
