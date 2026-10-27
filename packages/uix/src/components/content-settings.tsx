import { useEffect, useState, type ReactNode } from "react";
import { Button } from "./button";
import { MenuButton } from "./app-shell";
import { Icon } from "./app-shell";
import { SegmentedControl } from "./segmented-control";
import { Switch } from "./switch";
import { Cancel01Icon } from "../lib/icons";
import { resetContentPreferences, setContentPreferences, useContentPreferences, type ContentKind } from "../lib/content-preferences";
import { editorSizes, setUiPreferences, useUiPreferences } from "../lib/ui-preferences";

const labels: Record<ContentKind, string> = { material: "Material", video: "Video", slides: "Slides", code: "Code" };
const descriptions: Record<ContentKind, string> = {
  material: "How you read lessons and browse their resources.",
  video: "Remembered defaults. Playback controls remain in the player.",
  slides: "How Dojo slide decks fit, navigate and move.",
  code: "Adjust the editor without changing your code.",
};

export function ContentSettings({ kind = "code", onClose }: { kind?: ContentKind | "all"; onClose: () => void }) {
  const preferences = useContentPreferences();
  const { editorSize } = useUiPreferences();
  const [section, setSection] = useState<ContentKind>(kind === "all" ? "material" : kind);
  useEffect(() => { setSection(kind === "all" ? "material" : kind); }, [kind]);
  const sections: ContentKind[] = kind === "all" ? ["material", "video", "slides", "code"] : kind === "material" ? ["material"] : ["material", kind];
  const reset = () => { resetContentPreferences(section); if (section === "code") setUiPreferences({ editorSize: 16.5 }); };
  return <aside className="ui-as-brief ui-content-settings" aria-label="Settings">
    <style href="ui-content-settings" precedence="default">{css}</style>
    <header className="ui-content-settings__header"><b>Content settings</b><button type="button" className="ui-content-settings__close" aria-label="Close settings" onClick={onClose}><Icon icon={Cancel01Icon} size={15} /></button></header>
    <SegmentedControl kind="tabs" fill label="Content settings sections" options={sections.map(key => labels[key])} value={labels[section]} onChange={label => setSection(sections.find(key => labels[key] === label)!)} className="ui-content-settings__tabs" />
    <div className="ui-content-settings__body scroll-fade" role="tabpanel" aria-label={labels[section]}>
      <p className="ui-content-settings__intro">{descriptions[section]}</p>
      {section === "material" && <>
        <Choice label="Text size" value={String(preferences.material.textSize)} options={[["13", "Small"], ["15", "Default"], ["17", "Large"]]} onChange={value => setContentPreferences("material", { textSize: Number(value) })} />
        <Choice label="Reading width" value={preferences.material.width} options={[["comfortable", "Comfortable"], ["wide", "Wide"]]} onChange={value => setContentPreferences("material", { width: value as "comfortable" | "wide" })} />
        <Choice label="Resources" value={preferences.material.resources} options={[["inline", "Inline"], ["panel", "Side panel"]]} onChange={value => setContentPreferences("material", { resources: value as "inline" | "panel" })} />
        <Toggle label="Resource previews" note="Expand the resource list by default." checked={preferences.material.previews} onChange={previews => setContentPreferences("material", { previews })} />
      </>}
      {section === "video" && <>
        <Choice label="Playback speed" value={String(preferences.video.speed)} options={[.75, 1, 1.25, 1.5, 1.75, 2].map(speed => [String(speed), `${speed}×`])} onChange={value => setContentPreferences("video", { speed: Number(value) })} />
        <Toggle label="Captions" note="Show captions when the video provides them." checked={preferences.video.captions} onChange={captions => setContentPreferences("video", { captions })} />
        <Toggle label="Resume playback" note="Continue where you stopped watching." checked={preferences.video.resume} onChange={resume => setContentPreferences("video", { resume })} />
        <Toggle label="Autoplay next video" note="Continue to the next available chapter video." checked={preferences.video.autoplay} onChange={autoplay => setContentPreferences("video", { autoplay })} />
      </>}
      {section === "slides" && <>
        <Choice label="Slide fit" value={preferences.slides.fit} options={[["window", "Fit to window"], ["width", "Fit to width"]]} onChange={value => setContentPreferences("slides", { fit: value as "window" | "width" })} />
        <Toggle label="Slide thumbnails" note="Show a strip for jumping between slides." checked={preferences.slides.thumbnails} onChange={thumbnails => setContentPreferences("slides", { thumbnails })} />
        <Toggle label="Slide progress" checked={preferences.slides.progress} onChange={progress => setContentPreferences("slides", { progress })} />
        <Toggle label="Reduced slide motion" note="Also respects your device’s reduced-motion setting." checked={preferences.slides.reducedMotion} onChange={reducedMotion => setContentPreferences("slides", { reducedMotion })} />
      </>}
      {section === "code" && <>
        <Choice label="Code font size" value={String(editorSize)} options={editorSizes.map(size => [String(size), `${size} px`])} onChange={value => setUiPreferences({ editorSize: Number(value) })} />
        <Toggle label="Line wrapping" checked={preferences.code.wrap} onChange={wrap => setContentPreferences("code", { wrap })} />
        <Toggle label="Line numbers" checked={preferences.code.lineNumbers} onChange={lineNumbers => setContentPreferences("code", { lineNumbers })} />
        <Toggle label="Indentation guides" checked={preferences.code.indentationGuides} onChange={indentationGuides => setContentPreferences("code", { indentationGuides })} />
        <Toggle label="Coverage markers" note="Show coverage supplied by the lesson’s tests." checked={preferences.code.coverage} onChange={coverage => setContentPreferences("code", { coverage })} />
      </>}
    </div>
    <footer className="ui-content-settings__footer"><small>Changes apply immediately.</small><Button size="sm" variant="ghost" aria-label={`Reset ${labels[section]} defaults`} onClick={reset}>Reset defaults</Button></footer>
  </aside>;
}
function Row({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return <div className="ui-content-settings__row"><span>{label}{note && <small>{note}</small>}</span>{children}</div>;
}
function Toggle({ label, note, checked, onChange }: { label: string; note?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <Row label={label} note={note}><Switch aria-label={label} checked={checked} onCheckedChange={onChange} /></Row>;
}
function Choice({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) {
  return <Row label={label}><MenuButton label={label} value={value} options={options.map(([value, label]) => ({ value, label }))} onChange={onChange} /></Row>;
}
const css = `
.ui-content-settings.ui-as-brief { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; color: var(--fluid-foreground); }
.ui-content-settings__header { display: flex; flex: none; align-items: center; justify-content: space-between; height: 52px; padding: 0 20px; font-size: var(--fs-body); }
.ui-content-settings__header b { font-weight: 550; }
.ui-content-settings__close { display: grid; place-items: center; width: 28px; height: 28px; border-radius: calc(6px * var(--squircle-factor, 1)); }
.ui-content-settings__close:hover { background: var(--fluid-hover); }
.ui-content-settings__tabs { flex: none; width: auto !important; margin: 16px 20px 4px; }
.ui-content-settings__body { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 20px; }
.ui-content-settings__intro { margin: 0 0 14px; color: var(--fluid-muted); font-size: var(--fs-body); line-height: 1.5; }
.ui-content-settings__row { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 56px; padding: 10px 0; font-size: var(--fs-body); }
.ui-content-settings__row > span { min-width: 0; }
.ui-content-settings__row small { display: block; max-width: 28ch; margin-top: 4px; color: var(--fluid-muted); font-size: var(--fs-caption); line-height: 1.4; }
.ui-content-settings__row > .ui-as-anchor { flex: none; max-width: 52%; }
.ui-content-settings__row .ui-as-tool { min-height: 32px; }
.ui-content-settings__footer { display: flex; flex: none; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--fluid-hairline); }
.ui-content-settings__footer small { color: var(--fluid-muted); font-size: var(--fs-caption); }
.ui-content-settings :is(button):focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
`;
