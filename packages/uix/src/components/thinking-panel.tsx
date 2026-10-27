import { useId, useState, type ReactNode } from "react";

/** Shared thinking frame; the owner supplies actual activity and completion. */
export function ThinkingPanel({ title, children, who, done, className, open: controlledOpen, onOpenChange,
  defaultOpen = true, collapsible = true, label,
}: {
  title: ReactNode;
  children?: ReactNode;
  who?: string;
  done?: boolean;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  collapsible?: boolean;
  label?: string;
}) {
  const id = useId();
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const open = controlledOpen ?? ownOpen;
  const chevron = <span className="ui-think__chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M18 9s-4.419 6-6 6c-1.581 0-6-6-6-6" /></svg></span>;
  return <div className={["ui-think", className].filter(Boolean).join(" ")} data-done={done || undefined}>
    <style href="ui-thinking-state" precedence="default">{css}</style>
    <button type="button" className="ui-think__head" data-who={who ? "" : undefined} aria-expanded={open}
      aria-controls={id} disabled={!collapsible} onClick={() => { if (controlledOpen === undefined) setOwnOpen(!open); onOpenChange?.(!open); }}>
      {who ? <span className="ui-think__avatar" aria-hidden="true" /> : chevron}
      <span className="ui-think__title" key={done ? "done" : "busy"}>{who && <b className="ui-think__who">{who}</b>}{title}</span>
      {who && chevron}
    </button>
    <div id={id} className="ui-think__body" data-open={open} inert={!open} aria-hidden={!open} role={label ? "region" : undefined} aria-label={label}>{children}</div>
  </div>;
}

