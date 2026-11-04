import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { SenseiRuntime, UsageCeiling } from "@dojofoo/authoring/sensei/agent";

/** The host writes its private binding before starting this prepared application. */
export async function runtime(): Promise<SenseiRuntime & { auth: { username: string; password: string } }> {
  return JSON.parse(await readFile(resolve(process.cwd(), "runtime.json"), "utf8"));
}

let ceiling: { value: UsageCeiling | undefined } | undefined;
/** The start's usage ceiling, read once per process: the host rewrites runtime.json only before a new start. */
export function usageCeiling(): UsageCeiling | undefined {
  ceiling ??= { value: (JSON.parse(readFileSync(resolve(process.cwd(), "runtime.json"), "utf8")) as SenseiRuntime).usageCeiling };
  return ceiling.value;
}
