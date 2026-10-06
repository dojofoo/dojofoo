import { InputCopy } from "@dojofoo/ui/input-copy";
import { Check } from "@mynaui/icons-react";
import { MetalFx } from "metal-fx";
import { useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import { useMemo, useRef, useState } from "react";
import { AGENT_PROMPT } from "./install-prompt";

const INSTALL_COMMAND = "npx dojofoo install";

export function HeroInstallAction() {
  const [copied, setCopied] = useState(false);
  const { resolvedTheme } = useTheme();
  const reducedMotion = useReducedMotion();
  const commandRef = useRef<HTMLDivElement>(null);
  const reflectionTargets = useMemo(() => [commandRef], []);

  async function copyPrompt() {
    await navigator.clipboard.writeText(AGENT_PROMPT);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex w-full max-w-xl flex-col items-stretch gap-2 sm:flex-row sm:items-start">
      <InputCopy
        ref={commandRef}
        className="min-w-0 flex-1 border border-dashed border-border bg-background pr-2 pl-3.5 [&_button]:min-h-[38px] [&_button]:rounded-none"
        value={INSTALL_COMMAND}
      />
      <div className="shrink-0">
        <MetalFx
          className="w-full"
          preset="chromatic"
          theme={resolvedTheme === "light" ? "light" : "dark"}
          paused={reducedMotion === true}
          borderRadius={0}
          reflectionTargets={reflectionTargets}
        >
          <button
            className="group flex min-h-10 w-full cursor-pointer items-center justify-between gap-3 bg-background px-3 text-left text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            onClick={copyPrompt}
            type="button"
          >
            <span className="font-display text-[11px] font-medium uppercase leading-none tracking-[0.14em]">
              {copied ? "Copied" : "Copy prompt"}
            </span>
            {copied ? <Check className="size-4" /> : null}
          </button>
        </MetalFx>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground leading-none">
          Let your agent handle it
        </p>
      </div>
    </div>
  );
}
