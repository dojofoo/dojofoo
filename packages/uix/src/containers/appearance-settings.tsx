import { Switch } from "../components/switch";
import { useState } from "react";
import { ColorSchemeChoices } from "./agent-chat";
import { CodeEditor, Editor, EditorTabs } from "./editor";
import { setPageMode, setUiPreferences, uiThemes, usePageMode, useUiPreferences } from "../lib/ui-preferences";

const files = {
  "merge.ts": `type Settings = { theme: string; fontSize?: number };

/** Defaults first, then what the user chose */
export function merge(defaults: Settings, overrides: Partial<Settings>): Settings {
  return { ...defaults, ...overrides };
}

const settings = merge({ theme: "dojofoo", fontSize: 14 }, { fontSize: 16 });
`,
  "merge.test.ts": `import { expect, it } from "vitest";
import { merge } from "./merge";

it("keeps the defaults it isn't given", () => {
  expect(merge({ theme: "dojofoo", fontSize: 14 }, {})).toEqual({ theme: "dojofoo", fontSize: 14 });
});
`,
};

export function AppearanceSettings({ showMode = true }: { showMode?: boolean }) {
  const [file, setFile] = useState<keyof typeof files>("merge.ts");
  const preferences = useUiPreferences();
  const mode = usePageMode();
  return <>
    <style href="ui-appearance-settings" precedence="default">{css}</style>
    {showMode && <div className="ui-setup__mode ui-appearance-mode">
      <span aria-hidden="true" data-on={mode === "light" || undefined}>Light</span>
      <Switch checked={mode === "dark"} aria-label="Dark mode" onCheckedChange={dark => setPageMode(dark ? "dark" : "light")} />
      <span aria-hidden="true" data-on={mode === "dark" || undefined}>Dark</span>
    </div>}
    <div className="ui-setup__style">
                <div className="ui-setup__looks">
                  <section className="ui-as-brief__section" role="radiogroup" aria-label="Theme">
                    <span className="ui-as-brief__label">Theme</span>
                    {uiThemes.map((theme) => (
                      <button key={theme.id} type="button" role="radio" aria-checked={preferences.theme === theme.id} className="ui-as-brief__option" onClick={() => setUiPreferences({ theme: theme.id })}>
                        <span className="ui-as-brief__radio" aria-hidden="true" />
                        <span className="ui-as-brief__name">{theme.label}</span>
                        <span className="ui-as-brief__swatches" aria-hidden="true">{theme.swatches.map((color, i) => <i key={i} style={{ background: color }} />)}</span>
                      </button>
                    ))}
                  </section>
                  <ColorSchemeChoices notes={false} />
                </div>
                {/* The code, full width and unframed, in the scheme just picked */}
                <div className="ui-setup__code">
                  <Editor flush tabs={<EditorTabs mode="learning" label="Preview files" active={file} tabs={(Object.keys(files) as (keyof typeof files)[]).map((path) => ({ path, label: path }))} onSelect={(path) => setFile(path as keyof typeof files)} />}>
                    <CodeEditor code={files[file]} filePath={`preview/${file}`} language="typescript" lessonApiBase="" readOnly coverage={false} onChange={() => {}} />
                  </Editor>
                </div>
              </div>
  </>;
}

const css = /* css */ `
.ui-appearance-mode { margin: 12px 0 28px; }
.ui-setup__mode { display: inline-flex; flex: none; align-items: center; gap: 8px; color: var(--muted); font-size: var(--fs-caption); }
.ui-setup__mode [data-on] { color: var(--ink); }
.ui-setup__looks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 36px; }
.ui-setup__looks .ui-as-brief__section { padding: 0; border-top: 0; }
.ui-setup__looks .ui-as-brief__label { padding-bottom: 6px; }
.ui-setup__code { height: 220px; margin: 20px -28px -4px; overflow: hidden; border-top: 1px solid var(--fluid-hairline); }
.ui-setup__code .ui-ed { height: 100%; }
.ui-account-appearance .ui-setup__code { height: 280px; margin: 28px 0 0; }
.ui-account-appearance .ui-as-brief__option { margin-inline: 0; }
@container ui-as-main (max-width: 620px) {
  .ui-setup__looks { grid-template-columns: minmax(0, 1fr); }
  .ui-setup__code { margin-inline: -18px; }
  .ui-account-appearance .ui-setup__code { margin-inline: 0; }
}
`;
