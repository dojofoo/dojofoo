import { Button } from "@dojocho/ui/button";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { Check, Copy } from "lucide-react";
import { type HTMLAttributes, useState } from "react";

interface ScriptCopyBtnProps extends HTMLAttributes<HTMLDivElement> {
  showMultiplePackageOptions?: boolean;
  commandMap: Record<string, string>;
  className?: string;
}

export function ScriptCopyBtn({
  showMultiplePackageOptions = true,
  commandMap,
  className,
}: ScriptCopyBtnProps) {
  const packageManagers = Object.keys(commandMap);
  const [packageManager, setPackageManager] = useState(packageManagers[0]);
  const [copied, setCopied] = useState(false);
  const command = commandMap[packageManager];

  const copyToClipboard = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "mx-auto flex max-w-md items-center justify-center",
        className,
      )}
    >
      <div className="w-full space-y-2">
        <div className="mb-2 flex items-center justify-between">
          {showMultiplePackageOptions && (
            <div className="relative">
              <div className="inline-flex overflow-hidden rounded-md border border-border text-xs">
                {packageManagers.map((pm, index) => (
                  <div key={pm} className="flex items-center">
                    {index > 0 && (
                      <div className="h-4 w-px bg-border" aria-hidden="true" />
                    )}
                    <Button
                      variant="ghost"
                      size="compact"
                      className={`relative rounded-none bg-background px-2 py-1 hover:bg-background ${
                        packageManager === pm
                          ? "text-primary"
                          : "text-muted-foreground"
                      }`}
                      onClick={() => setPackageManager(pm)}
                    >
                      {pm}
                      {packageManager === pm && (
                        <motion.div
                          className="absolute inset-x-0 bottom-[1px] mx-auto h-0.5 w-[90%] bg-primary"
                          layoutId="activeTab"
                          initial={false}
                          transition={{
                            type: "spring",
                            stiffness: 500,
                            damping: 30,
                          }}
                        />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="relative flex items-center">
          <div className="min-w-[300px] grow font-mono">
            <pre className="overflow-x-auto rounded-md border border-border bg-background p-2 px-4 font-mono text-sm text-foreground">
              {command}
            </pre>
          </div>
          <Button
            variant="tertiary"
            size="icon"
            className="relative ml-2 rounded-md"
            onClick={copyToClipboard}
            aria-label={copied ? "Copied" : "Copy to clipboard"}
          >
            <span className="sr-only">{copied ? "Copied" : "Copy"}</span>
            <Copy
              className={`h-4 w-4 transition-all duration-300 ${
                copied ? "scale-0" : "scale-100"
              }`}
            />
            <Check
              className={`absolute inset-0 m-auto h-4 w-4 transition-all duration-300 ${
                copied ? "scale-100" : "scale-0"
              }`}
            />
          </Button>
        </div>
      </div>
    </div>
  );
}
