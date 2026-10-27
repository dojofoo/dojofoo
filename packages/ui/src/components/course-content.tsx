import { Icon } from "@dojofoo/uix/components/app-shell";
import { File02Icon } from "@dojofoo/uix/icons";
import { VideoStage } from "@dojofoo/uix/containers/video-stage";
import { TeachingMarkdown } from "./teaching-markdown";
import { courseAssetUrl as assetUrl } from "../lib/course-asset-url";

type Props = {
  basePath: string | null;
  children: string;
  workspaceId: string;
  courseId?: string;
  diagrams?: boolean;
};

type ComponentToken = {
  type: "Artifact" | "Interactive" | "RegexWorkbench" | "Video";
  attributes: Record<string, string>;
};

const componentPattern = /<(Artifact|Interactive|RegexWorkbench|Video)\s+([^>]*?)\s*\/>/gu;
const attributePattern = /([A-Za-z][\w-]*)=["']([^"']*)["']/gu;

export function CourseContent({ basePath, children, workspaceId, courseId, diagrams = true }: Props) {
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
        ? <TeachingMarkdown key={index} basePath={basePath} workspaceId={workspaceId} courseId={courseId} source={block} diagrams={diagrams} />
        : <CourseComponent basePath={basePath} key={index} token={block} workspaceId={workspaceId} courseId={courseId} />)}
    </div>
  );
}

function CourseComponent({ basePath, token, workspaceId, courseId }: { basePath: string | null; token: ComponentToken; workspaceId: string; courseId?: string }) {
  if (token.type === "RegexWorkbench") return <RegexWorkbench attributes={token.attributes} />;
  const source = token.attributes.src;
  if (!source) return <p role="alert" className="text-sm text-destructive">{token.type} requires a src attribute.</p>;
  const url = assetUrl(source, basePath, workspaceId, courseId);
  const title = token.attributes.title || source.split("/").at(-1) || token.type;
  if (token.type === "Artifact") {
    return (
      <a className="flex items-center gap-3 rounded-[var(--box-radius)] bg-[var(--surface-3)] px-4 py-3 text-sm text-[var(--fluid-foreground)] shadow-[var(--shadow-2)] transition-colors hover:bg-[var(--fluid-hover)]" href={`${url}${url.includes("?") ? "&" : "?"}download=1`}>
        <Icon icon={File02Icon} size={18} />
        <span className="min-w-0 break-words font-medium">{title}</span>
      </a>
    );
  }
  if (token.type === "Video") {
    return <div className="aspect-video w-full overflow-hidden rounded-[var(--box-radius)] bg-[var(--surface-1)]"><VideoStage src={url} title={title} ambient={false} /></div>;
  }
  return <iframe className="min-h-96 w-full rounded-[var(--box-radius)] bg-[var(--surface-1)] shadow-[var(--shadow-2)]" sandbox="allow-scripts" src={url} title={title} />;
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
    <figure aria-label="Regex workbench" className="rounded-[var(--box-radius)] bg-[var(--surface-3)] p-4 text-sm text-[var(--fluid-foreground)] shadow-[var(--shadow-2)]">
      <figcaption className="text-sm font-medium">Regex workbench</figcaption>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="min-w-0 rounded-[var(--box-radius)] bg-[var(--surface-2)] p-3"><span className="block text-xs text-muted-foreground">Input</span><code className="mt-1 block whitespace-pre-wrap break-words">{JSON.stringify(input)}</code></div>
        <div className="min-w-0 rounded-[var(--box-radius)] bg-[var(--surface-2)] p-3"><span className="block text-xs text-muted-foreground">Pattern</span><code className="mt-1 block break-words">/{pattern}/{flags}</code></div>
        <div className="min-w-0 rounded-[var(--box-radius)] bg-[var(--surface-2)] p-3"><span className="block text-xs text-muted-foreground">Output</span><code className="mt-1 block whitespace-pre-wrap break-words">{JSON.stringify(output)}</code></div>
      </div>
    </figure>
  );
}

function parseAttributes(source: string): Record<string, string> {
  return Object.fromEntries([...source.matchAll(attributePattern)].map((match) => [match[1], match[2]]));
}
