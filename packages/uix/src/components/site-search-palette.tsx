import { CommandPalette, type CommandPaletteProps } from "./command-palette";
import { SegmentedControl } from "./segmented-control";

export type SearchScope = "courses" | "docs";
export type SiteSearchPaletteProps = Omit<CommandPaletteProps, "header" | "filter" | "assistant" | "searchLabel" | "placeholder"> & {
  scope: SearchScope;
  onScopeChange: (scope: SearchScope) => void;
};

/** The Dojo command palette, with website search providers instead of commands. */
export function SiteSearchPalette({ scope, onScopeChange, ...props }: SiteSearchPaletteProps) {
  const label = scope === "docs" ? "Search docs" : "Search courses";
  return <CommandPalette {...props} searchLabel={label} placeholder={label === "Search docs" ? "Search documentation…" : "Search courses by name, language or topic…"}
    filter={false} assistant={false} shortcut={["⌘", "K"]}
    header={<div className="ui-site-search__scopes">
      <style href="ui-site-search" precedence="default">{`.ui-site-search__scopes { padding: 8px 12px; border-bottom: 1px solid var(--fluid-hairline); }`}</style>
      <SegmentedControl kind="tabs" label="Search in" options={["Courses", "Docs"]} value={scope === "docs" ? "Docs" : "Courses"} onChange={value => onScopeChange(value === "Docs" ? "docs" : "courses")} />
    </div>} />;
}
