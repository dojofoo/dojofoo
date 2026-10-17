import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { Icon } from "~/components/app-shell";
import { Network } from "~/components/network";
import { Opal } from "~/components/opal";
import { Topography } from "~/components/topography";
import { Waves } from "~/components/waves";
import { Tick02Icon } from "~/lib/icons";
import { cn } from "~/lib/utils";

/*
 * ColorCard – a card in one color: its gradient is drawn from that color alone (lighter at the top left, deeper and a
 * little turned at the bottom right), with the contour map over it when `shader` is on. Its lines always sit the same
 * way, in one scale – whatever the card and wherever it is. `shader` picks what drifts over it: "topography" (the
 * contour map; also `true`), "network" (points joined by lines), "waves" (lines across a rolling sea) or "opal" (rings
 * pushed out by noise):
 *
 *   header   mark (top left: a logo or a name)            figure (top right: a rating, a status)
 *   main     kicker (a small line)  above  title (the name)
 *   footer   label (a small line) above value (a line)     action (bottom right: a button or a tag)
 *            progress (a bar under it all, 0–100)
 *
 * 16px around; 17px for the title, 12.5px for a line, 11px for a small one, 12px at the top right. A rectangle by
 * default, or a square. With onClick the whole card is a button.
 *
 *   <ColorCard color="oklch(0.58 0.2 350)" shader mark={<BrandLogo />} figure="★ 4.9" title="Everyday TypeScript"
 *     label="Updated" value="12 Oct 2026" action={<ColorCardButton>Install</ColorCardButton>} />
 *
 * ColorCardButton is the action as a light button (the theme's own light surface and ink, in either mode),
 * ColorCardTag the same size as a quiet tag (e.g. "Installed"), ColorCardCheck a checkbox's tick (the card inside a
 * label with a checkbox, e.g. picking courses), AddCard the dashed card that adds another.
 */
export type ColorCardProps = {
  /** The one color it is drawn from – any CSS color */
  color: string;
  /** What drifts over it: the contour map ("topography", or true), points joined by lines ("network") or lines across a
      rolling sea ("waves") or rings pushed out by noise ("opal") */
  shader?: boolean | "topography" | "network" | "waves" | "opal";
  /** Another seed, another contour map */
  seed?: number | string;
  mark?: ReactNode;
  figure?: ReactNode;
  kicker?: ReactNode;
  title: ReactNode;
  label?: ReactNode;
  value?: ReactNode;
  action?: ReactNode;
  /** A bar under the footer, 0–100 */
  progress?: number;
  shape?: "rect" | "square";
  onClick?: () => void;
  /** The card's name when it is a button, e.g. with how far you are */
  "aria-label"?: string;
  className?: string;
};

export function ColorCard({ color, shader = false, seed, mark, figure, kicker, title, label, value, action, progress, shape = "rect", onClick, "aria-label": ariaLabel, className }: ColorCardProps) {
  const seedNumber = typeof seed === "string" ? seedOf(seed) : seed ?? seedOf(String(title));
  const face = (
    <span className="ui-card__face">
      <style href="ui-color-card" precedence="default">{css}</style>
      {shader && <CardShader kind={shader === true ? "topography" : shader} seed={seedNumber} className="ui-card__lines" />}
      <span className="ui-card__row ui-card__head">
        <span className="ui-card__mark">{mark}</span>
        <span className="ui-card__figure">{figure}</span>
      </span>
      <span className="ui-card__main">
        {kicker && <span className="ui-card__kicker">{kicker}</span>}
        <b className="ui-card__title">{title}</b>
      </span>
      <span className="ui-card__foot">
        <span className="ui-card__row ui-card__row--end">
          <span className="ui-card__text">
            {label && <span className="ui-card__label">{label}</span>}
            {value && <span className="ui-card__value">{value}</span>}
          </span>
          {action}
        </span>
        {progress !== undefined && <span className="ui-card__bar" aria-hidden="true"><i style={{ width: `${Math.max(progress, 3)}%` }} /></span>}
      </span>
    </span>
  );
  const props = { className: cn("ui-card", className), "data-shape": shape, "data-progress": progress !== undefined || undefined, style: { "--card-color": color } as CSSProperties };
  return onClick
    ? <button type="button" {...props} aria-label={ariaLabel} onClick={onClick}>{face}</button>
    : <article {...props} aria-label={ariaLabel}>{face}</article>;
}

