/*
 * Breadcrumbs – a trail of text, after Xevrion's (lab.xevrion.dev/lab/breadcrumbs): slashes between segments, earlier
 * segments muted and underlined on hover, the current one in medium weight. No box, no fold and no animation: when space
 * runs out, the middle segments shorten with an ellipsis, so the first and the last always read in full –
 * Authoring / Largest numb… / Evals.
 */
export type Crumb = { label: string; /** Makes the segment a link back to it (the last one never is) */ onClick?: () => void };

export function Breadcrumbs({ items, label = "Breadcrumb", className }: { items: readonly Crumb[]; label?: string; className?: string }) {
  const last = items.length - 1;
  return (
    <nav aria-label={label} className={["ui-crumbs", className].filter(Boolean).join(" ")}>
      <style href="ui-crumbs" precedence="default">{css}</style>
      <ol>
        {items.map((item, index) => (
          // The first and the last stay whole; the ones between give way
          <li key={index} data-fit={index === 0 || (index === last && last > 1) ? "whole" : "shrink"}>
            {index > 0 && <Separator />}
            {index === last ? (
              <span className="ui-crumbs__current" aria-current="page" title={item.label}>{item.label}</span>
            ) : item.onClick ? (
              <button type="button" className="ui-crumbs__link" title={item.label} onClick={item.onClick}>{item.label}</button>
            ) : (
              <span className="ui-crumbs__text" title={item.label}>{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
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
.ui-crumbs li { display: flex; align-items: center; min-width: 0; }
.ui-crumbs li[data-fit="whole"] { flex: none; }
.ui-crumbs__sep { flex: none; width: 16px; height: 16px; color: var(--faint); opacity: 0.6; }
.ui-crumbs__link, .ui-crumbs__text, .ui-crumbs__current { overflow: hidden; padding: 0 6px; white-space: nowrap; text-overflow: ellipsis; }
.ui-crumbs li:first-child > :first-child { padding-left: 0; }
.ui-crumbs__link, .ui-crumbs__text { color: var(--muted); }
.ui-crumbs__link {
  border-radius: 6px;
  text-decoration: underline;
  text-decoration-color: transparent;
  text-underline-offset: 4px;
  transition: color 150ms ease-out, text-decoration-color 150ms ease-out;
}
.ui-crumbs__link:hover { color: var(--ink); text-decoration-color: color-mix(in oklch, var(--ink) 40%, transparent); }
.ui-crumbs__link:focus-visible { outline: 1px solid var(--focus-ring); outline-offset: 1px; }
.ui-crumbs__current { font-weight: 550; font-variation-settings: "opsz" 18; color: var(--ink); }
`;
