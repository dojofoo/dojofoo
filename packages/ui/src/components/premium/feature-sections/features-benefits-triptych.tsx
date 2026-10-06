"use client";

import {
  CheckWaves as BadgeCheck,
  Code as Braces,
  Compass,
  Check,
  ArrowRight,
  LayersThree as GalleryVerticalEnd,
  Sparkles as Brain,
  ChatMessages as MessagesSquare,
  MousePointerClick,
} from "@mynaui/icons-react";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
} from "motion/react";
import { lazy, Suspense, type ReactNode, useEffect, useRef, useState } from "react";
import { EASE_IN_OUT, EASE_OUT } from "../../../lib/ease";
import effectLogo from "../../../assets/effect.svg";
import pydanticAiLogo from "../../../assets/pydantic-ai.svg";
import { cn } from "../../../lib/utils";

export type BenefitsTriptychItem = {
  title: string;
  description: string;
  visual?: ReactNode;
};

export type FeaturesBenefitsTriptychProps = {
  eyebrow?: string;
  title?: string;
  description?: string;
  items?: BenefitsTriptychItem[];
  className?: string;
};

const DEFAULT_ITEMS: BenefitsTriptychItem[] = [
  {
    title: "Start with the right block",
    description:
      "Explore polished heroes, pricing, features, and calls to action without rebuilding the foundation.",
  },
  {
    title: "Compose a complete page",
    description:
      "Combine sections that already share thoughtful responsive behavior, motion, and theme conventions.",
  },
  {
    title: "Make every detail yours",
    description:
      "Install real React source, then reshape the structure, styling, and interactions for your product.",
  },
];

const LiquidLines = lazy(() => import("../../react-bits/liquid-lines"));