export type CardShaderKind = "topography" | "network" | "waves" | "opal";

/** What drifts over a card – the contour map, the network or the waves – as the cards set it: white lines, screened over
    the colors by the card's own class (ui-card__lines, ui-cf__lines), each kind at its own strength */
export function CardShader({ kind, seed, className }: { kind: CardShaderKind; seed: number; className: string }) {
  if (kind === "network") return <Network className={className} data-kind="network" speed={0.5} scale={2.5} seed={seed} />;
  if (kind === "waves") return <Waves className={className} data-kind="waves" speed={0.6} seed={seed} />;
  if (kind === "opal") return <Opal className={className} data-kind="opal" speed={0.25} seed={seed} />;
  return <Topography className={className} color="#ffffff" interactive={false} speed={0.6} density={0.9} seed={seed} />;
}

/** The card's action as a light button – the theme's own light surface and foreground, on the colors in either mode */
export function ColorCardButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={cn("ui-card__button light", className)} />;
}

/** The card's action as a quiet tag, the button's size – e.g. "Installed" */
export function ColorCardTag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("ui-card__tag", className)}>{children}</span>;
}

/** A checkbox's tick in the action's place – the card sits in a <label> with the (visually hidden) checkbox */
export function ColorCardCheck({ checked }: { checked: boolean }) {
  return (
    <span className="ui-card__check" data-checked={checked || undefined} aria-hidden="true">
      {checked && <Icon icon={Tick02Icon} size={12} stroke={2.6} />}
    </span>
  );
}

/** The dashed card that adds another, the cards' shape and size */
export function AddCard({ icon, title, label, onClick, shape = "rect" }: { icon?: ReactNode; title: string; label?: string; onClick?: () => void; shape?: "rect" | "square" }) {
  return (
    <button type="button" className="ui-card ui-card--add" data-shape={shape} onClick={onClick}>
      <style href="ui-color-card" precedence="default">{css}</style>
      {icon}
      <b>{title}</b>
      {label && <small>{label}</small>}
    </button>
  );
}

const seedOf = (text: string) => [...text].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 9973, 7);

