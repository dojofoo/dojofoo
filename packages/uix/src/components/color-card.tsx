import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { Network } from "~/components/network";
import { Opal } from "~/components/opal";
import { Topography } from "~/components/topography";
import { Waves } from "~/components/waves";
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
 * ColorCardTag the same size as a quiet tag (e.g. "Installed"), AddCard the dashed card that adds another.
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
  const props = { className: cn("ui-card", className), "data-shape": shape, style: { "--card-color": color } as CSSProperties };
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
  position: relative; display: flex; flex-direction: column; justify-content: space-between; gap: 8px; min-width: 0; padding: 16px; overflow: hidden; border-radius: inherit;
  background:
    radial-gradient(120% 90% at 0% 0%, oklch(from var(--card-color) calc(l + 0.16) c h / 0.85), transparent 60%),
    linear-gradient(140deg, var(--card-color), oklch(from var(--card-color) calc(l - 0.28) calc(c * 0.6) calc(h + 40)));
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.12);
}
.ui-card__face > :not(.ui-card__lines) { position: relative; }
/* The contour lines: white on black, screened over the colors so only the lines show */
.ui-card__lines { position: absolute; inset: 0; mix-blend-mode: screen; opacity: 0.55; pointer-events: none; }
/* The network draws brighter than the contours, so it stays quieter */
.ui-card__lines[data-kind="network"] { opacity: 0.45; image-rendering: pixelated; }
.ui-card__lines[data-kind="waves"] { opacity: 0.4; }
.ui-card__lines[data-kind="opal"] { opacity: 0.6; }

/* One scale for every line */
.ui-card__row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.ui-card__row--end { align-items: flex-end; }
/* The header is one 18px line, whatever it holds: a name or a figure sets its 12px type on it, a logo (an image) sits
   11px tall in its middle – its drawn shape runs about 3px past that box, so it fills the line from the padding down */
.ui-card__head { flex: none; height: 18px; }
.ui-card__mark { display: flex; align-items: center; height: 18px; font-size: 12px; line-height: 18px; font-weight: 600; white-space: nowrap; }
.ui-card__mark > :is(svg, img, [role="img"]) { height: 11px; width: auto; color: #fff; }
.ui-card__figure { font-size: 12px; line-height: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
.ui-card__main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ui-card__kicker { font-size: 11px; line-height: 1.3; opacity: 0.72; }
.ui-card__title { font-size: 17px; line-height: 1.2; font-weight: 600; letter-spacing: -0.015em; text-wrap: balance; }
.ui-card__foot { display: grid; gap: 8px; min-width: 0; }
.ui-card__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ui-card__label { overflow: hidden; font-size: 11px; line-height: 1.3; opacity: 0.72; white-space: nowrap; text-overflow: ellipsis; }
.ui-card__value { overflow: hidden; font-size: 12.5px; line-height: 1.3; font-weight: 500; white-space: nowrap; text-overflow: ellipsis; }
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

/* Adding another: dashed, on the window, the same shape */
.ui-card--add { place-content: center; justify-items: center; gap: 4px; box-shadow: none; outline: 1px dashed var(--line, var(--fluid-hairline)); outline-offset: -1px; color: var(--muted, var(--fluid-muted)); }
.ui-card--add b { color: var(--ink, var(--fluid-foreground)); font-size: 12.5px; font-weight: 550; }
.ui-card--add small { font-size: 11px; }
button.ui-card--add:hover { background: var(--hover, var(--fluid-hover)); box-shadow: none; }
`;
