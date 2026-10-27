import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, ReactNode } from "react";
import { Icon } from "./app-shell";
import { FlipCard } from "./flip-card";
import { Network } from "./network";
import { Opal } from "./opal";
import { Topography } from "./topography";
import { Waves } from "./waves";
import { Tick02Icon } from "../lib/icons";
import { cn } from "../lib/utils";

/*
 * ColorCard – every card's look: one color, its gradient drawn from that color alone (lighter at the top left, deeper
 * and a little turned at the bottom right), and what drifts over it when `shader` is on – "topography" (the contour
 * map; also `true`), "network" (points joined by lines), "waves" (lines across a rolling sea) or "opal" (rings pushed
 * out by noise). What it says goes in three slots, built from the parts below:
 *
 *   header   CardMark (a logo or a name)                    CardFigure (a rating, a status) – or an emblem
 *   main     CardKicker (a small line)  above  CardTitle (the name, on the card's middle line)
 *   footer   CardText (a small line above a line)           an action: ColorCardButton, ColorCardTag, ColorCardCheck
 *            `progress` (a bar under it all, 0–100)
 *
 * `size` "small" is a rectangle, its type at fixed sizes (16px around, a 17px title); "big" a square whose type grows
 * with it (8% around, the title 8.2% of its width), so it reads the same in a sidebar and on a page. Its shape never
 * changes; a title runs to four lines at most (three on a small card with progress, two centered), then ends in an
 * ellipsis. `flip` turns it
 * over (FlipCard) to its children – CardDetails, say; `centered` sets everything on the middle: the header at the top,
 * the title starting on the middle line, the footer at the foot (a certificate). With onClick the whole card is a
 * button. Its compositions: CourseCard and CertificateCard (course-card.tsx).
 *
 *   <ColorCard color="oklch(0.58 0.2 350)" shader
 *     header={<><CardMark><BrandLogo /></CardMark><CardFigure>★ 4.9</CardFigure></>}
 *     main={<CardTitle>Everyday TypeScript</CardTitle>}
 *     footer={<><CardText label="Updated" value="12 Oct 2026" /><ColorCardButton>Install</ColorCardButton></>} />
 *
 * AddCard is the dashed card that adds another, in either size.
 */
export type CardShape = "small" | "big";

export type ColorCardProps = {
  /** The one color it is drawn from – any CSS color */
  color: string;
  /** What drifts over it: the contour map ("topography", or true), points joined by lines ("network"), lines across a
      rolling sea ("waves") or rings pushed out by noise ("opal") */
  shader?: boolean | CardShaderKind;
  /** Another seed, another drift */
  seed?: number | string;
  /** "small": a rectangle at fixed sizes; "big": a square whose type grows with it */
  size?: CardShape;
  header?: ReactNode;
  main?: ReactNode;
  footer?: ReactNode;
  /** A bar under the footer, 0–100 */
  progress?: number;
  /** Everything on the middle: header at the top, the title from the middle line down, the footer at the foot */
  centered?: boolean;
  /** Turns over to its children (the back) */
  flip?: boolean;
  children?: ReactNode;
  onClick?: () => void;
  /** The card's name – for a button or a card that turns, what it is and, say, how far you are */
  "aria-label"?: string;
  className?: string;
} & Pick<HTMLAttributes<HTMLElement>, "onPointerEnter" | "onFocus">;

