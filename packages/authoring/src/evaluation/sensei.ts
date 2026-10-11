import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { MaterialFailure } from "./failure.ts";

/** Match the production lesson resolver: MDX takes precedence over Markdown. */
export async function readLessonSensei(root: string, template: string): Promise<string> {
  for (const name of ["SENSEI.mdx", "SENSEI.md"]) {
    try { return await readFile(resolve(root, dirname(template), name), "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new MaterialFailure(`Lesson at ${template} needs SENSEI.md or SENSEI.mdx beside its template before it can be evaluated`);
}
