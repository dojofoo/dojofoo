import { FileText } from "@mynaui/icons-react";
import { TeachingMarkdown } from "./teaching-markdown";
import { courseAssetUrl as assetUrl } from "../lib/course-asset-url";

type Props = {
  basePath: string | null;
  children: string;
  workspaceId: string;
};

type ComponentToken = {
  type: "Artifact" | "Interactive" | "RegexWorkbench" | "Video";
  attributes: Record<string, string>;
};

const componentPattern = /<(Artifact|Interactive|RegexWorkbench|Video)\s+([^>]*?)\s*\/>/gu;
const attributePattern = /([A-Za-z][\w-]*)=["']([^"']*)["']/gu;

export function CourseContent({ basePath, children, workspaceId }: Props) {
  const blocks: Array<string | ComponentToken> = [];
  let offset = 0;
  for (const match of children.matchAll(componentPattern)) {
    if (match.index > offset) blocks.push(children.slice(offset, match.index));
    blocks.push({ type: match[1] as ComponentToken["type"], attributes: parseAttributes(match[2]) });
    offset = match.index + match[0].length;
  }
  if (offset < children.length) blocks.push(children.slice(offset));

  return (
    <div className="course-content space-y-5 font-prose leading-7 text-muted-foreground">
      {blocks.map((block, index) => typeof block === "string"
        ? <TeachingMarkdown key={index} basePath={basePath} workspaceId={workspaceId} source={block} />
        : <CourseComponent basePath={basePath} key={index} token={block} workspaceId={workspaceId} />)}
    </div>
  );
}

function CourseComponent({ basePath, token, workspaceId }: { basePath: string | null; token: ComponentToken; workspaceId: string }) {
  if (token.type === "RegexWorkbench") return <RegexWorkbench attributes={token.attributes} />;
  const source = token.attributes.src;
  if (!source) return <p className="border border-red-900/60 p-3 text-sm text-red-300">{token.type} requires a src attribute.</p>;
  const url = assetUrl(source, basePath, workspaceId);
  const title = token.attributes.title || source.split("/").at(-1) || token.type;
  if (token.type === "Artifact") {
    return (
      <a className="flex items-center gap-3 border border-border bg-background p-4 text-sm text-foreground transition-colors hover:border-primary" href={`${url}${url.includes("?") ? "&" : "?"}download=1`}>
        <FileText size={18} />
        <span className="font-sans font-medium">{title}</span>
      </a>
    );
  }
  if (token.type === "Video") {
    return <video className="w-full border border-border bg-black" controls preload="metadata" src={url} title={title} />;
  }
  return <iframe className="min-h-96 w-full border border-border bg-white" sandbox="allow-scripts" src={url} title={title} />;
}

function RegexWorkbench({ attributes }: { attributes: Record<string, string> }) {
  const input = attributes.input ?? "";
  const pattern = attributes.pattern ?? "";
  const flags = attributes.flags ?? "";
  const replacement = attributes.replacement ?? "";
  let output = "Invalid regular expression";
  try {
    output = input.replace(new RegExp(pattern, flags), replacement);
  } catch {
    // Keep the authored component safe and legible when its pattern is incomplete.
  }
  return (
    <figure className="border border-border bg-background p-4 font-sans text-sm text-foreground">
      <figcaption className="font-display text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Regex workbench</figcaption>
      <div className="mt-4 grid gap-px bg-border sm:grid-cols-3">
        <div className="bg-surface-1 p-3"><span className="block font-display text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Input</span><code className="mt-1 block whitespace-pre-wrap">{JSON.stringify(input)}</code></div>
        <div className="bg-surface-1 p-3"><span className="block font-display text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Pattern</span><code className="mt-1 block">/{pattern}/{flags}</code></div>
        <div className="bg-surface-1 p-3"><span className="block font-display text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Output</span><code className="mt-1 block whitespace-pre-wrap">{JSON.stringify(output)}</code></div>
      </div>
    </figure>
  );
}

function parseAttributes(source: string): Record<string, string> {
  return Object.fromEntries([...source.matchAll(attributePattern)].map((match) => [match[1], match[2]]));
}