const css = /* css */ `
.ui-card { position: relative; display: grid; aspect-ratio: 1.3; min-width: 0; border-radius: 12px; box-shadow: var(--shadow-3); color: #fff; text-align: left; transition: box-shadow var(--motion-moderate) var(--ease-moderate); }
.ui-card[data-shape="square"] { aspect-ratio: 1; border-radius: 14px; }
button.ui-card:hover { box-shadow: var(--shadow-4); }
button.ui-card:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
/* The gradient from the one color: lighter at the top left, deeper and turned a little at the bottom right */
.ui-card__face {
  position: relative; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(var(--card-edge), 1fr) auto minmax(var(--card-edge), 1fr); gap: 8px; min-width: 0; padding: 16px; overflow: clip; border-radius: inherit;
  background:
    radial-gradient(120% 90% at 0% 0%, oklch(from var(--card-color) calc(l + 0.16) c h / 0.85), transparent 60%),
    linear-gradient(140deg, var(--card-color), oklch(from var(--card-color) calc(l - 0.28) calc(c * 0.6) calc(h + 40)));
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.12);
}
.ui-card__face > :not(.ui-card__lines) { position: relative; }
/* The title always on the card's middle line: the header and the footer each get an equal row around it, the header
   at its top, the footer at its bottom – so a button, a tag or a progress bar below can't push it off center. Both rows
   are at least as tall as the taller of the two (the footer: two lines, 27px; with the bar, 43px), so a long title –
   three lines of a 60-character one – stays centered too: rather than squeeze it, the card grows (its face clips
   rather than hides its overflow, so what it holds sets its least height) */
.ui-card { --card-edge: 27px; }
.ui-card[data-progress] { --card-edge: 43px; }
.ui-card__head { align-self: start; }
.ui-card__foot { align-self: end; }
/* The contour lines: white on black, screened over the colors so only the lines show */
.ui-card__lines { position: absolute; inset: 0; mix-blend-mode: screen; opacity: 0.55; pointer-events: none; }
/* The network draws brighter than the contours, so it stays quieter */
.ui-card__lines[data-kind="network"] { opacity: 0.45; image-rendering: pixelated; }
.ui-card__lines[data-kind="waves"] { opacity: 0.4; }
.ui-card__lines[data-kind="opal"] { opacity: 0.6; }

/* One scale for every line */
.ui-card__row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.ui-card__row--end { align-items: flex-end; }
/* 16px from every edge to what you see, not to a line box: each line of type is trimmed to its letters – the top of its
   capitals to its baseline (text-box) – so a name or a figure starts 16px from the top, a line of the footer sits on
   the bottom padding as a button, a tick or the bar does, and nothing hangs in its own leading. The header aligns its
   tops (a logo, 11px tall, or capitals), the footer its bottoms (baselines, buttons, ticks) */
.ui-card__head { flex: none; align-items: flex-start; }
.ui-card__mark { display: block; font-size: 12px; line-height: 1; font-weight: 600; white-space: nowrap; text-box: trim-both cap alphabetic; }
.ui-card__mark > :is(svg, img, [role="img"]) { display: block; height: 11px; width: auto; color: #fff; }
/* Our logo's box is wider than its drawing (3.19:1 for a 1.84:1 drawing), so at 11px its drawing ran 4px over and under
   it; here its box is the drawing – the same size as before, about 35 by 19px – so its top meets the padding too */
.ui-card__mark > .dojo-brand-logo { height: 19px; aspect-ratio: 2225 / 1212; }
.ui-card__figure { display: block; font-size: 12px; line-height: 1; font-weight: 600; font-variant-numeric: tabular-nums; text-box: trim-both cap alphabetic; }
.ui-card__main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ui-card__kicker { font-size: 11px; line-height: 1.3; opacity: 0.72; }
.ui-card__title { font-size: 17px; line-height: 1.2; font-weight: 600; letter-spacing: -0.015em; text-wrap: balance; }
/* The bar 12px under the footer's baseline; the label's baseline 9px over the value's capitals (as they read untrimmed).
   They clip only sideways, for the ellipsis – so their accents and descenders still show past the trimmed box */
.ui-card__foot { display: grid; gap: 12px; min-width: 0; }
.ui-card__text { display: flex; flex-direction: column; gap: 9px; min-width: 0; }
.ui-card__label { overflow: clip visible; font-size: 11px; line-height: 1; opacity: 0.72; white-space: nowrap; text-overflow: ellipsis; text-box: trim-both cap alphabetic; }
.ui-card__value { overflow: clip visible; font-size: 12.5px; line-height: 1; font-weight: 500; white-space: nowrap; text-overflow: ellipsis; text-box: trim-both cap alphabetic; }
.ui-card__foot > .ui-card__row > :not(.ui-card__text) { flex: none; }
.ui-card__bar { display: block; height: 4px; overflow: hidden; border-radius: 2px; background: rgb(255 255 255 / 0.25); }
.ui-card__bar i { display: block; height: 100%; border-radius: inherit; background: #fff; }

/* Actions, one size: a light button, a quiet tag (scoped to the card, so a surrounding list can't restyle them) */
.ui-card .ui-card__button, .ui-card .ui-card__tag { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 10px; border-radius: 7px; font-size: 12px; font-weight: 550; }
.ui-card .ui-card__button { background: var(--surface-6); color: var(--fluid-foreground); box-shadow: 0 1px 2px rgb(0 0 0 / 0.2); transition: opacity var(--motion-fast) var(--ease-fast), scale var(--motion-fast) var(--ease-fast); }
.ui-card .ui-card__button:hover:not(:disabled) { opacity: 0.9; }
.ui-card .ui-card__button:active:not(:disabled) { scale: 0.96; }
.ui-card .ui-card__button:disabled { opacity: 0.7; }
.ui-card .ui-card__tag { padding: 0 8px; background: rgb(255 255 255 / 0.16); color: #fff; }
/* A checkbox's tick: an outline, filled white with a dark tick once checked */
.ui-card__check { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 6px; box-shadow: inset 0 0 0 1.5px rgb(255 255 255 / 0.8); }
.ui-card__check[data-checked] { background: #fff; box-shadow: none; color: #111; }

/* Adding another: dashed, on the window, the same shape */
.ui-card--add { place-content: center; justify-items: center; gap: 4px; box-shadow: none; outline: 1px dashed var(--line, var(--fluid-hairline)); outline-offset: -1px; color: var(--muted, var(--fluid-muted)); }
.ui-card--add b { color: var(--ink, var(--fluid-foreground)); font-size: 12.5px; font-weight: 550; }
.ui-card--add small { font-size: 11px; }
button.ui-card--add:hover { background: var(--hover, var(--fluid-hover)); box-shadow: none; }
`;
