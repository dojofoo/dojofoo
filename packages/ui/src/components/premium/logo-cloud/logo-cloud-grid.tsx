"use client";

import {
  Aperture,
  Atom,
  Box,
  Circle,
  Command,
  Diamond,
  Diamond as Gem,
  Hexagon,
  LayersTwo as Layers,
  type Icon as MynaIcon,
  Octagon,
  Planet as Orbit,
  Triangle,
} from "@mynaui/icons-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { EASE_OUT } from "../../../lib/ease";
import { cn } from "../../../lib/utils";

export type GridLogo = {
  name: string;
  icon?: MynaIcon;
  imageSrc?: string;
  imageClassName?: string;
  showName?: boolean;
};

export type LogoCloudGridProps = {
  title?: string;
  subtext?: ReactNode;
  /** Pool to roll through; the grid shows `slots` at a time. */
  logos?: GridLogo[];
  slots?: number;
  className?: string;
};

const DEFAULT_LOGOS: GridLogo[] = [
  { name: "Northwind", icon: Hexagon },
  { name: "Relay", icon: Triangle },
  { name: "Cortex", icon: Aperture },
  { name: "Ledger", icon: Box },
  { name: "Beacon", icon: Gem },
  { name: "Stacks", icon: Command },
  { name: "Mosaic", icon: Octagon },
  { name: "Pulse", icon: Circle },
  { name: "Quartz", icon: Diamond },
  { name: "Vellum", icon: Layers },
  { name: "Helix", icon: Atom },
  { name: "Atlas", icon: Orbit },
];

export function LogoCloudGrid({
  title = "The fastest teams build with beUI",
  subtext = "From seed-stage startups to platform teams shipping at scale.",
  logos = DEFAULT_LOGOS,
  slots = 8,
  className,
}: LogoCloudGridProps) {
  const reduce = useReducedMotion();
  const count = Math.min(slots, logos.length);

  // The whole window shifts at once, so every cell rolls together each tick.
  const [offset, setOffset] = useState(0);
  const pausedRef = useRef(false);
  const cells = Array.from(
    { length: count },
    (_, i) => (offset + i) % logos.length,
  );

  useEffect(() => {
    if (reduce || logos.length <= count) return;
    const id = setInterval(() => {
      if (pausedRef.current) return;
      setOffset((o) => (o + count) % logos.length);
    }, 3400);
    return () => clearInterval(id);
  }, [reduce, logos.length, count]);

  return (
    <section className={cn("w-full px-4 py-16 sm:px-8", className)}>
      <div className="mx-auto w-full max-w-5xl">
        {title ? (
          <div className="mx-auto max-w-xl text-center">
            <h2 className="text-balance text-2xl text-foreground leading-tight sm:text-3xl">
              {title}
            </h2>
            {subtext ? (
              <p className="mt-3 text-pretty text-muted-foreground text-sm leading-7 sm:text-base">
                {subtext}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Divider grid — each cell rolls to a new logo on a loop. */}
        <div
          className={cn(
            "mt-10 grid grid-cols-2 overflow-hidden border border-dashed border-border/60",
            count === 3 || count === 6 ? "sm:grid-cols-3" : "sm:grid-cols-4",
          )}
          onPointerEnter={() => {
            pausedRef.current = true;
          }}
          onPointerLeave={() => {
            pausedRef.current = false;
          }}
        >
          {cells.map((poolIndex, i) => (
            <motion.div
              // biome-ignore lint/suspicious/noArrayIndexKey: slots are fixed positions.
              key={i}
              initial={reduce ? false : { opacity: 0, y: 12 }}
              whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={
                reduce
                  ? undefined
                  : {
                      duration: 0.4,
                      ease: EASE_OUT,
                      delay: Math.min(i * 0.05, 0.3),
                    }
              }
              className="group -mt-px -ml-px relative flex h-[5.5rem] items-center justify-center overflow-hidden border-border/60 border-t border-l [border-top-style:dashed] [border-left-style:dashed] transition-colors hover:bg-muted/40"
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={poolIndex}
                  initial={
                    reduce ? false : { y: 16, opacity: 0, filter: "blur(7px)" }
                  }
                  animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                  exit={
                    reduce
                      ? { opacity: 0 }
                      : { y: -16, opacity: 0, filter: "blur(7px)" }
                  }
                  transition={
                    reduce ? { duration: 0 } : { duration: 0.7, ease: EASE_OUT }
                  }
                  className="flex items-center gap-2.5 text-muted-foreground/75 transition-colors group-hover:text-foreground"
                >
                  <LogoIcon logo={logos[poolIndex]} />
                  {logos[poolIndex]?.showName !== false ? (
                    <span className="font-semibold text-lg tracking-tight">
                      {logos[poolIndex]?.name}
                    </span>
                  ) : null}
                </motion.span>
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LogoIcon({ logo }: { logo?: GridLogo }) {
  if (logo?.imageSrc) {
    return (
      // biome-ignore lint/performance/noImgElement: remote brand asset supplied by the template
      <img
        src={logo.imageSrc}
        alt=""
        aria-hidden
        className={cn("size-6 object-contain", logo.imageClassName)}
      />
    );
  }

  const Icon = logo?.icon;
  if (!Icon) return null;
  return <Icon className="size-5" strokeWidth={1.75} />;
}
