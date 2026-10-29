import { createOpenAPIPageBase } from "fumadocs-openapi/ui/base";
import type { OpenAPIPageProps_Preloaded } from "fumadocs-openapi/ui";
import { createCodeUsageGeneratorRegistry } from "fumadocs-openapi/requests/generators";
import { curl } from "fumadocs-openapi/requests/generators/curl";
import { createShikiFactory } from "fumadocs-core/highlight/shiki";
import { createBundledHighlighter } from "shiki/dist/core.mjs";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { bundledLanguages } from "shiki/langs";
import { bundledThemes } from "shiki/themes";
import { Children, isValidElement, useState, type ReactNode } from "react";
import { CodeLines, CodeWindow, CodeWindowBlock } from "./code-window";

const createHighlighter = createBundledHighlighter<string, string>({ langs: bundledLanguages, themes: bundledThemes, engine: () => createJavaScriptRegexEngine({ forgiving: true }) });
const shiki = createShikiFactory({ init: options => createHighlighter({ themes: [], langs: [], langAlias: options?.langAlias }) });

// One way to send a request: the API is plain HTTP, so cURL shows it whole
const codeUsages = createCodeUsageGeneratorRegistry();
codeUsages.add("curl", curl);

// Fumadocs renders the operation, kept to what a reader needs: the method and path, the parameters and the request
// body on the left; on the right a request and the example response for each status. No playground, no TypeScript
// definitions, and no response schema – the API's response fields carry no descriptions, so the examples say it all.
// Its code is the editor's, as the docs' code blocks are (components/code-window): the request in a window with its one
// tab, the responses in another with a tab for each status.
const NativeAPIPage = createOpenAPIPageBase({
  shiki,
  codeUsages,
  generateTypeScriptDefinitions: false,
  showResponseSchema: false,
  playground: { enabled: false },
  components: { CodeBlock: CodeWindowBlock },
  content: {
    renderAPIExampleLayout: (slots) => <>
      {slots.selector}
      <CodeWindow label="Request" tabs={[{ id: "curl", label: "cURL" }]} active="curl">{slots.usageTabs}</CodeWindow>
      {slots.responseTabs}
    </>,
    renderResponseTabs: ({ tabs }) => <Responses tabs={tabs} />,
    renderOperationLayout(slots, { method }) {
      const path = routeOf(slots.apiPlayground);
      return <div className="ui-api-operation">
        <div className="ui-api-operation__body">
          {slots.header}
          <div data-api-request>{path ? <RequestLine method={method.toUpperCase()} path={path} /> : slots.apiPlayground}</div>
          {/* The page lead already displays the operation description. */}
          {slots.authSchemes}{slots.parameters}{slots.body}{slots.callbacks}
        </div>
        <aside className="ui-api-operation__examples" aria-label="Request and response examples">{slots.apiExample}</aside>
      </div>;
    },
  },
});

/** The path on Fumadocs' request line (in the playground's place, with the playground off): its code's text */
function routeOf(line: ReactNode) {
  const parts = isValidElement<{ children?: ReactNode }>(line) ? Children.toArray(line.props.children) : [];
  const code = parts.find(part => isValidElement(part) && part.type === "code");
  return isValidElement<{ children?: ReactNode }>(code) && typeof code.props.children === "string" ? code.props.children : undefined;
}

/** The request line as the examples show code: a window with no tabs, the method in its color, then the path */
function RequestLine({ method, path }: { method: string; path: string }) {
  return <CodeWindow label="Request URL">
    <pre className="ui-cw-code scroll-fade-x"><code><span className="line"><span className="ui-api-method" data-method={method}>{method}</span> {path}</span></code></pre>
  </CodeWindow>;
}

/** The example responses, a tab for each status: its example's JSON, or that it has none */
function Responses({ tabs }: { tabs: { code: string; examples?: { sample: unknown }[] }[] }) {
  const [active, setActive] = useState(tabs[0].code);
  const tab = tabs.find(item => item.code === active) ?? tabs[0];
  const sample = tab.examples?.[0]?.sample;
  return <CodeWindow label="Responses" tabs={tabs.map(item => ({ id: item.code, label: item.code }))} active={tab.code} onSelect={setActive}>
    {sample === undefined ? <p className="ui-api-empty">No content</p> : <CodeLines code={JSON.stringify(sample, null, 2)} lang="json" />}
  </CodeWindow>;
}

export type APIPageProps = OpenAPIPageProps_Preloaded;

export function APIPage(props: APIPageProps) {
  if (!props.preloaded?.docs[props.document]) throw new Error(`Missing prepared Fumadocs OpenAPI document: ${props.document}.`);
  return <div className="ui-api-reference not-prose">
    <NativeAPIPage {...props} />
  </div>;
}
