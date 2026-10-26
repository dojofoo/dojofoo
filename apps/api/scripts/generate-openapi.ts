import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createCoursesApp } from "../src/app";

const response = await createCoursesApp().handle(new Request("http://localhost/api/v1/openapi/json"));
if (!response.ok) throw new Error(`OpenAPI generation failed: ${response.status}`);
const spec = await response.json();
const destination = resolve(import.meta.dirname, "../../web/content/docs/api/openapi.json");
const output = `${JSON.stringify(spec, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (await readFile(destination, "utf8") !== output) throw new Error("OpenAPI spec is stale. Run openapi:generate.");
  console.log("Verified Elysia OpenAPI document.");
} else {
  await writeFile(destination, output);
  console.log("Generated Elysia OpenAPI document.");
}
