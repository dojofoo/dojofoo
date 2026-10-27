import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ComposerSurface } from "./composer";

describe("the controlled composer", () => {
  const render = (props: Partial<Parameters<typeof ComposerSurface>[0]> = {}) => renderToStaticMarkup(
    <ComposerSurface value="" onValueChange={() => {}} onSend={() => {}} {...props} />,
  );
  it("shows only the capabilities supplied by its owner", () => {
    const html = render({ value: "A real draft", label: "Message the Sensei" });
    expect(html).toContain("A real draft");
    expect(html).toContain('aria-label="Message the Sensei"');
    expect(html).not.toMatch(/Plugins|Dictate|Add file|Gmail|Claude|Connect apps/);
    expect(html).toContain("data-bare");
    expect(render({ leading: <span>Sensei</span>, controls: <button type="button">Actual model</button> })).toContain("Actual model");
  });
  it("exposes cancellation only while working and when supported", () => {
    expect(render({ busy: true })).not.toContain('aria-label="Stop"');
    expect(render({ busy: true, onStop: () => {} })).toContain('aria-label="Stop"');
    expect(render({ onStop: () => {} })).not.toContain('aria-label="Stop"');
  });
  it("disables sending empty drafts, unavailable input and active turns", () => {
    for (const props of [{}, { value: "draft", disabled: true }, { value: "draft", busy: true }]) {
      expect(render(props)).toMatch(/aria-label="Send"[^>]*disabled/);
    }
    expect(render({ value: "draft" })).not.toMatch(/aria-label="Send"[^>]*disabled/);
  });
});
