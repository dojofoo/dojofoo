import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getTypeScriptCompletions,
  getTypeScriptDiagnostics,
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
