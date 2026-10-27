import { CodexIcon, CursorIcon, FxIcon, GrokIcon, OpenCodeIcon, PiIcon } from "@dojofoo/uix/components/harness-icons";
import type { ComposerAgent } from "@dojofoo/uix/containers/assistant-home";

/** Names and marks only; runtime owners decide which choices are supported. */
export const codingAgents: ComposerAgent[] = [
  { value: "opencode", name: "OpenCode", icon: OpenCodeIcon },
  { value: "codex", name: "Codex", icon: CodexIcon },
  { value: "cursor", name: "Cursor", icon: CursorIcon },
  { value: "grok", name: "Grok", icon: GrokIcon },
  { value: "fx", name: "FX", icon: FxIcon },
  { value: "pi", name: "Pi", icon: PiIcon },
];
