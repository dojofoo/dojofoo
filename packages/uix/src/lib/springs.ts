// Motion tokens from Fluid Functionalism. Each tier's value is the ENTER transition – a critically damped spring,
// except the largest tier which keeps a little bounce. Its `.exit` is the matching EXIT transition – a plain tween,
// no bounce, one tier quicker – so a dismissal reads as crisp and final rather than replaying the entrance.
//
//   transition={spring.fast}                              // enter
//   exit={{ opacity: 0, transition: spring.fast.exit }}   // leave
//
// The bigger the thing that moves, the slower the spring. Never hand-write a duration – reach for a tier.
// CSS uses the same tiers through --motion-* and --ease-* in styles/fluid.css.
export const spring = {
  /** Hover, fades, tooltips, focus rings */
  fast: { type: "spring" as const, duration: 0.08, bounce: 0, exit: { duration: 0.06 } },
  /** Dropdowns, tabs, short travel, panels that must land exactly */
  moderate: { type: "spring" as const, duration: 0.16, bounce: 0, exit: { duration: 0.12 } },
  /** Dialogs, drawers, large surfaces */
  slow: { type: "spring" as const, duration: 0.24, bounce: 0.12, exit: { duration: 0.16 } },
} as const;

/** Fallback (ms) for deferred-unmount timers that guard an exit tween: the exit plus a 100ms buffer */
export const exitFallbackMs = (tier: { exit: { duration: number } }) => Math.round(tier.exit.duration * 1000) + 100;
