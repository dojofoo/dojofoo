import type { Meta, StoryObj } from "@storybook/react-vite";
import { createContext, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { AppShell, type ShellSection } from "~/components/app-shell";
import { Breadcrumbs } from "~/components/breadcrumbs";
import { Button } from "~/components/button";
import { CodeEditor, Editor, EditorStatus, EditorTabs } from "~/components/editor";
import { SegmentedControl } from "~/components/segmented-control";
import { editorSchemes, setUiPreferences, uiThemes, useEditorScheme, useUiPreferences } from "~/lib/ui-preferences";
import { CheckListIcon, File01Icon, PencilEdit02Icon, PlayIcon, PlusSignIcon } from "~/lib/icons";
import { BrandLogo } from "../../../ui/src/components/ui/brand-logo";

/*
 * Theme sandbox – a theme's foundations at a glance, light and dark side by side (a .light and a .dark island, so the
 * page's own mode doesn't matter): the main background, the eight surface levels each with its shadow, the edges drawn
 * on every level and the next level lifted off it, shadows, components (buttons, toggles, text) and the real shell –
 * sidebar, Getting started and the editor in the chosen color scheme – so a change to a theme or to a component shows
 * here as it will in the app. Values are the browser's computed ones, so derived themes read as they resolve.
 *
 * Two experiments live only here, for tuning: the light ladder by formula (Rising – each level a step lighter, up to the
 * theme's background at level 8; Reversed – the background at level 1, each level a step darker) and how far the
 * editor's color scheme moves toward the theme (--ui-ed-blend).
 */
const meta = { title: "Foundations/Theme Sandbox", parameters: { layout: "fullscreen", a11y: { test: "todo" } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const levels = [1, 2, 3, 4, 5, 6, 7, 8] as const;
/** Where each level is used in the shell */
const roles: Record<number, string> = { 1: "Page", 2: "Window", 3: "Cards, editor", 4: "Raised – pills, chips", 5: "Popovers, menus", 6: "Dialogs", 7: "–", 8: "–" };
/** Shadows go to 6; the levels above reuse the top one */
const shadow = (level: number) => `var(--shadow-${Math.min(level, 6)})`;
const surface = (level: number) => `var(--surface-${level})`;

type Ladder = "flat" | "rising" | "reversed";
const ladders: Record<string, Ladder> = { "As set": "flat", Rising: "rising", Reversed: "reversed" };
/** Anything that changes a computed color – the probes measure again when it does */
const Tick = createContext("");

export const Sandbox: Story = { render: () => <ThemeSandbox /> };

function ThemeSandbox() {
  const { theme, editorScheme } = useUiPreferences();
  const current = useEditorScheme();
  const [blend, setBlend] = useState(75);
  const [ladder, setLadder] = useState<Ladder>("flat");
  const [step, setStep] = useState(0.006);
  const tick = [theme, editorScheme, blend, ladder, step].join(":");
  return (
    <Tick.Provider value={tick}>
      <div className="ts" data-ladder={ladder} style={{ "--ui-ed-blend": `${blend}%`, "--ts-step": step } as CSSProperties}>
        <style>{css}</style>
        <header className="ts__bar">
          <div className="ts__line">
            <span className="ts__title">Theme</span>
            <div className="ts__chips" role="radiogroup" aria-label="Theme">
              {uiThemes.map((option) => (
                <Chip key={option.id} checked={option.id === theme} swatches={option.swatches} onClick={() => setUiPreferences({ theme: option.id })}>{option.label}</Chip>
              ))}
            </div>
          </div>
          <div className="ts__line">
            <span className="ts__title">Color scheme</span>
            <div className="ts__chips" role="radiogroup" aria-label="Color scheme">
              <Chip checked={editorScheme === "match"} onClick={() => setUiPreferences({ editorScheme: "match" })}>Match · {current.label}</Chip>
              {editorSchemes.map((scheme) => (
                <Chip key={scheme.id} checked={editorScheme === scheme.id} swatches={[scheme.surface]} onClick={() => setUiPreferences({ editorScheme: scheme.id })}>{scheme.label}</Chip>
              ))}
            </div>
            <label className="ts__range">
              Toward the theme <input type="range" min={0} max={100} step={5} value={blend} onChange={(event) => setBlend(Number(event.target.value))} /> <output>{blend}%</output>
            </label>
          </div>
          <div className="ts__line">
            <span className="ts__title">Light ladder</span>
            <SegmentedControl size="compact" label="Light ladder" options={Object.keys(ladders)} value={Object.keys(ladders).find((key) => ladders[key] === ladder)!} onChange={(key) => setLadder(ladders[key])} />
            <label className="ts__range" data-off={ladder === "flat" || undefined}>
              Step <input type="range" min={0.002} max={0.03} step={0.002} value={step} disabled={ladder === "flat"} onChange={(event) => setStep(Number(event.target.value))} /> <output>{step.toFixed(3)}</output>
            </label>
          </div>
        </header>
        <div className="ts__modes">
          <Mode mode="light" />
          <Mode mode="dark" />
        </div>
        {/* The shell needs 900px before it shows its sidebar, so each mode's gets the full width */}
        {(["light", "dark"] as const).map((mode) => (
          <section key={mode} className={`ts__mode ts__mode--wide ${mode}`} aria-label={`Shell, ${mode}`}>
            <Group title={`Shell · ${mode === "light" ? "Light" : "Dark"}`} note="The real sidebar, Getting started card and editor – hover the rows, open the card, click a line for its highlight">
              <Shell />
            </Group>
          </section>
        ))}
      </div>
    </Tick.Provider>
  );
}

function Chip({ checked, swatches, onClick, children }: { checked: boolean; swatches?: string[]; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={checked} className="ts__chip" onClick={onClick}>
      {swatches && <span className="ts__swatches">{swatches.map((color, index) => <i key={index} style={{ background: color }} />)}</span>}
      {children}
    </button>
  );
}

function Mode({ mode }: { mode: "light" | "dark" }) {
  return (
    <section className={`ts__mode ${mode}`} aria-label={mode === "light" ? "Light" : "Dark"}>
      <h2 className="ts__heading">{mode === "light" ? "Light" : "Dark"}</h2>

      <Group title="Main background" note="The page is surface 1; shadcn's --background is what imported themes set and the ladder is centred on">
        <div className="ts__pair">
          <Swatch name="surface-1 · page" color="var(--surface-1)" />
          <Swatch name="--background" color="var(--background)" />
          <Swatch name="--card" color="var(--card)" />
          <Swatch name="--border" color="var(--border)" />
        </div>
      </Group>

      <Group title="Staircase" note="Each level inside the one below, with its shadow – the step between neighbours">
        <Stair level={1} />
      </Group>

      <Group title="Levels" note="Each row is painted in its level: the lines drawn on it – hairline and border are one color – and the next level lifted off it with that level's shadow">
        <div className="ts__levels">
          <div className="ts__row ts__row--head">
            <span>Level</span><span>Hairline</span><span>Border</span><span>Next level</span>
          </div>
          {levels.map((level) => (
            <div key={level} className="ts__row" style={{ background: surface(level) }}>
              <span className="ts__level">
                <b>{level}</b>
                <small>{roles[level]}</small>
                <Value color={surface(level)} />
              </span>
              <span className="ts__hairline" />
              <span className="ts__box ts__box--border" />
              {level < 8 ? (
                <span className="ts__box" style={{ background: surface(level + 1), boxShadow: shadow(level + 1) }}>{level + 1}</span>
              ) : <span className="ts__none">top</span>}
            </div>
          ))}
        </div>
      </Group>

      <Group title="Shadows" note="Shadow 1–6, each on its level, over the page – then a segmented control's pill (its surface with shadow 3)">
        <div className="ts__shadows">
          {[1, 2, 3, 4, 5, 6].map((level) => (
            <span key={level} className="ts__shadow" style={{ background: surface(level), boxShadow: shadow(level) }}>{level}</span>
          ))}
          <span className="ts__shadow" style={{ background: "var(--pill-surface)", boxShadow: "var(--shadow-3)" }}>pill</span>
        </div>
      </Group>

      <Group title="Components" note="On the window (surface 2), as in the shell">
        <Components />
      </Group>
    </section>
  );
}

function Components() {
  const [view, setView] = useState("Lesson");
  const [on, setOn] = useState(true);
  return (
    <div className="ts__components">
      <div className="ts__strip">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Delete</Button>
        <Button disabled>Disabled</Button>
      </div>
      <div className="ts__strip">
        <SegmentedControl label="View" options={["Lesson", "Sensei", "Assets"]} value={view} onChange={setView} />
        <button type="button" role="switch" aria-checked={on} aria-label="Switch" className="ts__switch" onClick={() => setOn(!on)} />
        <button type="button" role="switch" aria-checked={false} aria-label="Switch, off" className="ts__switch" />
        <span className="ts__tags">
          <span className="ts__tag">Tag</span>
          <span className="ts__tag" data-active>Active tag</span>
        </span>
      </div>
      <div className="ts__type">
        <span style={{ fontSize: "var(--fs-display)", lineHeight: "var(--lh-display)", fontVariationSettings: '"wght" 550, "opsz" 28' }}>Display · Largest number</span>
        <span style={{ fontSize: "var(--fs-title)", lineHeight: "var(--lh-title)", fontVariationSettings: '"wght" 550, "opsz" 18' }}>Title · Everyday TypeScript</span>
        <span style={{ fontSize: "var(--fs-subtitle)", lineHeight: "var(--lh-subtitle)" }}>Subtitle · Practice with arrays</span>
        <span>Body · Let's build a lesson that makes the first step inviting and gives the learner room to work things out.</span>
        <span className="ts__muted">Muted · Open a file on the left, or tell me what you'd change. <a href="#" onClick={(event) => event.preventDefault()}>A link</a></span>
        <span className="ts__muted" style={{ fontSize: "var(--fs-caption)", lineHeight: "var(--lh-caption)" }}>Caption · 13% done · 2 lessons</span>
        <code className="ts__code">const largest = Math.max(...numbers);</code>
      </div>
    </div>
  );
}

const kata = `/** The largest number in a list, or undefined for an empty one */
export function max(numbers: readonly number[]): number | undefined {
  if (numbers.length === 0) return undefined;
  let largest = numbers[0];
  for (const value of numbers.slice(1)) {
    // Keep the first of equal values
    if (value > largest) largest = value;
  }
  return largest;
}

const sample = [4, 9, 2, -7];
console.log(\`max: \${max(sample) ?? "none"}\`, 0x1f, true);
`;

const navigation: ShellSection[] = [
  { id: "views", layout: "views", items: [
    { id: "Authoring", label: "Authoring", icon: PencilEdit02Icon },
    { id: "Evaluation", label: "Evaluation", icon: CheckListIcon },
    { id: "Trial", label: "Trial", icon: PlayIcon },
  ] },
  { id: "course", heading: "Course", layout: "files", items: [
    { id: "file:dojo.yaml", label: "dojo.yaml", icon: File01Icon },
    { id: "file:DOJO.md", label: "DOJO.md", icon: File01Icon },
  ] },
  { id: "lessons", heading: "Lessons", layout: "files", items: [
    { id: "lesson:1", label: "Largest number", marker: "01", children: [{ id: "file:kata.ts", label: "kata.ts" }, { id: "file:kata.test.ts", label: "kata.test.ts" }] },
    { id: "lesson:2", label: "Positive numbers", marker: "02" },
    { id: "add", label: "New lesson", icon: PlusSignIcon },
  ] },
];

function Shell() {
  const [view, setView] = useState("Authoring");
  const [file, setFile] = useState("kata.ts");
  const [code, setCode] = useState(kata);
  const frame = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={frame} className="ts__shell">
        <AppShell workspace="Dojofoo" user={{ name: "You" }} showOnboarding showNews={false} sidebarWidth="15rem" navigation={navigation}
          brand={<a href="#" aria-label="Dojo dashboard" className="flex items-center" onClick={(event) => event.preventDefault()}><BrandLogo className="w-11" /></a>}
          active={[view, `file:${file}`]}
          onNavigate={(id) => {
            if (id.startsWith("file:")) setFile(id.slice(5));
            else if (["Authoring", "Evaluation", "Trial"].includes(id)) setView(id);
          }}>
          <div className="ts__main">
            <header className="ts__crumbs"><Breadcrumbs items={[{ label: view }, { label: "Largest number" }]} /></header>
            <Editor flush tabs={<EditorTabs mode="learning" label="Open files" active={file} tabs={[{ path: "kata.ts", label: "kata.ts" }, { path: "kata.test.ts", label: "kata.test.ts" }]} onSelect={setFile} />}
              status={<EditorStatus passed={2} total={3} />}>
              <CodeEditor code={code} filePath="kata.ts" language="typescript" lessonApiBase="" readOnly={false} coverage={false} onChange={setCode} />
            </Editor>
            <footer className="ts__details">
              <span className="ts__muted">Everyday TypeScript · 2 lessons</span>
              <b>Largest number</b>
              <span className="ts__muted">Find the largest number in a list – without Math.max.</span>
            </footer>
          </div>
        </AppShell>
      </div>
      <SchemeValues frame={frame} />
    </>
  );
}

/** The scheme as published next to what the editor paints in this theme – read from the editor itself */
function SchemeValues({ frame }: { frame: RefObject<HTMLDivElement | null> }) {
  const scheme = useEditorScheme();
  const colors = (scheme.theme as { colors?: Record<string, string> }).colors ?? {};
  return (
    <div className="ts__pair ts__scheme">
      <Swatch name={`${scheme.label} as published`} color={scheme.surface} />
      <Swatch name="Editor here" read={() => frame.current?.querySelector(".ui-ed")} />
      <Swatch name="Tab strip here" read={() => frame.current?.querySelector(".ui-ed__tabs")} />
      <Swatch name="Line highlight as published" color={colors["editor.lineHighlightBackground"] ?? "transparent"} />
    </div>
  );
}

function Group({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <div className="ts__group">
      <h3>{title}</h3>
      <p className="ts__note">{note}</p>
      {children}
    </div>
  );
}

function Stair({ level }: { level: number }) {
  return (
    <div className="ts__stair" style={{ background: surface(level), boxShadow: level > 1 ? shadow(level) : undefined }}>
      <span className="ts__stair-label">{level} <Value color={surface(level)} /></span>
      {level < 8 && <Stair level={level + 1} />}
    </div>
  );
}

type Read = () => Element | null | undefined;

/** A color and its value – a CSS color, or the background of an element read from the page */
function Swatch({ name, color, read }: { name: string; color?: string; read?: Read }) {
  const value = useResolved(color, read);
  return (
    <span className="ts__swatch">
      <i style={{ background: color ?? value.color }} />
      <span>{name}<span className="ts__value">{value.probe}{format(value.color)}</span></span>
    </span>
  );
}

function Value({ color }: { color: string }) {
  const value = useResolved(color);
  return <span className="ts__value">{value.probe}{format(value.color)}</span>;
}

/** The color as the browser resolves it here – painted on a hidden probe (or read from the element given) and measured
    again whenever the theme, the scheme or a setting changes */
function useResolved(color?: string, read?: Read) {
  const tick = useContext(Tick);
  const probe = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState("");
  useLayoutEffect(() => {
    const measure = () => {
      const target = read ? read() : probe.current;
      if (target) setValue(getComputedStyle(target).backgroundColor);
    };
    measure();
    // The editor's frame and Monaco settle a moment later
    const later = setTimeout(measure, 400);
    return () => clearTimeout(later);
  }, [color, read, tick]);
  return { color: value, probe: read ? null : <span ref={probe} hidden style={{ background: color }} /> };
}

/** Short numbers: oklch(0.2046 0 0) → oklch 0.205 0 0, alpha as a percentage */
function format(value: string) {
  const match = value.match(/^(\w+)\((.*)\)$/);
  if (!match) return value;
  const [, space, body] = match;
  const [channels, alpha] = body.split("/").map((part) => part.trim());
  const short = channels.split(/[\s,]+/).filter((part) => part !== "srgb").map((part) => (Number.isNaN(Number(part)) ? part : String(Number(Number(part).toFixed(3)))));
  return `${space === "color" ? "srgb" : space} ${short.join(" ")}${alpha ? ` / ${Math.round(Number(alpha) * 100)}%` : ""}`;
}

/** The light ladder by formula, for the experiment: from the theme's background, a step per level */
const ladderCss = (name: Ladder, steps: (level: number) => number) =>
  `.ts[data-ladder="${name}"] .ts__mode.light {\n${levels.map((level) => `  --surface-${level}: oklch(from var(--background) calc(l - ${steps(level)} * var(--ts-step)) c h);`).join("\n")}\n}`;

const css = /* css */ `
${ladderCss("rising", (level) => 8 - level)}
${ladderCss("reversed", (level) => level - 1)}

.ts { display: flex; flex-direction: column; height: 100dvh; overflow: auto; background: var(--surface-1); color: var(--fluid-foreground); font-size: var(--fs-body); line-height: var(--lh-body); }
.ts__bar { position: sticky; top: 0; z-index: 20; display: grid; gap: 8px; padding: 12px 16px; background: var(--surface-2); box-shadow: var(--shadow-2); }
.ts__line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
.ts__title { width: 96px; color: var(--fluid-muted); font-size: var(--fs-caption); }
.ts__chips { display: flex; flex-wrap: wrap; gap: 4px; }
.ts__chip { display: inline-flex; align-items: center; gap: 8px; height: 28px; padding: 0 10px; border-radius: 8px; color: var(--fluid-muted); }
.ts__chip:hover { background: var(--fluid-hover); color: var(--fluid-foreground); }
.ts__chip[aria-checked="true"] { background: var(--surface-4); color: var(--fluid-foreground); box-shadow: var(--shadow-2); }
.ts__swatches { display: inline-flex; }
.ts__swatches i { width: 12px; height: 12px; margin-left: -3px; border-radius: 50%; box-shadow: 0 0 0 1.5px var(--surface-2); }
.ts__swatches i:first-child { margin-left: 0; }
.ts__range { display: inline-flex; align-items: center; gap: 8px; color: var(--fluid-muted); font-size: var(--fs-caption); }
.ts__range[data-off] { opacity: 0.5; }
.ts__range input { width: 120px; accent-color: var(--brand); }
.ts__range output { min-width: 36px; font-family: var(--font-mono); color: var(--fluid-foreground); }

.ts__modes { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 560px), 1fr)); }
.ts__mode { min-width: 0; padding: 24px 16px 48px; background: var(--surface-1); color: var(--fluid-foreground); }
@media (min-width: 640px) { .ts__mode { padding-inline: 24px; } }
.ts__mode--wide { padding-block: 0 32px; }
.ts__mode--wide:last-child { flex: 1 0 auto; }
.ts__mode--wide .ts__group { margin-top: 0; padding-top: 28px; }
.ts__heading { margin: 0 0 16px; font-size: var(--fs-display); line-height: var(--lh-display); font-weight: 550; }
.ts__group { margin-top: 28px; }
.ts__group h3 { margin: 0; font-size: var(--fs-subtitle); line-height: var(--lh-subtitle); font-weight: 550; }
.ts__note { margin: 2px 0 12px; color: var(--fluid-muted); font-size: var(--fs-caption); line-height: var(--lh-caption); }
.ts__value { display: block; color: var(--fluid-muted); font-family: var(--font-mono); font-size: 11px; line-height: 14px; white-space: nowrap; }

.ts__pair { display: flex; flex-wrap: wrap; gap: 12px 20px; }
.ts__swatch { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
.ts__swatch > i { flex: none; width: 32px; height: 32px; border-radius: 8px; box-shadow: inset 0 0 0 1px rgb(var(--overlay) / 0.12); }

.ts__stair { padding: 10px; border-radius: 14px; }
.ts__stair .ts__stair { margin-top: 8px; border-radius: 12px; }
.ts__stair-label { display: flex; align-items: baseline; gap: 10px; font-weight: 550; }

.ts__levels { overflow: hidden; border-radius: 12px; box-shadow: var(--shadow-1); }
.ts__row { display: grid; grid-template-columns: minmax(0, 1.6fr) repeat(3, minmax(0, 1fr)); align-items: center; gap: 12px; min-height: 64px; padding: 10px 14px; }
.ts__row--head { min-height: 0; padding-block: 8px; background: var(--surface-1); color: var(--fluid-muted); font-size: var(--fs-caption); }
.ts__level { display: grid; grid-template-columns: auto 1fr; column-gap: 8px; min-width: 0; }
.ts__level b { grid-row: span 2; font-size: var(--fs-title); font-weight: 550; }
.ts__level small { overflow: hidden; color: var(--fluid-muted); font-size: var(--fs-caption); text-overflow: ellipsis; white-space: nowrap; }
.ts__level .ts__value { grid-column: 2; overflow: hidden; text-overflow: ellipsis; }
.ts__hairline { display: block; height: 1px; background: var(--fluid-hairline); }
.ts__box { display: grid; place-items: center; height: 36px; border-radius: 8px; font-weight: 550; }
.ts__box--border { border: 1px solid var(--fluid-border); }
.ts__none { color: var(--fluid-muted); font-size: var(--fs-caption); text-align: center; }

.ts__shadows { display: flex; flex-wrap: wrap; gap: 16px; padding: 4px; }
.ts__shadow { display: grid; place-items: center; width: 72px; height: 56px; border-radius: 10px; font-weight: 550; }

.ts__components { display: grid; gap: 20px; padding: 20px; border-radius: 12px; background: var(--surface-2); box-shadow: var(--shadow-3); }
.ts__strip { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
/* The shell's switch, with the same colors as its own (--switch-on – the brand – and --toggle-off in app-shell) */
.ts__switch { position: relative; width: 32px; height: 20px; border-radius: 10px; background: var(--ui-disabled, #e2e2e2); transition: background-color var(--motion-fast) var(--ease-fast); }
.ts__switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: white; box-shadow: var(--knob-shadow); transition: translate var(--motion-moderate) var(--ease-moderate); }
.ts__switch[aria-checked="true"] { background: var(--brand); }
.ts__switch[aria-checked="true"]::after { translate: 12px 0; }
.ts__tags { display: inline-flex; gap: 6px; }
.ts__tag { display: inline-flex; align-items: center; height: 24px; padding: 0 8px; border-radius: 6px; background: var(--fluid-hover); color: var(--fluid-muted); font-size: var(--fs-caption); }
.ts__tag[data-active] { background: var(--fluid-active); color: var(--fluid-foreground); }
.ts__type { display: grid; gap: 6px; }
.ts__muted { color: var(--fluid-muted); }
.ts__muted a { color: var(--fluid-foreground); text-decoration: underline; text-decoration-color: var(--fluid-border); text-underline-offset: 3px; }
.ts__code { justify-self: start; padding: 2px 6px; border-radius: 6px; background: var(--fluid-hover); font-family: var(--font-mono); font-size: 13px; }

.ts__shell { height: 680px; overflow: hidden; border-radius: 12px; box-shadow: var(--shadow-1); }
/* The main panel as in the authoring workspace: breadcrumbs, the editor (square) and the lesson's details below */
.ts__main { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.ts__main > .ui-ed { flex: 1; }
.ts__crumbs { display: flex; flex: none; align-items: center; height: 52px; padding: 0 20px; }
.ts__details { display: grid; flex: none; gap: 4px; padding: 16px 20px 20px; box-shadow: inset 0 1px 0 var(--fluid-hairline); }
.ts__scheme { margin-top: 16px; }
`;
