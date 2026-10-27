import { globSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSourceFile, forEachChild, isArrayLiteralExpression, isCallExpression, isPropertyAccessExpression, isStringLiteral, preProcessFile, ScriptTarget } from "typescript";
import { expect, it } from "vitest";

const source = dirname(fileURLToPath(import.meta.url));

it("keeps production entry graphs independent of host aliases and application sources", () => {
  const entries = globSync(["components/**/*.tsx", "containers/**/*.tsx", "lib/**/*.ts", "provider.tsx", "docs/**/*.tsx", "web/{site,courses,course,course-tile,landing}.tsx"], { cwd: source })
    .filter(file => !/\.(stories|test)\./.test(file));
  const visited = new Set<string>();
  const violations: string[] = [];
  function visit(file: string) {
    if (visited.has(file)) return;
    visited.add(file);
    const code = readFileSync(file, "utf8");
    const imports = preProcessFile(code, true).importedFiles.map(item => item.fileName);
    const ast = createSourceFile(file, code, ScriptTarget.Latest, true);
    function inspect(node: import("typescript").Node) {
      if (isCallExpression(node) && isPropertyAccessExpression(node.expression)
        && node.expression.name.text === "glob" && node.expression.expression.getText(ast) === "import.meta") {
        const argument = node.arguments[0];
        if (argument && isStringLiteral(argument)) imports.push(argument.text);
        else if (argument && isArrayLiteralExpression(argument)) {
          for (const item of argument.elements) if (isStringLiteral(item)) imports.push(item.text);
        }
      }
      forEachChild(node, inspect);
    }
    inspect(ast);
    for (const name of imports) {
      const label = `${relative(source, file)} -> ${name}`;
      if (/^(~|@)\//.test(name) || name.startsWith("@dojofoo/ui")) {
        violations.push(label);
        continue;
      }
      if (!name.startsWith(".")) continue;
      const target = resolve(dirname(file), name.split("?")[0]);
      if (!target.startsWith(source + "/") || target.includes("/stories/")) {
        violations.push(label);
        continue;
      }
      const resolved = [target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`, `${target}/index.tsx`]
        .find(candidate => { try { return statSync(candidate).isFile(); } catch { return false; } });
      if (resolved && /\.tsx?$/.test(resolved) && !resolved.endsWith(".d.ts")) visit(resolved);
    }
  }
  entries.forEach(file => visit(resolve(source, file)));
  expect(visited.size).toBeGreaterThan(20);
  expect(violations).toEqual([]);
});
