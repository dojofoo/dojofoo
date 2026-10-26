import { useContentPreferences, setContentPreferences } from "~/lib/content-preferences";
import { useRef, type ReactNode } from "react";
import { ArrowRightUpRegular } from "@mingcute/react/core-regular";
import { Icon } from "~/components/app-shell";
import { FluidHoverHighlight } from "~/components/fluid-hover-highlight";
import { useFluidHover, useRegisterFluidHoverItem } from "~/hooks/use-fluid-hover";
import type { IconGlyph } from "~/lib/icons";

/*
 * LessonBrief – what's open, explained the way Dojofoo's lesson page does it (routes/index.tsx, LessonPage): the title
 * large, a lead line, then the briefing – small-caps headings, numbered steps, inline code – and the resources it points
 * to, each a link with its source. Where it sits (course, lesson) is the breadcrumbs' job, so there is no eyebrow.
 *
 *   <LessonBrief title="Largest number" lead="…" resources={[…]}>
 *     <h3>Goal</h3><p>Write <code>max(numbers)</code> …</p>
 *   </LessonBrief>
 *
 * The briefing is plain markup – h3, p, ol/ul, code, a – styled here, so authored content reads the same as the app's.
 */
export type LessonResource = { title: string; href: string; /** What it is or where it's from, e.g. "MDN · Reference" */ note?: string; icon?: IconGlyph };

export function LessonBrief({ title, lead, children, resources = [], facts = [] }: {
  title: string;
  lead?: ReactNode;
  /** The briefing: h3 headings, paragraphs, lists, inline code and links */
  children?: ReactNode;
  resources?: LessonResource[];
  /** Short label–value pairs at the end */
  facts?: Array<[string, ReactNode]>;
}) {
  const { material } = useContentPreferences();
  return (
    <article className="ui-lb" data-resources={material.resources} style={{ fontSize: `${material.textSize}px`, "--ui-lb-measure": material.width === "wide" ? "100%" : "33rem", "--ui-lb-line": `${material.textSize * 1.6}px` } as import("react").CSSProperties}>
      <style href="ui-lesson-brief" precedence="default">{css}</style>
      <div className="ui-lb__main">
      <h2 className="ui-lb__title">{title}</h2>
      {lead && <p className="ui-lb__lead">{lead}</p>}
      {children && <div className="ui-lb__body">{children}</div>}
      {facts.length > 0 && (
        <dl className="ui-lb__facts">
          {facts.map(([term, value]) => (
            <div key={term}><dt>{term}</dt><dd>{value}</dd></div>
          ))}
        </dl>
      )}
      </div>
      {resources.length > 0 && <Resources resources={resources} />}
    </article>
  );
}

/** The resources grid, with Fluid's hover: one highlight that springs from link to link (fast tier) and fades in and
    out, instead of each row lighting on its own */
function Resources({ resources }: { resources: LessonResource[] }) {
  const { material } = useContentPreferences();
  const list = useRef<HTMLUListElement>(null);
  const hover = useFluidHover(list, { axis: "xy", gapClick: false });
  return (
        <details className="ui-lb__section" aria-label="Resources" open={material.previews} onToggle={event => { if (event.currentTarget.open !== material.previews) setContentPreferences("material", { previews: event.currentTarget.open }); }}>
          <summary>Resources ({resources.length})</summary>
          <ul ref={list} className="ui-lb__resources" onMouseEnter={hover.handlers.onMouseEnter} onMouseMove={hover.handlers.onMouseMove} onMouseLeave={hover.handlers.onMouseLeave}>
            <FluidHoverHighlight hover={hover} className="ui-lb__highlight rounded-lg" />
            {resources.map((resource, index) => (
              <li key={resource.href}>
                <Resource resource={resource} index={index} register={hover.registerItem} />
              </li>
            ))}
          </ul>
        </details>
  );
}

