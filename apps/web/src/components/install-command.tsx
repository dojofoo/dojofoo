import { useState } from 'react';
import { Button } from '@dojofoo/uix/components/button';
import { SegmentedControl } from '@dojofoo/uix/components/segmented-control';
import { CommandCopy } from '@dojofoo/uix/web/site';
import { AGENT_PROMPT } from './install-prompt';

export interface InstallCommandProps {
  commands?: ReadonlyArray<{ label: string; cmd: string }>;
  className?: string;
}

const DEFAULT_COMMANDS = [{ label: 'npx', cmd: 'npx dojofoo install' }] as const;

/** Application-owned commands, rendered with the same controls as the UIX website. */
export function InstallCommand({ commands = DEFAULT_COMMANDS, className = '' }: InstallCommandProps) {
  const [active, setActive] = useState(0);
  const [promptCopied, setPromptCopied] = useState(false);
  const copyPrompt = async () => {
    await navigator.clipboard.writeText(AGENT_PROMPT);
    setPromptCopied(true);
    window.setTimeout(() => setPromptCopied(false), 2000);
  };
  return <div className={`grid gap-3 ${className}`}>
    {commands.length > 1 && <SegmentedControl kind="tabs" size="compact" label="Install with"
      options={commands.map(command => command.label)} value={commands[active].label}
      onChange={next => setActive(commands.findIndex(command => command.label === next))} />}
    <CommandCopy command={commands[active].cmd} />
    <div className="flex items-center justify-between gap-3 text-sm text-[var(--muted)]">
      <span>Or have your agent install it</span>
      <Button variant="ghost" size="sm" aria-live="polite" onClick={() => void copyPrompt()}>{promptCopied ? 'Copied' : 'Copy Prompt'}</Button>
    </div>
  </div>;
}
