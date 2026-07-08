import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  server: {
    port: Number(process.env.PORT) || 4567,
    host: process.env.HOST || "localhost",
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    react(),
    nitro({
      // Default node-server preset for local dev / `dojo ui`.
      // Override at deploy time (e.g. preset: "vercel") if/when we host this.
      preset: "node-server",
      // Streaming responses are required for A2A `message/stream` (SSE).
      // Local node-server preset supports streaming out of the box.
    }),
  ],
});
