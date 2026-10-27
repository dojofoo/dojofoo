import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ToolCallCard } from "./tool-call-card";

it("keeps structured tool results instead of replacing them with raw text or a waiting placeholder", () => {
  for (const status of ["running", "success", "error"] as const) {
    const html = renderToStaticMarkup(<ToolCallCard name="lesson.check" status={status} result="Raw fallback" error="Real failure">
      <section aria-label="Test results">Actual structured result</section>
    </ToolCallCard>);
    expect(html).toContain('aria-label="Test results"');
    expect(html).toContain("Actual structured result");
    expect(html).not.toContain("Raw fallback");
    expect(html).not.toContain("Waiting for result");
    if (status === "error") expect(html).toContain("Real failure");
  }
});

it("keeps the raw result when an optional structured result is absent", () => {
  const html = renderToStaticMarkup(<ToolCallCard name="read" status="success" result="Actual tool output">{false}</ToolCallCard>);
  expect(html).toContain("Actual tool output");
});
