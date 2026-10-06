"use client";

import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "@mynaui/icons-react";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement } from "react";
import { CodeBlock } from "./code-block";

type ToolPart = {
  input?: unknown;
  output?: unknown;
  errorText?: string;
};
export type ToolProps = ComponentProps<typeof Collapsible> & {
  label?: ReactNode;
};

export const Tool = ({ children, className, label = "Parameters & result", ...props }: ToolProps) => (
  <Collapsible
    className={cn("group/tool not-prose min-w-0 w-full max-w-full overflow-hidden border", className)}
    {...props}
  >
    <CollapsibleTrigger
      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[11px] text-muted-foreground outline-none transition-colors hover:bg-muted/40 hover:text-foreground"
      style={{ fontFamily: "inherit" }}
    >
      <span>{label}</span>
      <ChevronDown className="size-3 shrink-0 transition-transform group-data-[state=open]/tool:rotate-180" />
    </CollapsibleTrigger>
    <CollapsibleContent className="border-t">{children}</CollapsibleContent>
  </Collapsible>
);

export type ToolContentProps = ComponentProps<"div"> & { forceMount?: boolean };

export const ToolContent = ({ className, forceMount: _forceMount, ...props }: ToolContentProps) => (
  <div
    className={cn(
      "space-y-3 p-3 text-[11px] text-popover-foreground outline-none [&_code]:text-[11px] [&_pre]:text-[11px]",
      className,
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & { input: ToolPart["input"] };

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => {
  const serialized = JSON.stringify(input, null, 2);
  if (serialized === undefined) return null;
  return (
    <div className={cn("space-y-2 overflow-hidden", className)} {...props}>
      <h4 className="font-display text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Parameters</h4>
      <div className="bg-muted/50">
        <CodeBlock code={serialized} language="json" />
      </div>
    </div>
  );
};

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolPart["output"];
  errorText: ToolPart["errorText"];
};

export const ToolOutput = ({ className, output, errorText, ...props }: ToolOutputProps) => {
  if (!(output || errorText)) return null;

  let rendered = <div>{output as ReactNode}</div>;
  if (typeof output === "object" && !isValidElement(output)) {
    rendered = <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />;
  } else if (typeof output === "string") {
    rendered = <CodeBlock code={output} language="json" />;
  }

  return (
    <div className={cn("space-y-2", className)} {...props}>
      <h4 className="font-display text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {errorText ? "Error" : "Result"}
      </h4>
      <div className={cn(
        "overflow-x-auto text-[11px] [&_table]:w-full",
        errorText ? "bg-destructive/10 text-destructive" : "bg-muted/50 text-foreground",
      )}>
        {errorText && <div>{errorText}</div>}
        {rendered}
      </div>
    </div>
  );
};
