import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RouteErrorPanel } from "./__root";

describe("root route error screen", () => {
  it("renders the complete local stack trace", () => {
    const error = new Error("ACP session exploded");
    error.stack = "Error: ACP session exploded\n    at loadSession (runtime.ts:42:7)";
    const html = renderToStaticMarkup(<RouteErrorPanel error={error} info={undefined} reset={vi.fn()} />);

    expect(html).toContain("Something went wrong");
    expect(html).toContain("ACP session exploded");
    expect(html).toContain("loadSession (runtime.ts:42:7)");
    expect(html).toContain("Back to courses");
    expect(html).toContain('class="ui-code"');
    expect(html).toContain('aria-label="Copy code"');
    expect(html).toContain('aria-label="Dojo dashboard"');
  });
});
