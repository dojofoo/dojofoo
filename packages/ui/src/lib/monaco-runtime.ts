import { init } from "modern-monaco/core";
import javascript from "shiki/langs/javascript.mjs";
import typescript from "shiki/langs/typescript.mjs";
import json from "shiki/langs/json.mjs";
import markdown from "shiki/langs/markdown.mjs";
import python from "shiki/langs/python.mjs";
import yaml from "shiki/langs/yaml.mjs";
import editorCoreUrl from "virtual:dojo-monaco-url";
import { vercelCursorTheme } from "./code-editor-theme";

let runtime: ReturnType<typeof init> | undefined;
export function loadMonaco() {
  if (!runtime) {
    // Documented import-map override points to our locally shipped editor assets.
    let map = document.querySelector<HTMLScriptElement>('script[type="importmap"]');
    const existing = Boolean(map);
    if (!map) {
      map = document.createElement("script");
      map.type = "importmap";
    }
    const config = JSON.parse(map.textContent || "{}");
    map.textContent = JSON.stringify({ ...config, imports: { ...config.imports, "modern-monaco/editor-core": editorCoreUrl } });
    if (!existing) document.head.append(map);
    runtime = init({ defaultTheme: vercelCursorTheme, cdn: window.location.origin,
      langs: [...javascript, ...typescript, ...json, ...markdown, ...python, ...yaml],
    }).catch((error) => { runtime = undefined; throw error; });
  }
  return runtime;
}
