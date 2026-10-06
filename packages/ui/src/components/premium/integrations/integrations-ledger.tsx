"use client";

import { ArrowUpRight, Check, LinkTwo as Link2 } from "@mynaui/icons-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Button } from "../../motion/button/base";
import { EASE_OUT, SPRING_PANEL, SPRING_PRESS } from "../../../lib/ease";
import { useHoverCapable } from "../../../lib/hooks/use-hover-capable";
import { cn } from "../../../lib/utils";
import { DEFAULT_INTEGRATIONS, type IntegrationItem } from "./integration-data";
import { IntegrationMark } from "./integration-mark";

const BENEFITS = [
  "Bring updates into one place",
  "Keep context attached to the work",
  "Choose what each connection can access",
] as const;

export type IntegrationsLedgerProps = {
  eyebrow?: string;
  title?: string;
  description?: string;
  integrations?: readonly IntegrationItem[];
  benefits?: readonly string[];
  actionLabel?: (integration: IntegrationItem) => string;
  actionHint?: string;
  onAction?: (integration: IntegrationItem) => void;
  showMarks?: boolean;
  className?: string;
};

export function IntegrationsLedger({
  eyebrow = "Your tools, in sync",
  title = "Less switching. More momentum.",
  description = "Connect the apps behind your best work without changing how your team already works.",
  integrations = DEFAULT_INTEGRATIONS,
  benefits = BENEFITS,
  actionLabel = (integration) => integration.installed ? "Manage connection" : "Connect app",
  actionHint = "Setup takes about a minute",
  onAction,
  showMarks = true,
  className,
}: IntegrationsLedgerProps) {
  const reduce = useReducedMotion();
  const canHover = useHoverCapable();
  const [selectedId, setSelectedId] = useState(integrations[0]?.id ?? "");
  const selected =
    integrations.find((integration) => integration.id === selectedId) ??
    integrations[0];

  return (
    <section
      className={cn("w-full bg-background px-4 py-20 sm:px-8", className)}
    >
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: reduce ? 0 : 0.65, ease: EASE_OUT }}
        className="mx-auto max-w-6xl border border-dashed border-border"
      >
        <header className="grid gap-8 border-border border-b [border-bottom-style:dashed] px-5 py-8 sm:px-8 sm:py-10 lg:grid-cols-[1fr_0.75fr] lg:items-end">
          <div>
            <p className="font-display text-xs font-medium text-muted-foreground uppercase tracking-[0.14em]">
              {eyebrow}
            </p>
            <h2 className="mt-4 max-w-2xl text-balance font-semibold text-4xl text-foreground tracking-[-0.045em] sm:text-5xl">
              {title}
            </h2>
          </div>
          <p className="max-w-lg text-pretty text-base text-muted-foreground leading-7 lg:justify-self-end">
            {description}
          </p>
        </header>

        {selected ? <div className="grid lg:grid-cols-[0.92fr_1.08fr]">
          <div className="flex min-h-[500px] flex-col justify-between border-border border-b [border-bottom-style:dashed] p-5 sm:p-8 lg:border-r lg:border-b-0 lg:[border-right-style:dashed]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={selected.id}
                initial={
                  reduce ? false : { opacity: 0, y: 10, filter: "blur(4px)" }
                }
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={
                  reduce
                    ? undefined
                    : { opacity: 0, y: -8, filter: "blur(4px)" }
                }
                transition={reduce ? { duration: 0 } : SPRING_PANEL}
              >
                <div className={cn("flex items-center gap-4", showMarks ? "justify-between" : "justify-end")}>
                  {showMarks ? (
                    <IntegrationMark
                      integration={selected}
                      className="size-14 rounded-none bg-muted"
                    />
                  ) : null}
                  <span className="font-medium text-muted-foreground text-xs tabular-nums">
                    {String(
                      integrations.findIndex(
                        (integration) => integration.id === selected.id,
                      ) + 1,
                    ).padStart(2, "0")}{" "}
                    / {String(integrations.length).padStart(2, "0")}
                  </span>
                </div>

                <p className="mt-8 font-semibold text-3xl text-foreground tracking-[-0.04em]">
                  {selected.name}
                </p>
                <p className="mt-3 max-w-sm text-muted-foreground leading-7">
                  {selected.description}
                </p>

                <div className="mt-8 space-y-3">
                  {benefits.map((benefit, index) => (
                    <motion.div
                      key={benefit}
                      initial={reduce ? false : { opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        duration: reduce ? 0 : 0.45,
                        delay: reduce ? 0 : 0.08 + index * 0.06,
                        ease: EASE_OUT,
                      }}
                      className="flex items-center gap-3 text-foreground text-sm"
                    >
                      <span className="grid size-6 shrink-0 place-items-center bg-muted">
                        <Check className="size-3.5 text-muted-foreground" />
                      </span>
                      {benefit}
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Button className="rounded-none" onClick={() => onAction?.(selected)} variant={selected.installed ? "secondary" : "primary"}>
                {actionLabel(selected)}
                <ArrowUpRight className="size-4" />
              </Button>
              <span className="text-muted-foreground text-xs">
                {actionHint}
              </span>
            </div>
          </div>

          <div>
            {integrations.map((integration, index) => {
              const active = integration.id === selected.id;

              return (
                <motion.button
                  key={integration.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedId(integration.id)}
                  initial={reduce ? false : { opacity: 0, x: 12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  whileHover={
                    reduce || !canHover ? undefined : { x: active ? 0 : 4 }
                  }
                  whileTap={reduce ? undefined : { scale: 0.995 }}
                  transition={{
                    ...SPRING_PRESS,
                    delay: reduce ? 0 : index * 0.04,
                  }}
                  className={cn(
                    "group relative flex min-h-[86px] w-full items-center gap-4 border-border border-b [border-bottom-style:dashed] px-5 text-left transition-colors last:border-b-0 sm:px-7",
                    active ? "bg-muted/65" : "bg-background hover:bg-muted/35",
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId="integration-ledger-active"
                      transition={reduce ? { duration: 0 } : SPRING_PANEL}
                      className="absolute inset-0 bg-muted/65"
                    />
                  ) : null}

                  <span className="relative font-medium text-muted-foreground text-xs tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {showMarks ? (
                    <IntegrationMark
                      integration={integration}
                      className="relative size-10 rounded-none bg-background"
                    />
                  ) : null}
                  <span className="relative min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold text-foreground">
                        {integration.name}
                      </span>
                      {integration.installed ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
                          <Link2 className="size-3" />
                          Live
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block truncate text-muted-foreground text-xs">
                      {integration.category}
                    </span>
                  </span>
                  <ArrowUpRight
                    className={cn(
                      "relative size-4 shrink-0 text-muted-foreground transition-transform",
                      active && "rotate-45 text-foreground",
                    )}
                  />
                </motion.button>
              );
            })}
          </div>
        </div> : (
          <p className="px-5 py-10 text-muted-foreground sm:px-8">No entries available yet.</p>
        )}
      </motion.div>
    </section>
  );
}
