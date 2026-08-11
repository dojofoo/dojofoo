import { existsSync, rmSync, readdirSync, lstatSync, readlinkSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import {
  CLI,
  DOJOS_DIR,
  readDojoRc,
  writeDojoRc,
} from "../config";
import { configuredAgents, AGENTS } from "./setup";
import { runLifecycleScript } from "./add";

export function remove(root: string, args: string[]): void {
  const name = args.find((a) => !a.startsWith("--"));
  if (!name) throw new Error(`Usage: ${CLI} remove <name>`);

  const dojoPath = resolve(root, DOJOS_DIR, name);
  if (!existsSync(dojoPath)) {
    throw new Error(`Dojo "${name}" not found at ${DOJOS_DIR}/${name}`);
  }

  // Run teardown script before removal
  runLifecycleScript(root, dojoPath, "teardown.sh");

  // Remove the dojo directory
  rmSync(dojoPath, { recursive: true, force: true });

  // Clean symlinks that pointed into the removed dojo
  for (const agent of configuredAgents(root)) {
    const dir = AGENTS[agent].dir;
    for (const sub of ["commands", "skills"]) {
      const subDir = resolve(root, dir, sub);
      if (!existsSync(subDir)) continue;
      for (const entry of readdirSync(subDir)) {
        const link = resolve(subDir, entry);
        try {
          if (!lstatSync(link).isSymbolicLink()) continue;
          const target = readlinkSync(link);
          if (target.includes(`${DOJOS_DIR}/${name}/`) || target.includes(`${DOJOS_DIR}/${name}\\`)) {
            unlinkSync(link);
          }
        } catch {
          // skip
        }
      }
    }
  }

  // Clear .dojorc if this was the active dojo
  try {
    const rc = readDojoRc(root);
    if (rc.currentDojo === name) {
      rc.currentDojo = "";
      rc.currentKata = null;
      writeDojoRc(root, rc);
    }
  } catch {
    // .dojorc may not exist
  }

  console.log(`Dojo "${name}" removed.`);
}
