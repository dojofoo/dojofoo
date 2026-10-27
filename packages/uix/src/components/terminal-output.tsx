import { Icon } from "./app-shell";
import { CodeBlock } from "./code-block";
import { Cancel01Icon, DoneIcon } from "../lib/icons";

/** Host-owned command/check output; the view never runs commands or invents log lines. */
export function TerminalOutput({ label, lines, status, exitCode }: {
  label: string;
  lines: readonly string[];
  status: "running" | "success" | "error";
  exitCode?: number;
}) {
  return <section className="ui-terminal-output" aria-label={label} data-status={status}>
    <style href="ui-terminal-output" precedence="default">{css}</style>
    <div className="ui-terminal-output__head">
      <span className="ui-terminal-output__label" role="status">{label}</span>
      <span className="ui-terminal-output__mark" role="img" aria-label={status === "running" ? "Running" : status === "error" ? "Failed" : "Passed"}>
        {status === "running" ? <i /> : <Icon icon={status === "error" ? Cancel01Icon : DoneIcon} size={14} />}
      </span>
      {exitCode !== undefined && <span className="ui-terminal-output__exit">exit {exitCode}</span>}
    </div>
    {lines.length > 0 && <CodeBlock code={lines.join("\n")} lang="text" />}
  </section>;
}

const css = /* css */ `
.ui-terminal-output { --muted: var(--fluid-muted); --ink: var(--fluid-foreground); width: 100%; min-width: 0; overflow: hidden; border-radius: var(--box-radius); background: var(--box-surface); box-shadow: var(--box-shadow); font-family: var(--font-mono); }
.ui-terminal-output__head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; font-size: 12px; line-height: 20px; }
.ui-terminal-output__label { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.ui-terminal-output__mark { display: grid; flex: none; place-items: center; width: 14px; height: 14px; color: var(--brand); }
.ui-terminal-output__mark i { width: 5px; height: 5px; border-radius: 50%; background: var(--fluid-muted); animation: ui-terminal-output-pulse 1s ease-in-out infinite alternate; }
.ui-terminal-output__exit { flex: none; color: var(--fluid-muted); }
.ui-terminal-output pre.ui-code { margin: 0; border-radius: 0; box-shadow: none; white-space: pre-wrap; overflow-wrap: anywhere; }
@keyframes ui-terminal-output-pulse { to { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .ui-terminal-output__mark i { animation: none; } }
`;
