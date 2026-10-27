import { DataTable, type DataColumn } from "./data-table-clean";
import { Icon } from "./app-shell";
import { Markdown } from "./markdown";
import { Cancel01Icon, DoneIcon } from "../lib/icons";
import { usePageMode } from "../lib/ui-preferences";

export type EditorTestResult = {
  name: string;
  suite: string;
  status: "passed" | "failed" | "skipped";
  durationMs?: number;
  message?: string;
  expected?: string;
  received?: string;
  location?: { filePath: string; line: number };
};

const columns: DataColumn[] = [
  { key: "name", label: "Test", editable: false },
  { key: "duration", label: "Duration", width: "80px", editable: false },
];

function codeBlock(value: string) {
  const fence = "`".repeat(Math.max(3, ...Array.from(value.matchAll(/`+/g), match => match[0].length + 1)));
  return `${fence}json\n${value}\n${fence}`;
}

/** AffectUI's clean data table, with status marks instead of row selection. */
export function EditorTestResults({ tests, onReveal }: {
  tests: EditorTestResult[];
  onReveal?: (location: NonNullable<EditorTestResult["location"]>) => void;
}) {
  const mode = usePageMode();
  const rows = tests.map((test, index) => ({ id: String(index), name: test.name, duration: test.durationMs === undefined ? "" : `${test.durationMs} ms` }));
  return <div className={`ui-ed-results-window scroll-fade ${mode}`}>
    <style href="ui-editor-test-results" precedence="default">{css}</style>
    <DataTable title="Test results" className="ui-ed-results" columns={columns} rows={rows}
      editable={false} header={false} footer={false} columnHeaders={false}
      rowControl={row => {
        const test = tests[Number(row.id)];
        return <span role="img" aria-label={test.status === "passed" ? "Passed" : test.status === "failed" ? "Failed" : "Skipped"}
          className="ui-test-mark" data-state={test.status}>
          {test.status === "passed" ? <Icon icon={DoneIcon} size={14} />
            : test.status === "failed" ? <Icon icon={Cancel01Icon} size={16} stroke={2} />
            : <i className="ui-test-mark__dot" />}
        </span>;
      }}
      renderCell={(row, column) => {
        if (column.key === "duration") return <span className="ui-test-duration">{row.duration}</span>;
        const test = tests[Number(row.id)];
        const details = [test.message,
          test.expected === undefined ? "" : `**Expected**\n\n${codeBlock(test.expected)}`,
          test.received === undefined ? "" : `**Received**\n\n${codeBlock(test.received)}`,
        ].filter(Boolean).join("\n\n");
        return <div className="ui-test-content">
          <span className="ui-test-name"><span className="ui-test-suite">{test.suite} / </span>{test.name}</span>
          {details && <Markdown source={details} />}
          {test.location && onReveal && <button type="button" className="ui-test-location" onClick={() => onReveal(test.location!)}>
            {test.location.filePath}:{test.location.line}
          </button>}
        </div>;
      }} />
  </div>;
}

const css = /* css */ `
.ui-ed-results-window { height: 100%; overflow: auto; background: var(--surface-2); color: var(--fluid-foreground); }
.ui-dtc.ui-ed-results {
  --ui-dtc-card: var(--surface-2);
  --ui-dtc-ink: var(--fluid-foreground);
  --ui-dtc-text: var(--fluid-foreground);
  --ui-dtc-muted: var(--fluid-muted);
  --ui-dtc-line: var(--fluid-hairline);
  --ui-dtc-row-hover: var(--fluid-hover);
  --ui-dtc-selected: var(--fluid-active);
  --ui-dtc-accent: var(--brand);
  --ui-dtc-active-blur: var(--brand);
  --ui-dtc-shadow: none;
  border-radius: 0;
  min-height: 100%;
  font-family: var(--font-mono);
}
.ui-ed-results .ui-dtc__table { min-width: 0; }
.ui-ed-results .ui-dtc__table td { height: 44px; vertical-align: top; padding-top: 12px; padding-bottom: 12px; white-space: normal; }
.ui-ed-results .ui-dtc__table tr:first-child td { border-top: 0; }
.ui-ed-results .ui-dtc__table .ui-dtc__select { padding-top: 14px; }
.ui-test-mark { display: grid; place-items: center; width: 16px; height: 16px; margin: 0 auto; color: var(--brand); }
.ui-test-mark__dot { width: 5px; height: 5px; border-radius: 50%; corner-shape: round; background: currentColor; }
.ui-test-content { min-width: 0; }
.ui-test-name { font-weight: 500; overflow-wrap: anywhere; }
.ui-test-suite, .ui-test-duration { color: var(--fluid-muted); font-weight: 400; }
.ui-test-duration { display: block; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.ui-test-location { margin-top: 8px; color: var(--fluid-muted); font-size: 12px; text-decoration: underline; text-underline-offset: 3px; }
.ui-test-location:hover { color: var(--brand); }
.ui-result-markdown { margin-top: 8px; overflow-wrap: anywhere; color: var(--fluid-muted); }
.ui-result-markdown p + p { margin-top: 8px; }
.ui-result-markdown pre { margin: 6px 0 10px; padding: 10px 12px; white-space: pre-wrap; overflow-wrap: anywhere; border-radius: calc(6px * var(--squircle-factor, 1)); font-size: 12px; line-height: 20px; }
.ui-result-markdown code { font-family: var(--font-mono); white-space: inherit; }
.ui-result-markdown a { color: var(--brand); text-decoration: underline; }
`;
