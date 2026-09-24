import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ThinkingIndicator } from "./thinking-indicator";

it("renders the assistant-ui indicator through the shared public export", () => {
  const html = renderToStaticMarkup(<ThinkingIndicator label="Thinking" elapsed="3s" />);
  expect(html).toContain('data-slot="thinking-indicator"');
  expect(html).toContain('role="status"');
  expect(html).toContain("shimmer");
  expect(html).toContain("Thinking");
  expect(html).toContain("3s");
  expect(html).not.toContain("Moonwalking");
});
