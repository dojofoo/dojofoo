import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { SenseiRuntime } from "@dojofoo/authoring/sensei/agent";

/** The host writes its private binding before starting this prepared application. */
export async function runtime(): Promise<SenseiRuntime & { auth: { username: string; password: string } }> {
  return JSON.parse(await readFile(resolve(process.cwd(), "runtime.json"), "utf8"));
}
