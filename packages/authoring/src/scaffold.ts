import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export const authoringStyles = ["katas"] as const;
export type AuthoringStyle = (typeof authoringStyles)[number];

export function scaffoldAuthoringWorkspace(input: {
  root: string;
  name: string;
  style: AuthoringStyle;
  moduleUrl?: string;
}): void {
  const source = resolveTemplate(input.style, input.moduleUrl ?? import.meta.url);
  if (!source) throw new Error(`The ${input.style} authoring template is unavailable.`);
  mkdirSync(input.root, { recursive: true });
  const createdManifest = !existsSync(resolve(input.root, "dojo.yaml"));
  const createdPackage = !existsSync(resolve(input.root, "package.json"));
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.name === ".dojo" || entry.name === "node_modules") continue;
    const destination = resolve(input.root, entry.name);
    if (existsSync(destination)) continue;
    cpSync(resolve(source, entry.name), destination, { recursive: true });
  }
  mkdirSync(resolve(input.root, "src"), { recursive: true });
  if (createdManifest) configureManifest(input.root, input.name);
  if (createdPackage) configurePackage(input.root, input.name);
}

function configurePackage(root: string, name: string): void {
  const path = resolve(root, "package.json");
  if (!existsSync(path)) return;
  const manifest = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  manifest.name = slugify(name);
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

function slugify(value: string): string {
  return value.toLocaleLowerCase().trim()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "") || "dojo-course";
}

function configureManifest(root: string, name: string): void {
  const path = resolve(root, "dojo.yaml");
  const manifest = parseYaml(readFileSync(path, "utf8")) as Record<string, unknown>;
  manifest.name = name;
  writeFileSync(
    path,
    `# yaml-language-server: $schema=https://dojo.foo/schema/v1/dojo.json\n${stringifyYaml(manifest)}`
  );
}

function resolveTemplate(style: AuthoringStyle, moduleUrl: string): string | null {
  const directory = dirname(fileURLToPath(moduleUrl));
  const candidates = [
    resolve(directory, "templates", style),
    resolve(directory, "../templates", style),
  ];
  return candidates.find(existsSync) ?? null;
}
