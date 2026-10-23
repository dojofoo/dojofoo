import { existsSync, rmSync, readdirSync, lstatSync, readlinkSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import {
  CLI,
  DOJOS_DIR,
  dojoDir,
  readDojoRc,
  writeDojoRc,
} from "../config";
import { configuredAgents, AGENTS } from "./setup";
import { runLifecycleScript } from "./add";

export function remove(root: string, args: string[]): void {
  const name = args.find((a) => !a.startsWith("--"));
  if (!name) throw new Error(`Usage: ${CLI} remove <name>`);

  const dojoPath = dojoDir(root, name);
  if (!existsSync(dojoPath)) {
    throw new Error(`Dojo "${name}" not found at ${DOJOS_DIR}/${name}`);
  }

  // Run teardown script before removal
  runLifecycleScript(root, dojoPath, "teardown.sh");

  // Remove the dojo directory
  rmSync(dojoPath, { recursive: true, force: true });

  // Clean symlinks that pointed into the removed dojo
  cleanDojoLinks(resolve(root, ".agents", "skills"), name);
  for (const agent of configuredAgents(root)) {
    const dir = AGENTS[agent].dir;
    for (const sub of ["commands", "skills"]) {
      cleanDojoLinks(resolve(root, dir, sub), name);
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

function cleanDojoLinks(directory: string, dojo: string): void {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory)) {
    const link = resolve(directory, entry);
    try {
      if (!lstatSync(link).isSymbolicLink()) continue;
      const target = readlinkSync(link);
      if (target.includes(`${DOJOS_DIR}/${dojo}/`) || target.includes(`${DOJOS_DIR}/${dojo}\\`)) {
        unlinkSync(link);
      }
    } catch {
      // Ignore links concurrently removed by another installer process.
    }
  }
}
