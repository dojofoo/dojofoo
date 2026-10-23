import { CLI, dojoDir, listDojos } from "../config";
import { readInstalledSource } from "../source";
import { add } from "./add";

export function resolveUpdateSource(root: string, requested: string) {
  for (const dojo of listDojos(root)) {
    const source = readInstalledSource(dojoDir(root, dojo));
    if (dojo === requested || source?.locator === requested) {
      return source ? { dojo, source } : null;
    }
  }
  return null;
}

export async function update(root: string, args: string[]) {
  const requested = args.find((argument) => !argument.startsWith("--"));
  if (!requested) throw new Error(`Usage: ${CLI} update <owner/repository|dojo>`);
  const installed = resolveUpdateSource(root, requested);
  if (!installed) {
    throw new Error(`No installed source found for "${requested}". Add it first with: ${CLI} add ${requested}`);
  }
  await add(root, [installed.source.locator, "--force", ...(installed.source.authoring ? ["--master"] : [])]);
}
