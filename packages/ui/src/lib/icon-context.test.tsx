import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { defaultIcons } from "./icon-context";
import { ArticleIcon } from "../icons/article-icon";
import { ChevronDownIcon } from "../icons/chevron-down-icon";
import { CheckmarkIcon } from "../icons/checkmark-icon";

describe("MynaUI icon set", () => {
  it.each(Object.entries(defaultIcons))("%s respects sizing and currentColor", (_, Icon) => {
    const markup = renderToStaticMarkup(<Icon size={16} strokeWidth={2} className="size-4" />);
    expect(markup).toContain('viewBox="0 0 24 24"');
    expect(markup).toContain('width="16"');
    expect(markup).toContain('currentColor');
    expect(markup).toContain('class="size-4"');
  });

  it.each([ArticleIcon, ChevronDownIcon, CheckmarkIcon])("legacy exports use MynaUI geometry", (Icon) => {
    const markup = renderToStaticMarkup(<Icon aria-hidden="true" />);
    expect(markup).toContain('viewBox="0 0 24 24"');
    expect(markup).toContain('aria-hidden="true"');
  });

  it("does not mix Lucide imports into our UI surfaces", () => {
    for (const relative of ["../", "../../../uix/src/", "../../../../apps/web/src/"]) {
      const root = fileURLToPath(new URL(relative, import.meta.url));
      for (const file of readdirSync(root, { recursive: true }).filter((path) => /\.tsx?$/.test(String(path)))) {
        const source = readFileSync(`${root}/${file}`, "utf8");
        expect(source, String(file)).not.toMatch(/from\s+["']lucide-react["']/);
      }
    }
  });
});