export function ColorCard({ color, shader = false, seed, size = "small", header, main, footer, progress, centered = false, flip = false, children, onClick, onPointerEnter, onFocus, "aria-label": ariaLabel, className }: ColorCardProps) {
  const seedNumber = typeof seed === "string" ? seedOf(seed) : seed ?? seedOf(color);
  const classes = cn("ui-card", size === "big" && "ui-card--big", centered && "ui-card--centered", progress !== undefined && "ui-card--progress", flip && "ui-card--flip", className);
  const style = { "--card-color": color } as CSSProperties;
  const face = (
    <span className="ui-card__face">
      <style href="ui-color-card" precedence="default">{css}</style>
      {shader && <CardShader kind={shader === true ? "topography" : shader} seed={seedNumber} className="ui-card__lines" />}
      {header && <span className="ui-card__row ui-card__head">{header}</span>}
      {main && <span className="ui-card__main">{main}</span>}
      {(footer || progress !== undefined) && (
        <span className="ui-card__foot">
          {footer && <span className="ui-card__row ui-card__row--end">{footer}</span>}
          {progress !== undefined && <span className="ui-card__bar" aria-hidden="true"><i style={{ width: `${Math.max(progress, 3)}%` }} /></span>}
        </span>
      )}
    </span>
  );
  if (flip) {
    return (
      <div className={classes} style={style}>
        <FlipCard className="ui-card__flip" frontLabel={`${ariaLabel ?? "Card"} – show details`} backLabel={`${ariaLabel ?? "Card"} – show the front`}
          front={face} back={<span className="ui-card__face ui-card__back"><style href="ui-color-card" precedence="default">{css}</style>{children}</span>} />
      </div>
    );
  }
  return onClick
    ? <button type="button" className={classes} style={style} aria-label={ariaLabel} onClick={onClick} onPointerEnter={onPointerEnter} onFocus={onFocus}>{face}</button>
    : <article className={classes} style={style} aria-label={ariaLabel}>{face}</article>;
}

/** Top left: a logo (an image or svg, set to the line's height) or a name */
export function CardMark({ children }: { children: ReactNode }) {
  return <span className="ui-card__mark">{children}</span>;
}

/** A short figure – a rating, a status, a percent – at the header's or the footer's end */
export function CardFigure({ children, "aria-label": ariaLabel }: { children: ReactNode; "aria-label"?: string }) {
  return <span className="ui-card__figure" aria-label={ariaLabel}>{children}</span>;
}

/** A small line over the title – `code` sets it in monospace, e.g. a repository */
export function CardKicker({ children, code = false }: { children: ReactNode; code?: boolean }) {
  return <span className={cn("ui-card__kicker", code && "ui-card__kicker--code")}>{children}</span>;
}

/** The card's name: a heading, its lines balanced, a " · " kept with the word before it */
export function CardTitle({ children }: { children: ReactNode }) {
  return <b className="ui-card__title">{typeof children === "string" ? keepSeparators(children) : children}</b>;
}

/** Two lines at the foot: a small one over a line – or, `labelBelow`, under it (a name, then when) */
export function CardText({ label, value, labelBelow = false }: { label?: ReactNode; value?: ReactNode; labelBelow?: boolean }) {
  const small = label && <span className="ui-card__label">{label}</span>;
  return <span className="ui-card__text">{labelBelow ? <>{value && <span className="ui-card__value">{value}</span>}{small}</> : <>{small}{value && <span className="ui-card__value">{value}</span>}</>}</span>;
}

/** The back of a card that turns: a small heading, then its details row by row */
export function CardDetails({ title = "Details", items }: { title?: string; items: Array<[label: ReactNode, value: ReactNode]> }) {
  return (
    <>
      <span className="ui-card__details-title">{title}</span>
      <dl className="ui-card__details">{items.map(([label, value], index) => <div key={index}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </>
  );
}

export type CardShaderKind = "topography" | "network" | "waves" | "opal";

/** What drifts over a card – the contour map, the network, the waves or the opal – as the cards set it: white lines,
    screened over the colors by the card's own class (ui-card__lines), each kind at its own strength */
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
    <span className="ui-card__check rounded-md" data-checked={checked || undefined} aria-hidden="true">
      {checked && <Icon icon={Tick02Icon} size={12} stroke={2.6} />}
    </span>
  );
}

