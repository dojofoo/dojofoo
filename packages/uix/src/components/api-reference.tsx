import { createOpenAPIPageBase } from "fumadocs-openapi/ui/base";
import type { OpenAPIPageProps_Preloaded } from "fumadocs-openapi/ui";
import { createCodeUsageGeneratorRegistry } from "fumadocs-openapi/requests/generators";
import { curl } from "fumadocs-openapi/requests/generators/curl";
import { createShikiFactory } from "fumadocs-core/highlight/shiki";
import { createBundledHighlighter } from "shiki/dist/core.mjs";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { bundledLanguages } from "shiki/langs";
import { bundledThemes } from "shiki/themes";
import { CodeBlock } from "~/components/code-block";
import prepared from "../../../../apps/web/src/generated/course-api.json";

const createHighlighter = createBundledHighlighter<string, string>({ langs: bundledLanguages, themes: bundledThemes, engine: () => createJavaScriptRegexEngine({ forgiving: true }) });
const shiki = createShikiFactory({ init: options => createHighlighter({ themes: [], langs: [], langAlias: options?.langAlias }) });

// One way to send a request: the API is plain HTTP, so cURL shows it whole
const codeUsages = createCodeUsageGeneratorRegistry();
codeUsages.add("curl", curl);

// Fumadocs renders the operation, kept to what a reader needs: the method and path, the parameters and the request
// body on the left; on the right a request and the example response for each status. No playground, no TypeScript
// definitions, and no response schema – the API's response fields carry no descriptions, so the examples say it all.
// Its code is the docs' code block (CodeBlock: the editor scheme's colors, the same box and copy button).
const NativeAPIPage = createOpenAPIPageBase({
  shiki,
  codeUsages,
  generateTypeScriptDefinitions: false,
  showResponseSchema: false,
  playground: { enabled: false },
  components: { CodeBlock },
  content: {
    renderOperationLayout(slots) {
      return <div className="ui-api-operation">
        <div className="ui-api-operation__body">
          {slots.header}
          <div data-api-request>{slots.apiPlayground}</div>
          {/* The page lead already displays the operation description. */}
          {slots.authSchemes}{slots.parameters}{slots.body}{slots.callbacks}
        </div>
        <aside className="ui-api-operation__examples" aria-label="Request and response examples">{slots.apiExample}</aside>
      </div>;
    },
  },
});

type Prepared = OpenAPIPageProps_Preloaded["preloaded"];
type PageProps = Omit<OpenAPIPageProps_Preloaded, "preloaded">;
const snapshot = prepared as unknown as { preloaded: Prepared; pages: Record<string, PageProps> };
export type APIPageProps = PageProps & { preloaded?: Prepared };

export function APIPage(props: APIPageProps | { page: string }) {
  const options = "page" in props ? snapshot.pages[props.page] : props;
  const preloaded = "page" in props ? snapshot.preloaded : props.preloaded ?? snapshot.preloaded;
  if (!options) throw new Error("Missing prepared Fumadocs OpenAPI page.");
  return <div className="ui-api-reference not-prose">
    <NativeAPIPage {...options} preloaded={preloaded} />
  </div>;
}