/** One link, registered with the hover once – a ref that stays put, so registering never re-renders the list */
function Resource({ resource, index, register }: { resource: LessonResource; index: number; register: (index: number, element: HTMLElement | null) => void }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useRegisterFluidHoverItem(register, index, ref);
  return (
                <a ref={ref} data-fluid-hover-index={index} href={resource.href} target="_blank" rel="noreferrer" className="ui-lb__resource rounded-lg focus-visible:bg-hover">
                  {resource.icon && <span className="ui-lb__resource-icon"><Icon icon={resource.icon} size={16} /></span>}
                  <span className="ui-lb__resource-text">
                    <b>{resource.title}</b>
                    {resource.note && <small>{resource.note}</small>}
                  </span>
                  <ArrowRightUpRegular size={14} aria-hidden className="ui-lb__resource-out" />
                </a>
  );
}

const css = /* css */ `
.ui-lb__main { min-width: 0; }
.ui-lb[data-resources="panel"] { display: grid; grid-template-columns: minmax(0, 1fr) minmax(12rem, .65fr); gap: 24px; max-width: none; align-items: start; }
.ui-lb[data-resources="panel"] > .ui-lb__section { margin-top: 0; position: sticky; top: 0; }
.ui-lb__section summary { cursor: pointer; font-size: .8em; font-weight: 600; padding: 8px 0; }
@container ui-as-main (max-width: 800px) { .ui-lb[data-resources="panel"] { grid-template-columns: minmax(0, 1fr); } }

/* Long-form type, after the better-typography rules (jakubkrehel/skills), a step compact: body at 15px with a unitless 1.6
   line, a measure capped near 70 characters, unitless line heights by role (title 1.2, labels 1.3), weights as
   properties and Inter's optical size left to follow the size – the shell pins "opsz" 14 for its UI text, so the brief
   resets it. Headings balance, paragraphs and list items wrap pretty, long words and links break instead of escaping. */
.ui-lb {
  --ui-lb-line: 1.5rem; /* one body line: 15px × 1.6, for the list markers */
  display: flex;
  flex-direction: column;
  max-width: 52rem;
  color: var(--fluid-foreground);
  font-size: 0.9375rem;
  line-height: 1.6;
  font-variation-settings: normal;
  overflow-wrap: break-word;
}
.ui-lb__title, .ui-lb__lead, .ui-lb__body { max-width: var(--ui-lb-measure, 33rem); } /* the measure: ≤ 74 characters at 15px */
.ui-lb__title { margin: 0; font-size: 1.6875rem; line-height: 1.2; font-weight: 600; letter-spacing: -0.015em; text-wrap: balance; }
.ui-lb__lead { margin: 0.5rem 0 0; color: color-mix(in oklab, var(--fluid-foreground) 88%, var(--fluid-muted)); font-size: 1.0625rem; line-height: 1.55; text-wrap: pretty; }

.ui-lb__body, .ui-lb__section { margin-top: 1.5rem; color: color-mix(in oklab, var(--fluid-foreground) 88%, var(--fluid-muted)); }
/* Section labels: a deliberate overline – small capitals from natural-case text, 0.05em of tracking */
.ui-lb h3 { margin: 1.75rem 0 0.5rem; color: var(--fluid-muted); font-size: 0.625rem; line-height: 1.3; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
.ui-lb__body > h3:first-child, .ui-lb__section > h3:first-child { margin-top: 0; }
.ui-lb__body p { margin: 0 0 0.75em; text-wrap: pretty; }
.ui-lb__body ol, .ui-lb__body ul { margin: 0 0 0.75em; padding-left: 0; list-style: none; counter-reset: ui-lb-step; }
.ui-lb__body li { position: relative; padding-left: 1.75rem; margin-bottom: 0.375em; text-wrap: pretty; }
.ui-lb__body ol > li { counter-increment: ui-lb-step; }
/* Step numbers centred on the first line, figures of one width */
.ui-lb__body ol > li::before { content: counter(ui-lb-step); position: absolute; left: 0; top: calc((var(--ui-lb-line) - 18px) / 2); width: 18px; height: 18px; border-radius: 50%; corner-shape: round; background: var(--fluid-hover); color: var(--fluid-muted); font-family: var(--font-mono); font-size: 11px; line-height: 18px; font-variant-numeric: tabular-nums; text-align: center; }
.ui-lb__body ul > li::before { content: ""; position: absolute; left: 7px; top: calc(var(--ui-lb-line) / 2 - 2px); width: 4px; height: 4px; border-radius: 50%; corner-shape: round; background: var(--fluid-muted); }
.ui-lb__body code { padding: 0.1em 0.35em; border-radius: calc(5px * var(--squircle-factor, 1)); background: var(--fluid-hover); color: var(--fluid-foreground); font-family: var(--font-mono); font-size: 0.875em; }
.ui-lb__body a { color: var(--fluid-foreground); text-decoration: underline; text-decoration-color: color-mix(in oklab, var(--brand) 70%, transparent); text-decoration-thickness: 0.09em; text-underline-offset: 0.2em; transition: text-decoration-color var(--motion-fast) var(--ease-fast); }
.ui-lb__body a:hover { text-decoration-color: var(--brand); }
.ui-lb__body strong { color: var(--fluid-foreground); font-weight: 600; }

/* Resources: a two-column grid on the window (one where it gets narrow), wider than the prose (it isn't read line by line), one column where it
   gets narrow – each a link to its source, a hover tint, the arrow leaning out. Titles and notes wrap rather than
   truncate, so nothing is cut off */
.ui-lb__resources { position: relative; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, max(13.5rem, calc((100% - 8px) / 2))), 1fr)); grid-auto-rows: 1fr; gap: 2px 8px; margin: 0 -10px; padding: 0; list-style: none; }
/* Every cell as tall as the tallest, so the highlight lands on boxes of one size */
.ui-lb__resources > li { position: relative; z-index: 1; display: flex; }
.ui-lb__resources > li > .ui-lb__resource { flex: 1; }
.ui-lb__highlight { z-index: 0; background: var(--fluid-hover); }
.ui-lb__resource { display: flex; align-items: center; gap: 12px; padding: 8px 10px; color: inherit; text-decoration: none; }
/* The lit link (the highlight's, or the keyboard's): Fluid's fast tier – in on its spring, out on the quicker exit tween,
   never the enter spring reversed. It lights plainly: the icon's box fades away into the highlight */
.ui-lb__resource-icon::before, .ui-lb__resource-out { transition: opacity var(--motion-fast-exit) var(--ease-exit), color var(--motion-fast-exit) var(--ease-exit), translate var(--motion-fast-exit) var(--ease-exit); }
.ui-lb__resource:is([data-fluid-hover-active], :focus-visible) .ui-lb__resource-icon::before,
.ui-lb__resource:is([data-fluid-hover-active], :focus-visible) .ui-lb__resource-out { transition-duration: var(--motion-fast); transition-timing-function: var(--ease-fast); }
.ui-lb__resource:focus-visible { outline: 1px solid var(--focus-ring); outline-offset: -1px; }
.ui-lb__resource-icon { position: relative; display: grid; flex: none; place-items: center; width: 32px; height: 32px; border-radius: calc(8px * var(--squircle-factor, 1)); color: var(--fluid-muted); }
.ui-lb__resource-icon > * { position: relative; }
/* The box is its own layer, so it can fade without the icon */
.ui-lb__resource-icon::before { content: ""; position: absolute; inset: 0; border-radius: inherit; background: var(--surface-3); box-shadow: var(--shadow-2); }
.ui-lb__resource:is([data-fluid-hover-active], :focus-visible) .ui-lb__resource-icon::before { opacity: 0; }
.ui-lb__resource-text { display: flex; flex: 1; flex-direction: column; min-width: 0; text-wrap: pretty; }
.ui-lb__resource-text b { color: var(--fluid-foreground); font-size: 0.8125rem; line-height: 1.4; font-weight: 550; }
.ui-lb__resource-text small { color: var(--fluid-muted); font-size: 0.75rem; line-height: 1.4; }
.ui-lb__resource-out { flex: none; color: var(--fluid-muted); }
.ui-lb__resource:is([data-fluid-hover-active], :focus-visible) .ui-lb__resource-out { color: var(--fluid-foreground); translate: 1px -1px; }

.ui-lb__facts { display: grid; grid-template-columns: 6rem minmax(0, 1fr); gap: 0.375rem 0.75rem; margin: 1.5rem 0 0; padding-top: 1rem; border-top: 1px solid var(--fluid-hairline); font-size: 0.8125rem; line-height: 1.5; }
.ui-lb__facts > div { display: contents; }
.ui-lb__facts dt { color: var(--fluid-muted); }
.ui-lb__facts dd { margin: 0; color: var(--fluid-foreground); }
`;