/** The dashed card that adds another, the cards' shape and size */
export function AddCard({ icon, title, label, onClick, size = "small" }: { icon?: ReactNode; title: string; label?: string; onClick?: () => void; size?: CardShape }) {
  return (
    <button type="button" className={cn("ui-card ui-card--add", size === "big" && "ui-card--big")} onClick={onClick}>
      <style href="ui-color-card" precedence="default">{css}</style>
      {icon}
      <b>{title}</b>
      {label && <small>{label}</small>}
    </button>
  );
}

/** A " · " stays with the word before it, so no line of a title starts with the dot */
export const keepSeparators = (title: string) => title.replaceAll(" · ", "\u00a0· ");

const seedOf = (text: string) => [...text].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 9973, 7);

const css = /* css */ `
/* Two sizes, one look. Every measure is a variable: small cards at fixed sizes, big ones in proportion to their width
   (container units, each with a floor), so the rules below are the same for both */
.ui-card {
  --pad: 16px; --gap: 8px; --radius: var(--radius-xl);
  --t-mark: 12px; --mark-track: 0; --t-head: 12px; --mark-h: 11px; --logo-h: 19px;
  --t-kicker: 11px; --t-title: 17px; --main-gap: 2px;
  --t-label: 11px; --t-value: 12.5px; --text-gap: 9px; --bar-gap: 12px;
  --action-h: 24px; --action-t: 12px; --action-pad: 10px;
  /* Its shape is fixed: whatever it holds, it never grows past its aspect ratio */
  position: relative; display: grid; aspect-ratio: 1.3; min-width: 0; min-height: 0; container-type: inline-size; border-radius: var(--radius); box-shadow: var(--shadow-3); color: #fff; text-align: left;
  transition: box-shadow var(--motion-moderate) var(--ease-moderate);
}
/* A title runs to four lines, then ends in an ellipsis – three on a small card with a progress bar, where four lines and
   the bar's footer can't both fit */
.ui-card { --title-lines: 4; }
.ui-card--progress:not(.ui-card--big) { --title-lines: 3; }
/* Centered, the title starts on the middle line and has only the lower half to grow into: two lines, then the ellipsis */
.ui-card--centered { --title-lines: 2; }
.ui-card--big {
  --pad: 8cqi; --gap: 2cqi; --radius: calc(14px * var(--squircle-factor, 1));
  --t-mark: max(12px, 5.6cqi); --mark-track: -0.01em; --t-head: max(11.5px, 5cqi); --mark-h: max(9px, 4cqi); --logo-h: max(15.7px, 6.95cqi);
  --t-kicker: max(10.5px, 4.6cqi); --t-title: 8.2cqi; --main-gap: 1.6cqi;
  --t-label: max(10.5px, 4.4cqi); --t-value: max(12px, 5cqi); --text-gap: max(6.5px, calc(2.3cqi + 1px)); --bar-gap: max(10.5px, 4.4cqi);
  --action-h: max(22px, 9cqi); --action-t: max(11.5px, 5cqi); --action-pad: max(8px, 3.6cqi);
  aspect-ratio: 1;
}
button.ui-card:hover { box-shadow: var(--shadow-4); }
button.ui-card:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
/* The gradient from the one color: lighter at the top left, deeper and turned a little at the bottom right */
.ui-card__face {
  position: relative; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: 1fr auto 1fr; gap: var(--gap); min-width: 0; height: 100%; padding: var(--pad); overflow: clip; border-radius: inherit;
  background:
    radial-gradient(120% 90% at 0% 0%, oklch(from var(--card-color) calc(l + 0.16) c h / 0.85), transparent 60%),
    linear-gradient(140deg, var(--card-color), oklch(from var(--card-color) calc(l - 0.28) calc(c * 0.6) calc(h + 40)));
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.12);
}
.ui-card__face > :not(.ui-card__lines) { position: relative; }
/* The title on the card's middle line: the header and the footer each get an equal row around it, the header at its
   top, the footer at its bottom – so a button, a tag or a progress bar can't push it off center. Only when the three
   together fill the card does the title give way a little, rather than the card growing */
.ui-card__head { grid-row: 1; align-self: start; }
.ui-card__main { grid-row: 2; }
.ui-card__foot { grid-row: 3; align-self: end; }
/* The contour lines: white on black, screened over the colors so only the lines show; the brighter kinds quieter */
.ui-card__lines { position: absolute; inset: 0; mix-blend-mode: screen; opacity: 0.55; pointer-events: none; }
.ui-card__lines[data-kind="network"] { opacity: 0.45; image-rendering: pixelated; }
.ui-card__lines[data-kind="waves"] { opacity: 0.4; }
.ui-card__lines[data-kind="opal"] { opacity: 0.6; }

/* The padding meets what you see, not a line box: each line of type is trimmed to its letters – the top of its capitals
   to its baseline (text-box) – so a name or a figure starts on the top padding, a line of the footer sits on the bottom
   padding as a button, a tick or the bar does. The header aligns its tops, the footer its bottoms */
.ui-card__row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.ui-card__row--end { align-items: flex-end; }
.ui-card__head { flex: none; align-items: flex-start; }
.ui-card__mark { display: block; font-size: var(--t-mark); line-height: 1; font-weight: 600; letter-spacing: var(--mark-track); white-space: nowrap; text-box: trim-both cap alphabetic; }
.ui-card__mark > :is(svg, img, [role="img"]) { display: block; height: var(--mark-h); width: auto; color: #fff; }
/* Our logo's box is wider than its drawing (3.19:1 for a 1.84:1 drawing); here its box is the drawing, so its top
   meets the padding too */
.ui-card__mark > .dojo-brand-logo { height: var(--logo-h); aspect-ratio: 2225 / 1212; }
.ui-card__figure { display: block; font-size: var(--t-head); line-height: 1; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; text-box: trim-both cap alphabetic; }
.ui-card__main { display: flex; flex-direction: column; gap: var(--main-gap); min-width: 0; }
.ui-card__kicker { overflow: hidden; font-size: var(--t-kicker); line-height: 1.3; opacity: 0.72; white-space: nowrap; text-overflow: ellipsis; }
.ui-card__kicker--code { font-family: var(--font-mono); }
/* Titles as headings (better-typography): tracking -0.015em, line height 1.15 so a second line breathes, balanced –
   and never more than four lines: a longer one ends in an ellipsis (its box padded a little top and bottom, so the
   clip doesn't cut the first line's accents or the last line's descenders) */
.ui-card__title {
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: var(--title-lines); line-clamp: var(--title-lines); overflow: hidden;
  padding-block: 0.08em; margin-block: -0.08em;
  font-size: var(--t-title); line-height: 1.15; font-weight: 600; letter-spacing: -0.015em; text-wrap: balance;
}
/* The bar under the footer's baseline; the small line's baseline over the line's capitals (as they read untrimmed).
   They clip only sideways, for the ellipsis – so accents and descenders still show past the trimmed box */
.ui-card__foot { display: grid; gap: var(--bar-gap); min-width: 0; }
.ui-card__text { display: flex; flex-direction: column; gap: var(--text-gap); min-width: 0; }
.ui-card__label { overflow: clip visible; font-size: var(--t-label); line-height: 1; opacity: 0.72; white-space: nowrap; text-overflow: ellipsis; text-box: trim-both cap alphabetic; }
.ui-card__value { overflow: clip visible; font-size: var(--t-value); line-height: 1; font-weight: 500; white-space: nowrap; text-overflow: ellipsis; text-box: trim-both cap alphabetic; }
.ui-card__foot > .ui-card__row > :not(.ui-card__text) { flex: none; }
.ui-card__bar { display: block; height: 4px; overflow: hidden; border-radius: calc(2px * var(--squircle-factor, 1)); background: rgb(255 255 255 / 0.25); }
.ui-card__bar i { display: block; height: 100%; border-radius: inherit; background: #fff; }

/* Centered (a certificate): the card in two equal halves – the header at the top of the upper one, the title's first
   line on the middle line (one line or two, it starts there and grows down), the footer at the foot; all three pinned
   to the one column, or the grid would open a second */
.ui-card--centered { text-align: center; }
.ui-card--centered .ui-card__face { grid-template-rows: 1fr 1fr; gap: 0; }
.ui-card--centered .ui-card__head { grid-area: 1 / 1; justify-content: center; }
.ui-card--centered .ui-card__main { grid-area: 2 / 1; align-self: start; align-items: center; }
.ui-card--centered .ui-card__foot { grid-area: 2 / 1; }
.ui-card--centered .ui-card__foot > .ui-card__row { justify-content: center; }
.ui-card--centered .ui-card__text { align-items: center; }

/* Turning over: FlipCard fills the card and draws its own shadow; the back is the window's card, its details listed.
   Buttons on the front sit over the turn-over button, so a click on them does what they say */
.ui-card--flip { box-shadow: none; --flip-radius: var(--radius); }
.ui-card__flip.ui-card__flip { position: absolute; inset: 0; width: 100%; height: 100%; }
.ui-card--flip .ui-card__face :is(button, a, label, input) { position: relative; z-index: 11; }
.ui-card__back { display: flex; flex-direction: column; justify-content: space-between; background: var(--card); box-shadow: var(--shadow-3); color: var(--ink); }
.ui-card__details-title { font-size: var(--t-label); font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted); }
.ui-card__details { display: flex; flex-direction: column; margin: 0; }
.ui-card__details div { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: calc(var(--pad) * 0.3) 0; border-top: 1px solid var(--fluid-hairline); font-size: var(--t-value); }
.ui-card__details dt { color: var(--muted); }
.ui-card__details dd { margin: 0; font-weight: 500; font-variant-numeric: tabular-nums; }

/* Actions, one size per card size: a light button, a quiet tag (scoped to the card, so a surrounding list can't
   restyle them), a checkbox's tick */
.ui-card .ui-card__button, .ui-card .ui-card__tag { display: inline-flex; align-items: center; gap: 4px; height: var(--action-h); padding: 0 var(--action-pad); border-radius: calc(7px * var(--squircle-factor, 1)); font-size: var(--action-t); font-weight: 550; white-space: nowrap; }
.ui-card .ui-card__button { background: var(--surface-6); color: var(--fluid-foreground); box-shadow: 0 1px 2px rgb(0 0 0 / 0.2); transition: opacity var(--motion-fast) var(--ease-fast), scale var(--motion-fast) var(--ease-fast); }
.ui-card .ui-card__button:hover:not(:disabled) { opacity: 0.9; }
.ui-card .ui-card__button:active:not(:disabled) { scale: 0.96; }
.ui-card .ui-card__button:disabled { opacity: 0.7; }
.ui-card .ui-card__button:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.ui-card .ui-card__tag { padding: 0 calc(var(--action-pad) * 0.8); background: rgb(255 255 255 / 0.16); color: #fff; }
.ui-card__check { display: grid; place-items: center; width: 20px; height: 20px; box-shadow: inset 0 0 0 1.5px rgb(255 255 255 / 0.8); }
.ui-card__check[data-checked] { background: #fff; box-shadow: none; color: #111; }

/* Adding another: dashed, on the window, the same shape */
.ui-card--add { place-content: center; justify-items: center; gap: 4px; box-shadow: none; outline: 1px dashed var(--line, var(--fluid-hairline)); outline-offset: -1px; color: var(--muted, var(--fluid-muted)); }
.ui-card--add b { color: var(--ink, var(--fluid-foreground)); font-size: 12.5px; font-weight: 550; }
.ui-card--add small { font-size: 11px; }
button.ui-card--add:hover { background: var(--hover, var(--fluid-hover)); box-shadow: none; }
`;