const css = /* css */ `
/* Colors and motion as variables – override them on .ui-think (see Theming in the docs) */
.ui-think {
  --ui-tk-ink: #171717;
  --ui-tk-text: #525252;
  --ui-tk-muted: #8a8a8a;
  --ui-tk-line: #e5e5e5;
  --ui-tk-chip: #f0f0f0;
  --ui-tk-done: #2f6bff;
  --ui-tk-shine: rgba(255, 255, 255, 0.82);
  --ui-tk-dot: #b5b5b5;
  --ui-tk-chip-hover: #e6e6e6;
  --ui-tk-tip-text: #fff;
  --ui-tk-focus: rgba(23, 23, 23, 0.22);
  --ui-tk-ease: cubic-bezier(0.22, 1, 0.36, 1);

  width: 100%;
  max-width: 440px;
  font-family: var(--ui-font, "Inter Variable", "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  font-size: 14px;
  line-height: 1.45;
  color: var(--ui-tk-text);
  -webkit-font-smoothing: antialiased;
}
.ui-think *,
.ui-think *::before,
.ui-think *::after {
  box-sizing: border-box;
}
.ui-think :is(.ui-think__chevron, .ui-think__node, .ui-think__favicon) > svg {
  display: block;
  width: 100%;
  height: 100%;
}

/* Header: chevron + "Thinking 4s" / "Worked for 18s" */
.ui-think__head {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 0 -4px;
  padding: 4px 8px 4px 4px;
  border: 0;
  border-radius: calc(8px * var(--squircle-factor, 1));
  background: none;
  font: inherit;
  font-size: 15px;
  color: var(--ui-tk-muted);
  cursor: pointer;
  transition: background-color 160ms ease, color 160ms ease;
}
.ui-think__head:hover {
  background: var(--ui-tk-chip);
  color: var(--ui-tk-text);
}
.ui-think__head:focus-visible {
  outline: 2px solid var(--ui-tk-focus);
  outline-offset: 2px;
}
.ui-think__chevron {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  transform: rotate(-90deg);
  transition: transform 260ms var(--ui-tk-ease);
}
.ui-think__head[aria-expanded="true"] .ui-think__chevron {
  transform: none;
}
.ui-think__title {
  display: inline-flex;
  gap: 8px;
  animation: ui-think-in 420ms var(--ui-tk-ease) both;
}
.ui-think__time {
  font-variant-numeric: tabular-nums;
}
/* With who: their dot – the size of the chevron, in the theme's brand color – then the name in the sentence */
.ui-think__head[data-who] .ui-think__title { gap: 0.3em; }
.ui-think__avatar { flex: none; width: 18px; height: 18px; border-radius: 50%; corner-shape: round; background: var(--brand, var(--ui-tk-done)); }
.ui-think__who { font-weight: 550; font-variation-settings: "opsz" 18; color: var(--ui-tk-ink); }

/* Body collapses smoothly */
.ui-think__body {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows 360ms var(--ui-tk-ease), opacity 260ms ease;
}
.ui-think__body[data-open="false"] {
  grid-template-rows: 0fr;
  opacity: 0;
}
.ui-think__body > * { min-height: 0; }
.ui-think__body[data-open="false"] > * {
  overflow: hidden;
}
.ui-think__list {
  min-height: 0;
  /* clips only while collapsed, so tooltips can reach out when open */
  overflow: visible;
  margin: 0;
  padding: 10px 0 0;
  list-style: none;
}

/* Timeline: icon column with a line growing down to the next node */
.ui-think__item {
  position: relative;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 12px;
  padding-bottom: 12px;
  animation: ui-think-in 520ms var(--ui-tk-ease) both;
}
.ui-think__item:not(:last-child)::before {
  content: "";
  position: absolute;
  left: 9.5px;
  top: 24px;
  bottom: 2px;
  width: 1px;
  background: var(--ui-tk-line);
  transform-origin: top;
  animation: ui-think-line 520ms var(--ui-tk-ease) both;
}
.ui-think__node {
  display: grid;
  place-items: center;
  width: 20px;
  height: 21px;
}
.ui-think__globe {
  width: 18px !important;
  height: 18px !important;
  fill: none;
  stroke: var(--ui-tk-muted);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ui-think__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%; corner-shape: round;
  background: var(--ui-tk-dot);
  transition: background-color 300ms ease, transform 300ms ease;
}
.ui-think__item[data-active] .ui-think__dot {
  background: var(--ui-tk-ink);
  animation: ui-think-pulse 1.2s ease-in-out infinite;
}
.ui-think__check {
  width: 18px !important;
  height: 18px !important;
  animation: ui-think-pop 460ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.ui-think__check circle {
  fill: var(--ui-tk-done);
}
.ui-think__check path {
  fill: none;
  stroke: #fff;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 14;
  stroke-dashoffset: 14;
  animation: ui-think-draw 360ms var(--ui-tk-ease) 180ms forwards;
}

.ui-think__content {
  min-width: 0;
  padding-top: 0.5px;
}
.ui-think__label {
  display: inline-block;
  color: var(--ui-tk-muted);
  transition: color 300ms ease;
}
.ui-think__item[data-active] .ui-think__label,
.ui-think__item[data-kind="done"] .ui-think__label {
  color: var(--ui-tk-text);
}

/* Sources: chips pop in one after another */
.ui-think__sources {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.ui-think__source {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  height: 28px;
  padding: 0 10px 0 6px;
  border-radius: calc(8px * var(--squircle-factor, 1));
  background: var(--ui-tk-chip);
  font-size: 13px;
  color: var(--ui-tk-ink);
  animation: ui-think-chip 420ms var(--ui-tk-ease) both;
}
a.ui-think__source,
.ui-think__more {
  position: relative;
  border: 0;
  font: inherit;
  font-size: 13px;
  text-decoration: none;
  cursor: pointer;
  transition: background-color 160ms ease, color 160ms ease;
}
a.ui-think__source:hover {
  background: var(--ui-tk-chip-hover);
}
.ui-think__more {
  padding: 0 10px;
  background: none;
  color: var(--ui-tk-muted);
}
.ui-think__more:hover {
  background: var(--ui-tk-chip);
  color: var(--ui-tk-ink);
}
a.ui-think__source:focus-visible,
.ui-think__more:focus-visible {
  outline: 2px solid var(--ui-tk-focus);
  outline-offset: 2px;
}

/* Tooltip above the chip */
.ui-think__tip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  z-index: 2;
  padding: 4px 8px;
  border-radius: calc(6px * var(--squircle-factor, 1));
  background: var(--ui-tk-ink);
  color: var(--ui-tk-tip-text);
  font-size: 12px;
  line-height: 1.3;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transform: translate(-50%, 4px);
  transition: opacity 140ms ease, transform 200ms var(--ui-tk-ease);
}
.ui-think__source:hover .ui-think__tip,
.ui-think__source:focus-visible .ui-think__tip {
  opacity: 1;
  transform: translate(-50%, 0);
  transition-delay: 250ms;
}

.ui-think__source[data-count] {
  padding: 0 10px;
  background: none;
  color: var(--ui-tk-muted);
}
.ui-think__source-label {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.ui-think__favicon {
  display: grid;
  place-items: center;
  flex: none;
  width: 18px;
  height: 18px;
  border-radius: calc(5px * var(--squircle-factor, 1));
  overflow: hidden;
}

/* Shimmer over the active label, like the loading states elsewhere */
.ui-think__shimmer {
  position: relative;
}
.ui-think__shimmer::after {
  content: attr(data-text);
  content: attr(data-text) / "";
  position: absolute;
  inset: 0;
  white-space: nowrap;
  color: transparent;
  background: linear-gradient(90deg, transparent 38%, var(--ui-tk-shine) 50%, transparent 62%) 100% 0 / 300% 100%
    no-repeat;
  -webkit-background-clip: text;
  background-clip: text;
  animation: ui-think-sweep 1.6s linear infinite;
  pointer-events: none;
}

@keyframes ui-think-in {
  from { opacity: 0; transform: translateY(6px); filter: blur(3px); }
  to { opacity: 1; transform: none; filter: none; }
}
@keyframes ui-think-line {
  from { transform: scaleY(0); }
  to { transform: scaleY(1); }
}
@keyframes ui-think-chip {
  from { opacity: 0; transform: translateY(4px) scale(0.92); }
  to { opacity: 1; transform: none; }
}
@keyframes ui-think-pulse {
  50% { transform: scale(0.7); opacity: 0.5; }
}
@keyframes ui-think-pop {
  0% { transform: scale(0.5); }
  60% { transform: scale(1.12); }
  100% { transform: scale(1); }
}
@keyframes ui-think-draw {
  to { stroke-dashoffset: 0; }
}
@keyframes ui-think-sweep {
  from { background-position: 100% 0; }
  to { background-position: 0% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .ui-think *,
  .ui-think *::before,
  .ui-think *::after {
    animation-duration: 1ms !important;
    animation-delay: 0ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }
  .ui-think__shimmer::after {
    display: none;
  }
  .ui-think__check path {
    stroke-dashoffset: 0;
  }
}

/* Dark mode: follows a .dark class or data-theme="dark" on any ancestor, e.g. <html> */
:where(.dark, [data-theme="dark"]) .ui-think {
  --ui-tk-ink: #ededed;
  --ui-tk-text: #c4c4c4;
  --ui-tk-muted: #8f8f8f;
  --ui-tk-line: rgba(255, 255, 255, 0.1);
  --ui-tk-chip: #2a2a2d;
  --ui-tk-chip-hover: #313135;
  --ui-tk-shine: rgba(255, 255, 255, 0.95);
  --ui-tk-dot: #5c5c61;
  --ui-tk-tip-text: #121213;
  --ui-tk-focus: rgba(255, 255, 255, 0.3);
}
`;
