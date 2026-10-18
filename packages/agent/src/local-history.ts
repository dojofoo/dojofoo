import { lstat, readFile, readdir, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { MessageStreamEvent } from "eve/client";

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

/** Read the archived event stream through the current Workflow reader and
 * serializer. No old runtime, hand-written binary decoder or replay is used. */
export async function readLegacyLocalHistory(root: string, sessionId: string): Promise<MessageStreamEvent[] | null> {
  if (!/^wrun_[a-zA-Z0-9]+$/u.test(sessionId)) return null;
  const directory = join(resolve(root), legacyDirectory);
  const archive = await lstat(directory).catch(error => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!archive) return null;
  if (!archive.isDirectory() || archive.isSymbolicLink()) throw new Error("Invalid legacy archive directory.");
  const record = join(directory, "runs", `${sessionId}.json`);
  const stat = await lstat(record).catch(error => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!stat) return null;
  if (!stat.isFile()) throw new Error("Invalid legacy session record.");
  const { createWorld } = await import(new URL("./eve/dist/src/compiled/@workflow/world-local/index.js", import.meta.url).href);
  const { getDeserializeStream, getCommonRevivers } = await import(new URL("./eve/dist/src/compiled/@workflow/core/serialization.js", import.meta.url).href);
  const { parseNdjsonStream } = await import(new URL("./eve/dist/src/execution/ndjson-stream.js", import.meta.url).href);
  const { normalizePersistedMessageStreamEvent } = await import(new URL("./eve/dist/src/protocol/message-version.js", import.meta.url).href);
  const world = createWorld({ dataDir: directory, recoverActiveRuns: false });
  // Do not call world.start(): it initializes/migrates storage. Reading streams
  // without starting execution is supported by the current World interface.
  try {
    const streams: string[] = await world.streams.list(sessionId);
    const stream = streams.find(name => name.endsWith("_user"));
    if (!stream) return [];
    const chunks: Uint8Array[] = [];
    let cursor: string | undefined;
    do {
      const page = await world.streams.getChunks(sessionId, stream, { cursor, limit: 1000 });
      chunks.push(...page.data.map((chunk: { data: Uint8Array }) => chunk.data));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    const source = new ReadableStream<Uint8Array>({ start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    } });
    const events: MessageStreamEvent[] = [];
    const decoded = source.pipeThrough(getDeserializeStream(getCommonRevivers(), undefined));
    for await (const event of parseNdjsonStream(() => decoded, normalizePersistedMessageStreamEvent)) {
      events.push(event);
    }
    return events;
  } finally { await world.close(); }
}
