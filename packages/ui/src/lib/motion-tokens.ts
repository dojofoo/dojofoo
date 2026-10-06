export const spring = {
  press:      { type: "spring", stiffness: 650, damping: 26, mass: 0.45 },
  popover:    { type: "spring", stiffness: 380, damping: 26, mass: 0.7 },
  flow:       { type: "spring", stiffness: 320, damping: 24, mass: 0.85 },
  pop:        { type: "spring", stiffness: 420, damping: 24, mass: 0.8 },
  settle:     { type: "spring", stiffness: 260, damping: 22, mass: 0.6 },
  pill:       { type: "spring", stiffness: 390, damping: 26, mass: 0.55 },
  parallax:   { type: "spring", stiffness: 160, damping: 20, mass: 0.7, restDelta: 0.001 },
  mechanical: { type: "spring", stiffness: 950, damping: 18, mass: 0.35 },
  heavy:      { type: "spring", stiffness: 220, damping: 31, mass: 1.2 },
  layout:     { type: "spring", stiffness: 400, damping: 40 },
  morph:      { type: "spring", stiffness: 150, damping: 20, mass: 1 },
} as const;

export const ease = { out: [0.23, 1, 0.32, 1], smooth: [0.25, 1, 0.5, 1], flip: [0.32, 0.72, 0, 1] } as const;

export const duration = { exit: 0.15, swap: 0.2, enter: 0.22 } as const;

export const stagger = { dense: 0.007, list: 0.022, fan: 0.025, stack: 0.045 } as const;

export const reducedSpring = { stiffness: 2000, damping: 200 } as const;
