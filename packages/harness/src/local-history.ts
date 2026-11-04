import { lstat, readFile, readdir, rename } from "node:fs/promises";
import { join, resolve } from "node:path";

const legacyDirectory = ".eve/legacy-workflow-data";
const supportedLegacyVersion = "@workflow/world-local@5.0.0-beta.43";

/** Preserve the old local store before Workflow's new layout initializer can
 * delete it. The archive is read-only; it never resumes old workflow code. */
export async function preserveLegacyLocalHistory(root: string): Promise<void> {
  const directory = join(resolve(root), ".eve/.workflow-data");
  const stat = await lstat(directory).catch(error => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!stat) return;
  if (stat.isSymbolicLink()) throw new Error("Refusing to upgrade a symlinked Workflow store.");
  const events = await readdir(join(directory, "events"), { withFileTypes: true }).catch(error => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  if (!events.some(entry => entry.isFile() && entry.name.endsWith(".json"))) return;
  const version = (await readFile(join(directory, "version.txt"), "utf8")).trim();
  if (version !== supportedLegacyVersion) {
    throw new Error(`Cannot safely upgrade the legacy Workflow store (${version}). Export its history before upgrading.`);
  }
  const archive = join(resolve(root), legacyDirectory);
  // Never overwrite an earlier archive, even if this directory was restored.
  const existing = await lstat(archive).catch(error => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (existing) throw new Error("A legacy Workflow archive already exists. Preserve both stores before upgrading.");
  await rename(directory, archive);
}
