/** Presentation-only copy and colors. No protocol or agent instructions live here. */
export const activityLabels = {
  thinking: { label: "Thinking", color: "bg-blue-400" },
  working: { label: "Working", color: "bg-cyan-400" },
  waiting: { label: "Waiting", color: "bg-amber-400" },
  testing: { label: "Testing", color: "bg-emerald-400" },
  teaching: { label: "Teaching sensei", color: "bg-violet-400" },
  preparing: { label: "Preparing lesson", color: "bg-orange-400" },
} as const;

export type ActivityKind = keyof typeof activityLabels;
export const reasoningCycleMs = 4000;
export const reasoningLabels = [
  activityLabels.thinking,
  { label: "Rethinking", color: "bg-violet-400" },
  { label: "Connecting brain cells", color: "bg-cyan-400" },
  { label: "Untangling noodles", color: "bg-amber-400" },
  { label: "Polishing a hunch", color: "bg-pink-400" },
] as const;

const editTools = new Set(["edit", "edit_file", "write", "write_file", "apply_patch", "multiedit", "multi_edit"]);
const testTools = new Set(["dojo_lesson_verify", "check_lesson", "lesson_checks", "run_tests"]);
const waitTools = new Set(["sleep", "wait", "dojo_ui_ask", "ask_question", "request_user_input"]);

/** Prefer explicit tool names/structured paths; never infer edits from prose. */
export function toolActivity(name: string, input: unknown): ActivityKind {
  const tool = name.toLowerCase().split(/[./:]/).at(-1) ?? name;
  if (testTools.has(tool)) return "testing";
  if (waitTools.has(tool)) return "waiting";
  let args = input;
  if (typeof args === "string") {
    try { args = JSON.parse(args); } catch {
      if (tool === "apply_patch") args = { patch: args };
      else return "working";
    }
  }
  const record = args && typeof args === "object" ? args as Record<string, unknown> : {};
  if (!editTools.has(tool) && record.kind !== "edit") return "working";
  const raw = record.rawInput && typeof record.rawInput === "object"
    ? record.rawInput as Record<string, unknown> : record;
  const paths = [raw.path, raw.filePath, raw.file_path, raw.filename].filter((path): path is string => typeof path === "string");
  // apply_patch has a documented path header rather than a path argument.
  const patch = raw.patch ?? raw.patchText ?? raw.input;
  if (typeof patch === "string") {
    for (const line of patch.split("\n")) {
      const match = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/.exec(line);
      if (match) paths.push(match[1]);
    }
  }
  const files = paths.map(path => path.replaceAll("\\", "/").split("/").at(-1)!.toLowerCase());
  if (files.some(file => file === "sensei.md" || file === "sensei.mdx")) return "teaching";
  if (files.some(file => /^(?:solution|kata)\./.test(file) || /\.test(?:\.|$)/.test(file))) return "preparing";
  return "working";
}
