import type { Plugin } from "vite";
import { fileURLToPath } from "node:url";

/** Exercise the same language service as the app, without requiring a lesson server. */
export function languageApi(): Plugin {
  return {
    name: "uix-storybook-language-api",
    async configureServer(server) {
      const { getTypeScriptCompletions, getTypeScriptDiagnostics, getTypeScriptHover } = await import("../../ui/src/server/lesson/typescript-language-service.ts");
      server.middlewares.use("/uix-language/files/solution", async (req, res, next) => {
        const method = req.url?.split("?")[0];
        if (req.method !== "POST" || !["/hover", "/diagnostics", "/completions"].includes(method ?? "")) return next();
        try {
          let body = "";
          for await (const chunk of req) body += chunk;
          const input = JSON.parse(body);
          if (typeof input.code !== "string" || typeof input.filePath !== "string"
            || (method !== "/diagnostics" && !Number.isFinite(input.position))) throw new Error("Invalid language request");
          const request = { ...input, projectRoot: fileURLToPath(new URL("../fixtures", import.meta.url)) };
          const result = method === "/hover" ? getTypeScriptHover(request)
            : method === "/completions" ? getTypeScriptCompletions(request) : getTypeScriptDiagnostics(request);
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(result));
        } catch (error) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });
    },
  };
}
