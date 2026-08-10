import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(packageRoot, "../../apps/ui/.output");
const destination = resolve(packageRoot, "dist/ui");

if (!existsSync(resolve(source, "server/index.mjs"))) {
  throw new Error("The production dojo UI is missing. Run the workspace build before packaging dojocho.");
}

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true });
