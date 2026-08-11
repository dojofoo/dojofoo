import { useState } from 'react';
import { AGENT_PROMPT } from './install-prompt';

export interface InstallCommandProps {
  /** Command variants keyed by label. */
  commands?: ReadonlyArray<{ label: string; cmd: string }>;
  /** Optional className applied to the outer wrapper. */
  className?: string;
}

const DEFAULT_COMMANDS = [
  { label: 'npx', cmd: 'npx dojofoo install' },
] as const;

/**
 * Tabbed install-command box with a copy-to-clipboard action.
 * Used both on the landing page and inside MDX pages.
 */
export function InstallCommand({
  commands = DEFAULT_COMMANDS,
  className = '',
}: InstallCommandProps) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(commands[active].cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyPrompt = () => {
    navigator.clipboard.writeText(AGENT_PROMPT);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  };

  return (
    <div
      className={`w-full rounded-lg border border-fd-border bg-fd-muted/40 overflow-hidden ${className}`}
    >
      <div className="flex border-b border-fd-border bg-fd-muted">
        {commands.map((c, i) => (
          <button
            key={c.label}
            type="button"
            onClick={() => setActive(i)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              i === active
                ? 'text-fd-foreground bg-fd-background'
                : 'text-fd-muted-foreground hover:text-fd-foreground'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-3 font-mono text-sm">
        <span className="text-fd-foreground">{commands[active].cmd}</span>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 text-fd-muted-foreground hover:text-fd-foreground transition-colors text-xs"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-fd-border px-4 py-2 text-xs text-fd-muted-foreground">
        <span>Or have your agent install it</span>
        <button
          type="button"
          onClick={copyPrompt}
          className="shrink-0 text-fd-muted-foreground hover:text-fd-foreground transition-colors"
        >
          {promptCopied ? 'Copied!' : 'Copy Prompt'}
        </button>
      </div>
    </div>
  );
}
