import type { ReactNode } from "react";

/*
 * Breadcrumbs – a trail of text, after Xevrion's (lab.xevrion.dev/lab/breadcrumbs): slashes between segments, earlier
 * segments muted and underlined on hover, the current one in medium weight. No box, no fold and no animation: when space
 * runs out, the trail shortens from the left – the further back a segment, the sooner it gives way to an ellipsis, so
 * where you are reads in full the longest: Ev… / Largest numb… / Evals.
 */
export type Crumb = { label: string; /** Makes the segment a link back to it (the last one never is) */ onClick?: () => void; /** Before the label, e.g. a back arrow on "Dashboard" */ icon?: ReactNode;
  /** Only the icon shows – a back arrow on its own, without a slash after it; the label still names it for screen readers */ iconOnly?: boolean };

export function Breadcrumbs({ items, label = "Breadcrumb", className }: { items: readonly Crumb[]; label?: string; className?: string }) {
  const last = items.length - 1;
  return (
    <nav aria-label={label} className={["ui-crumbs", className].filter(Boolean).join(" ")}>
      <style href="ui-crumbs" precedence="default">{css}</style>
      <ol>
        {items.map((item, index) => (
          <li key={index}>
            {index > 0 && !items[index - 1]!.iconOnly && <Separator />}
            {index === last ? (
              <span className="ui-crumbs__current" aria-current="page" title={item.label}>{item.label}</span>
            ) : item.onClick ? (
              <button type="button" className="ui-crumbs__link" title={item.label} onClick={item.onClick}>{item.icon}<Label item={item} /></button>
            ) : (
              <span className="ui-crumbs__text" title={item.label}>{item.icon}<Label item={item} /></span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Label({ item }: { item: Crumb }) {
  return item.iconOnly ? <span className="ui-crumbs__hidden">{item.label}</span> : <>{item.label}</>;
}

function Separator() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="ui-crumbs__sep" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <path d="M10 3 6 13" />
    </svg>
  );
}

const css = /* css */ `
.ui-crumbs { min-width: 0; font-size: var(--fs-body); }
.ui-crumbs ol { display: flex; align-items: center; min-width: 0; margin: 0; padding: 0; list-style: none; }
/* Shrinking runs right to left: the earlier segments give way first (each keeps a letter and its ellipsis), the one
   before the current next, the current one last of all. Flex shrinks in proportion, so the weights are a million apart
   – the later ones' share stays below a layout unit and their text never clips early */
.ui-crumbs li { display: flex; flex: 0 1e12 auto; align-items: center; min-width: calc(16px + 6px * 2 + 1.5em); }
.ui-crumbs li:first-child { min-width: calc(6px + 1.5em); }
.ui-crumbs li:nth-last-child(2) { flex-shrink: 1e6; }
.ui-crumbs li:last-child { flex-shrink: 1; min-width: 0; }
.ui-crumbs__sep { flex: none; width: 16px; height: 16px; color: var(--faint); opacity: 0.6; }
.ui-crumbs__link, .ui-crumbs__text, .ui-crumbs__current { overflow: hidden; padding: 0 6px; white-space: nowrap; text-overflow: ellipsis; }
.ui-crumbs li:first-child > :first-child { padding-left: 0; }
.ui-crumbs__link, .ui-crumbs__text { color: var(--muted); }
.ui-crumbs__link {
  border-radius: calc(6px * var(--squircle-factor, 1));
  text-decoration: underline;
  text-decoration-color: transparent;
  text-underline-offset: 4px;
  transition: color 150ms ease-out, text-decoration-color 150ms ease-out;
}
.ui-crumbs__link:hover { color: var(--ink); text-decoration-color: color-mix(in oklch, var(--ink) 40%, transparent); }
.ui-crumbs__link:has(> svg), .ui-crumbs__text:has(> svg) { display: inline-flex; align-items: center; gap: 6px; }
.ui-crumbs__link > svg, .ui-crumbs__text > svg { flex: none; }
.ui-crumbs__hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.ui-crumbs__link:focus-visible { outline: 1px solid var(--focus-ring); outline-offset: 1px; }
.ui-crumbs__current { font-weight: 550; font-variation-settings: "opsz" 18; color: var(--ink); }
`;
