import "../styles/editor.css";
import { CommandPalette, type CommandPaletteProps } from "./command-palette";
import { EditorTabs } from "./editor";
import { usePageMode } from "../lib/ui-preferences";

export type SearchScope = "courses" | "docs";
export type SiteSearchPaletteProps = Omit<CommandPaletteProps, "header" | "filter" | "assistant" | "searchLabel" | "placeholder"> & {
  scope: SearchScope;
  onScopeChange: (scope: SearchScope) => void;
};

/** The tabs name what they search; a tab's id doubles as its tooltip, so it is the label */
const scopes = [{ path: "Courses", label: "Courses", scope: "courses" }, { path: "Docs", label: "Docs", scope: "docs" }] as const;

/*
 * Where the search looks, as the editor's and the API docs' tabs: one tab open at a time, joined to the results below
 * it (the palette's surface, not the code scheme's) under the brand line, the other on the darker strip
 */
const css = /* css */ `
.ui-site-search__scopes { --ui-ed-line: var(--fluid-hairline); background: color-mix(in oklab, var(--surface-5), black 12%); }
.ui-site-search__scopes .ui-ed__tab[data-active] { background: var(--surface-5); color: var(--fluid-foreground); }
`;

/** The Dojo command palette, with website search providers instead of commands. */
export function SiteSearchPalette({ scope, onScopeChange, ...props }: SiteSearchPaletteProps) {
  const label = scope === "docs" ? "Search docs" : "Search courses";
  const mode = usePageMode();
  return <CommandPalette {...props} searchLabel={label} placeholder={label === "Search docs" ? "Search documentation…" : "Search courses by name, language or topic…"}
    filter={false} assistant={false} shortcut={["⌘", "K"]}
    header={<div className="ui-ed__tabs ui-site-search__scopes">
      <style href="ui-site-search" precedence="default">{css}</style>
      <EditorTabs mode="learning" scheme={{ type: mode }} label="Search in" tabs={[...scopes]}
        active={scopes.find(item => item.scope === scope)!.path}
        onSelect={path => onScopeChange(scopes.find(item => item.path === path)!.scope)} />
    </div>} />;
}