export function FeaturesBenefitsTriptych({
  eyebrow = "Built for momentum",
  title = "From first section to finished page.",
  description = "A premium component system for teams that want to move quickly without giving up ownership or polish.",
  items = DEFAULT_ITEMS,
  className,
}: FeaturesBenefitsTriptychProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { amount: 0.2 });
  const [phase, setPhase] = useState(0);
  const visibleItems = items.slice(0, 3);

  useEffect(() => {
    if (reduceMotion || !isInView) return;

    const interval = window.setInterval(
      () => setPhase((current) => (current + 1) % 3),
      3600,
    );

    return () => window.clearInterval(interval);
  }, [isInView, reduceMotion]);

  return (
    <section
      ref={sectionRef}
      className={cn(
        "w-full overflow-hidden bg-background px-4 py-20 text-foreground sm:px-8 sm:py-24 lg:py-28",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <motion.p
            initial={reduceMotion ? false : { opacity: 0 }}
            whileInView={reduceMotion ? undefined : { opacity: 1 }}
            viewport={{ once: true, margin: "-48px" }}
            transition={
              reduceMotion ? undefined : { duration: 0.45, ease: EASE_OUT }
            }
            className="font-display text-xs font-medium text-muted-foreground uppercase tracking-[0.14em]"
          >
            {eyebrow}
          </motion.p>
          <motion.h2
            initial={
              reduceMotion
                ? false
                : {
                    opacity: 0,
                    transform: "translateY(18px)",
                    filter: "blur(8px)",
                  }
            }
            whileInView={
              reduceMotion
                ? undefined
                : {
                    opacity: 1,
                    transform: "translateY(0px)",
                    filter: "blur(0px)",
                  }
            }
            viewport={{ once: true, margin: "-48px" }}
            transition={
              reduceMotion
                ? undefined
                : { duration: 0.65, delay: 0.08, ease: EASE_OUT }
            }
            className="mt-5 text-balance font-medium text-4xl text-foreground leading-none tracking-tight"
          >
            {title}
          </motion.h2>
          <motion.p
            initial={reduceMotion ? false : { opacity: 0 }}
            whileInView={reduceMotion ? undefined : { opacity: 1 }}
            viewport={{ once: true, margin: "-48px" }}
            transition={
              reduceMotion
                ? undefined
                : { duration: 0.5, delay: 0.2, ease: EASE_OUT }
            }
            className="mx-auto mt-5 max-w-2xl text-pretty text-muted-foreground text-sm leading-7 sm:text-base"
          >
            {description}
          </motion.p>
        </div>

        <div className="mt-14 grid overflow-hidden border border-dashed border-border md:grid-cols-3 lg:mt-16">
          {visibleItems.map((item, index) => (
            <motion.article
              key={`${item.title}-${index}`}
              initial={
                reduceMotion
                  ? false
                  : {
                      opacity: 0,
                      transform: "translateY(24px)",
                    }
              }
              whileInView={
                reduceMotion
                  ? undefined
                  : {
                      opacity: 1,
                      transform: "translateY(0px)",
                    }
              }
              viewport={{ once: true, margin: "-64px" }}
              transition={
                reduceMotion
                  ? undefined
                  : {
                      duration: 0.6,
                      delay: index * 0.08,
                      ease: EASE_OUT,
                    }
              }
              className={cn(
                "flex min-w-0 flex-col border-border",
                index < visibleItems.length - 1 &&
                  "border-b [border-bottom-style:dashed] md:border-r md:border-b-0 md:[border-right-style:dashed]",
              )}
            >
              <div className="flex min-h-48 flex-col px-6 py-7 sm:px-8 md:min-h-56 md:px-7 lg:px-8">
                <span className="w-fit bg-muted px-2.5 py-1.5 font-mono text-muted-foreground text-xs tabular-nums tracking-[0.16em]">
                  0{index + 1}
                </span>
                <h3 className="mt-auto pt-10 font-medium text-xl leading-tight tracking-[-0.025em]">
                  {item.title}
                </h3>
                <p className="mt-3 max-w-sm text-pretty text-muted-foreground text-sm leading-6">
                  {item.description}
                </p>
              </div>

              <div
                aria-hidden="true"
                className="relative isolate mt-auto h-[25rem] w-full shrink-0 overflow-hidden border-border border-t [border-top-style:dashed]"
              >
                <TriptychField index={index} active={isInView} reduceMotion={reduceMotion} />
                <div className="absolute inset-0 flex items-end justify-center px-5 sm:px-8 md:px-5 lg:px-8">
                  {item.visual ?? (
                    <DefaultVisual
                      index={index}
                      phase={phase}
                      reduceMotion={reduceMotion}
                    />
                  )}
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

function TriptychField({
  index,
  active,
  reduceMotion,
}: {
  index: number;
  active: boolean;
  reduceMotion: boolean;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 bg-[color-mix(in_srgb,var(--surface-1)_40%,black)]">
      {active && (
        <Suspense fallback={null}>
          <LiquidLines
            variant="pixel-lift"
            timeOffset={index * 12}
            speed={reduceMotion ? 0 : 0.4}
          />
        </Suspense>
      )}
    </div>
  );
}

function DefaultVisual({
  index,
  phase,
  reduceMotion,
}: {
  index: number;
  phase: number;
  reduceMotion: boolean;
}) {
  if (index === 1) {
    return <CompositionPanel phase={phase} reduceMotion={reduceMotion} />;
  }

  if (index === 0) {
    return <SourcePanel phase={phase} reduceMotion={reduceMotion} />;
  }

  return <LibraryPanel phase={phase} />;
}

const LIBRARY_ITEMS = [
  { label: "Katas", icon: Braces },
  { label: "Interactive", icon: MousePointerClick },
  { label: "Mentor", icon: MessagesSquare },
  { label: "Explorative", icon: Compass },
] as const;

function LibraryPanel({ phase }: { phase: number }) {
  return (
    <div className="relative -mb-7 w-full max-w-sm overflow-hidden border border-dashed border-b-0 border-border/80 bg-background/70 p-5 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-foreground/10">
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-sm text-foreground">
            Course Types
          </p>
          <p className="mt-1 text-muted-foreground text-xs">Authorable</p>
        </div>
        <span className="border border-dashed border-border/60 bg-background/55 px-2.5 py-1 font-mono text-muted-foreground text-xs tabular-nums backdrop-blur-md">
          {LIBRARY_ITEMS.length} types
        </span>
      </div>

      <div className="relative mt-5 grid grid-cols-2 gap-2">
        {LIBRARY_ITEMS.map(({ label, icon: Icon }, itemIndex) => {
          const active = itemIndex === phase;

          return (
            <div
              key={label}
              className={cn(
                "min-h-24 border border-dashed p-3 transition-colors duration-500",
                active
                  ? "border-transparent bg-foreground/5 text-foreground backdrop-blur-lg"
                  : "border-border/60 bg-background/35 text-foreground backdrop-blur-md",
              )}
            >
              <Icon className="size-4" />
              <p className="mt-6 font-medium text-xs">{label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PAGE_SECTIONS = [
  { label: "Effect-ts", logo: effectLogo },
  { label: "Pydantic AI", logo: pydanticAiLogo },
  { label: "Build an LLM", logo: null },
] as const;

function CompositionPanel({
  phase,
  reduceMotion,
}: {
  phase: number;
  reduceMotion: boolean;
}) {
  return (
    <div className="relative -mb-7 w-full max-w-sm overflow-hidden border border-dashed border-b-0 border-border/80 bg-background/70 p-5 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-foreground/10">
      <div className="relative flex items-center justify-between gap-4 border-border/50 border-b [border-bottom-style:dashed] pb-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-full bg-muted text-foreground">
            <GalleryVerticalEnd className="size-3.5" />
          </span>
          <div>
            <p className="font-medium text-foreground text-sm">Certificates</p>
            <p className="text-muted-foreground text-xs">3 courses</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 font-mono text-muted-foreground text-xs uppercase tracking-wider">
          <span className="size-1.5 rounded-full bg-foreground" />
          Online
        </span>
      </div>

      <div className="relative mt-4 space-y-2.5">
        {PAGE_SECTIONS.map(({ label, logo }, itemIndex) => {
          const active = itemIndex === phase;

          return (
            <motion.div
              key={label}
              animate={{
                transform:
                  active && !reduceMotion
                    ? "translateX(3px)"
                    : "translateX(0px)",
              }}
              transition={{ duration: 0.4, ease: EASE_IN_OUT }}
              className={cn(
                "flex items-center gap-3 border border-dashed border-border/60 px-3.5 py-3 transition-colors duration-500",
                active
                  ? "border-transparent bg-foreground/5 backdrop-blur-lg"
                  : "bg-background/35 backdrop-blur-md",
              )}
            >
              {logo ? (
                <img src={logo} alt="" className="size-4 shrink-0 object-contain" />
              ) : (
                <Brain aria-hidden="true" className="size-4 shrink-0 text-foreground" />
              )}
              <span className="font-medium text-foreground text-xs">
                {label}
              </span>
              <BadgeCheck
                className={cn(
                  "ml-auto size-3.5 text-muted-foreground transition-opacity duration-300",
                  active ? "opacity-100" : "opacity-35",
                )}
              />
            </motion.div>
          );
        })}
      </div>

      <div className="relative mt-4 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">100% complete</span>
        <span className="font-medium text-foreground tabular-nums">
          {phase + 1} / 3 ready
        </span>
      </div>
    </div>
  );
}

const KATA_LESSONS = [
  {
    title: "Normalize",
    code: "const handle =\n  normalize(name)",
    passed: true,
  },
  {
    title: "Validate",
    code: "const result =\n  validate(input)",
    passed: true,
  },
  {
    title: "Summarize",
    code: "const summary =\n  summarize(rows)",
    passed: false,
  },
] as const;

function SourcePanel({
  phase,
  reduceMotion,
}: {
  phase: number;
  reduceMotion: boolean;
}) {
  const lesson = KATA_LESSONS[phase];
  return (
    <div className="relative -mb-7 w-full max-w-sm overflow-hidden border border-dashed border-b-0 border-border/80 bg-background/70 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-foreground/10">
      <div className="relative flex items-center justify-between border-border/50 border-b [border-bottom-style:dashed] px-4 py-3.5">
        <div className="flex items-center gap-2">
          <Braces className="size-4 text-foreground" />
          <span className="font-medium text-foreground text-xs">
            Kata Course
          </span>
        </div>
        <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <BadgeCheck className="size-3.5" />
          2 / 3 passed
        </span>
      </div>

      <div className="relative grid min-h-56 grid-cols-[7rem_1fr] gap-2 p-2">
        <div className="border border-dashed border-border/60 bg-background/25 py-2 backdrop-blur-md">
          {KATA_LESSONS.map((item, lessonIndex) => (
            <div
              key={item.title}
              className={cn(
                "mx-1 flex items-center gap-1.5 border border-dashed px-1 py-2 text-xs transition-colors duration-500",
                lessonIndex === phase
                  ? "border-border/60 bg-background/70 backdrop-blur-md"
                  : "border-transparent",
                "text-foreground",
              )}
            >
              <span className="font-mono text-[10px]">0{lessonIndex + 1}</span>
              <span className="truncate">{item.title}</span>
              {item.passed ? <Check className="ml-auto size-3 shrink-0 text-green-500" /> : <ArrowRight className="ml-auto size-3 shrink-0" />}
            </div>
          ))}
        </div>

        <div className="min-w-0 overflow-hidden border border-dashed border-border/60 bg-background/25 px-4 py-4 text-xs leading-5 backdrop-blur-md">
          <div className="grid">
            <AnimatePresence initial={false}>
              <motion.div
                key={phase}
                initial={
                  reduceMotion
                    ? false
                    : {
                        opacity: 0,
                        transform: "translateY(3px)",
                      }
                }
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                exit={
                  reduceMotion
                    ? undefined
                    : {
                        opacity: 0,
                        transform: "translateY(-3px)",
                      }
                }
                transition={{ duration: 0.3, ease: EASE_IN_OUT }}
                className="col-start-1 row-start-1"
              >
                <pre className="whitespace-pre-wrap font-mono text-xs leading-5 text-foreground"><code>{lesson.code}</code></pre>
                <span className={cn("mt-3 inline-flex items-center gap-1", lesson.passed ? "text-green-500" : "text-muted-foreground")}>
                  {lesson.passed ? <Check className="size-3" /> : <ArrowRight className="size-3" />}
                  {lesson.passed ? "Tests passed" : "Ongoing"}
                </span>
              </motion.div>
            </AnimatePresence>
          </div>

        </div>
      </div>
    </div>
  );
}
