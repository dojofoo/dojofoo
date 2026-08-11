import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { CLI, DOJOS_DIR } from "../config";
import { readInstalledSource } from "../source";
import { add } from "./add";

export function resolveUpdateSource(root: string, requested: string) {
  const dojos = resolve(root, DOJOS_DIR);
  if (!existsSync(dojos)) return null;
  for (const dojo of readdirSync(dojos)) {
    const source = readInstalledSource(resolve(dojos, dojo));
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
  await add(root, [installed.source.locator, "--force"]);
}
