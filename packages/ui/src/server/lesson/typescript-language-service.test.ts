import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getTypeScriptCompletions,
  getTypeScriptDiagnostics,
  getTypeScriptHover,
} from "./typescript-language-service";

function project() {
  const root = mkdtempSync(join(tmpdir(), "dojocho-typescript-"));
  const source = join(root, "solution.ts");
  const effect = join(root, "node_modules", "effect");
  mkdirSync(effect, { recursive: true });
  writeFileSync(join(root, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      module: "ESNext",
      moduleResolution: "Bundler",
      strict: true,
      target: "ES2022",
    },
    include: ["solution.ts"],
  }));
  writeFileSync(join(effect, "package.json"), JSON.stringify({
    name: "effect",
    types: "index.d.ts",
  }));
  writeFileSync(join(effect, "index.d.ts"), `
    export declare namespace Effect {
      function succeed<A>(value: A): { readonly value: A };
      function sync<A>(evaluate: () => A): { readonly value: A };
    }
  `);
  return { root, source };
}

describe("TypeScript lesson language service", () => {
  it("resolves documented imports in vitest.config.ts from the project's installed types", () => {
    const { root } = project();
    const vitest = join(root, "node_modules", "vitest");
    mkdirSync(vitest, { recursive: true });
    writeFileSync(join(vitest, "package.json"), JSON.stringify({ name: "vitest", exports: { "./config": "./config.d.ts" } }));
    writeFileSync(join(vitest, "config.d.ts"), `/** Configure **Vitest**.\n * @param config Test settings.\n * @returns The resolved configuration.\n */\nexport declare function defineConfig(config: { test: { globals: boolean } }): object;`);
    const code = 'import { defineConfig } from "vitest/config";\nexport default defineConfig({ test: { globals: true } });';
    const result = getTypeScriptHover({ projectRoot: root, filePath: "vitest.config.ts", code, position: code.lastIndexOf("defineConfig") + 2 });
    expect(result?.signature).toContain("defineConfig");
    expect(result?.documentation).toBe("Configure **Vitest**.");
    expect(result?.tags.map((tag) => tag.name)).toEqual(["param", "returns"]);
  });

  it("uses unsaved JSDoc and inferred return types", () => {
    const { root } = project();
    const code = '/** Say **hello**.\n * @see {@link https://example.com/reference | API reference}\n */\nfunction greet(name: string) { return `Hello ${name}`; }\ngreet("Ada");';
    const result = getTypeScriptHover({ projectRoot: root, filePath: "solution.ts", code, position: code.lastIndexOf("greet") + 1 });
    expect(result?.signature).toContain("greet(name: string): string");
    expect(result?.documentation).toBe("Say **hello**.");
    expect(result?.tags[0].text).toContain("[API reference](<https://example.com/reference>)");
  });
  it("completes members from the course dependency declarations", () => {
    const { root, source } = project();
    const code = `import { Effect } from "effect";\nexport const answer = Effect.su`;

    const result = getTypeScriptCompletions({
      code,
      filePath: source,
      position: code.length,
      projectRoot: root,
    });

    expect(result.options).toContainEqual(expect.objectContaining({
      label: "succeed",
      type: "function",
    }));
  });

  it("reports unknown names in unsaved editor content", () => {
    const { root, source } = project();
    const code = `export const answer = unknownEffectValue;`;

    const diagnostics = getTypeScriptDiagnostics({ code, filePath: source, projectRoot: root });

    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: 2304,
      severity: "error",
      message: "Cannot find name 'unknownEffectValue'.",
    }));
  });

  it("reports unknown members on imported course APIs", () => {
    const { root, source } = project();
    const code = `import { Effect } from "effect";\nexport const answer = Effect.unknownFunction();`;

    const diagnostics = getTypeScriptDiagnostics({ code, filePath: source, projectRoot: root });

    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: 2339,
      severity: "error",
      message: expect.stringContaining("unknownFunction"),
    }));
  });

  it("underlines adjoining punctuation for punctuation diagnostics", () => {
    const { root, source } = project();
    const code = `import { Effect } from "effect";\nexport const answer = () => {\n  return Effect.succeed("x"\n};`;

    const diagnostic = getTypeScriptDiagnostics({ code, filePath: source, projectRoot: root })
      .find(({ code: diagnosticCode }) => diagnosticCode === 1005);

    expect(diagnostic).toBeDefined();
    expect(code.slice(diagnostic!.from, diagnostic!.to)).toBe("};");
  });
});
