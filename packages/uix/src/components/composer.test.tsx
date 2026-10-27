import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ComposerSurface } from "./composer";
import { AiMagicIcon } from "../lib/icons";
import { Composer } from "../containers/assistant-home";

it("uses the Pages composer with a host-owned draft and available capabilities", () => {
  const html = renderToStaticMarkup(<Composer tray={false} value="Saved course question" onValueChange={() => {}}
    models={[]} attachments={false} dictation={false} plugins={false} busy onStop={() => {}} />);
  expect(html).toContain("Saved course question");
  expect(html).toContain('aria-label="Stop"');
  expect(html).not.toMatch(/aria-label="(Add file|Dictate)"|>Plugins<|>Auto</);
});

it("lets a native queue own submissions during an active turn", () => {
  const render = (disabled = false) => renderToStaticMarkup(<Composer value="Next request" onValueChange={() => {}}
    models={[]} busy queueing disabled={disabled} tray={false} attachments={false} dictation={false} plugins={false} />);
  expect(render()).toMatch(/aria-label="Queue message"/);
  expect(render()).not.toMatch(/aria-label="Queue message"[^>]*disabled/);
  expect(render(true)).toMatch(/aria-label="Queue message"[^>]*disabled/);
});

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

it("keeps coding-agent selection host-owned and unavailable while the host is changing it", () => {
  const agent = { value: "opencode", name: "OpenCode", icon: AiMagicIcon };
  const render = (props: Partial<Parameters<typeof Composer>[0]> = {}) => renderToStaticMarkup(
    <Composer tray={false} plugins={false} agent={agent} agents={[agent]} onAgentChange={() => {}}
      models={[]} value="Keep this draft" {...props} />,
  );
  expect(render()).toContain(">OpenCode</span>");
  expect(render()).not.toMatch(/aria-label="Agent"[^>]*disabled/);
  for (const props of [{ busy: true }, { disabled: true }, { agentChanging: true }, { onAgentChange: undefined }]) {
    expect(render(props)).toMatch(/aria-label="Agent"[^>]*disabled/);
  }
  expect(render({ agentChanging: true })).toContain("Keep this draft");
});
