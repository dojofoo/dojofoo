import file from "../assets/bearded-icons/file.svg";
import yaml from "../assets/bearded-icons/yaml.svg";
import markdown from "../assets/bearded-icons/markdown.svg";
import mdx from "../assets/bearded-icons/markdownx.svg";
import typescript from "../assets/bearded-icons/typescript.svg";
import declaration from "../assets/bearded-icons/typescriptdef.svg";
import testTs from "../assets/bearded-icons/testts.svg";
import testJs from "../assets/bearded-icons/testjs.svg";
import javascript from "../assets/bearded-icons/js.svg";
import python from "../assets/bearded-icons/python.svg";
import json from "../assets/bearded-icons/json.svg";
import npm from "../assets/bearded-icons/npm.svg";
import pnpm from "../assets/bearded-icons/pnpm.svg";
import vitest from "../assets/bearded-icons/vitest.svg";
import reactTs from "../assets/bearded-icons/reactts.svg";
import reactJs from "../assets/bearded-icons/reactjs.svg";
import html from "../assets/bearded-icons/html.svg";
import css from "../assets/bearded-icons/css.svg";
import shell from "../assets/bearded-icons/shell.svg";
import { cn } from "../lib/utils";

const extensions: Record<string, string> = {
  yaml, yml: yaml, md: markdown, markdown, mdx, ts: typescript, mts: typescript, cts: typescript,
  tsx: reactTs, js: javascript, mjs: javascript, cjs: javascript, jsx: reactJs,
  py: python, json, jsonc: json, html, css, sh: shell,
};

/** File artwork stays in its original Bearded colours; folders never use this resolver. */
export function beardedFileIcon(path: string): string {
  const name = path.split("/").at(-1)!.toLowerCase();
  if (name === "package.json" || name === "package-lock.json") return npm;
  if (name === "pnpm-lock.yaml" || name === "pnpm-workspace.yaml") return pnpm;
  if (/^vitest\.config\./.test(name)) return vitest;
  if (name.endsWith(".d.ts")) return declaration;
  if (/\.(test|spec)\.[cm]?tsx?$/.test(name)) return testTs;
  if (/\.(test|spec)\.[cm]?jsx?$/.test(name)) return testJs;
  return extensions[name.split(".").at(-1)!] ?? file;
}

export function BeardedFileIcon({ path, className }: { path: string; className?: string }) {
  return <img src={beardedFileIcon(path)} alt="" aria-hidden="true" className={cn("size-4 shrink-0 object-contain", className)} />;
}
