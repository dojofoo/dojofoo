import type { AuthoringDraft } from "@dojofoo/authoring/service";
import { defineCatalog, type Spec } from "@json-render/core";
import { defineRegistry, JSONUIProvider, Renderer } from "@json-render/react";
import { schema } from "@json-render/react/schema";
import { z } from "zod";
import { parse as parseYaml } from "yaml";
import { CourseContent } from "@/components/course-content";
import { ScrollArea } from "@dojofoo/ui/scroll-area";
import { LessonBrief } from "@dojofoo/uix/components/lesson-brief";
import { CodeBlock } from "@dojofoo/uix/components/code-block";

const chapterSchema = z.object({
  description: z.string().nullable(),
  id: z.string(),
  title: z.string(),
});

const previewCatalog = defineCatalog(schema, {
  actions: {},
  components: {
    CourseManifest: {
      description: "The course identity and ordered curriculum.",
      props: z.object({
        chapters: z.array(chapterSchema),
        description: z.string().nullable(),
        title: z.string(),
      }),
    },
    JsonDocument: {
      description: "A structured JSON document.",
      props: z.object({ value: z.unknown() }),
    },
  },
});

const { registry: previewRegistry } = defineRegistry(previewCatalog, {
  components: {
    CourseManifest: ({ props }) => (
      <div className="mx-auto max-w-3xl p-5 sm:p-8">
        <LessonBrief title={props.title}>
          {props.description ? <CourseContent basePath={null} workspaceId="" diagrams={false}>{props.description}</CourseContent> : null}
          <h3>Chapters</h3>
          <ol>
            {props.chapters.map(chapter => (
              <li key={chapter.id}>
                <strong>{chapter.title}</strong>
                {chapter.description ? <p>{chapter.description}</p> : null}
              </li>
            ))}
          </ol>
        </LessonBrief>
      </div>
    ),
    JsonDocument: ({ props }) => (
      <div className="mx-auto max-w-4xl p-5 sm:p-8">
        <CodeBlock code={JSON.stringify(props.value, null, 2)} lang="json" />
      </div>
    ),
  },
});

type Props = {
  path: string;
  source: string;
  workspace: AuthoringDraft;
};

export function AuthoringFilePreview({ path, source, workspace }: Props) {
  if (/\.mdx?$/u.test(path)) {
    return (
      <ScrollArea className="h-full">
        <div className="mx-auto max-w-3xl p-5 sm:p-8">
          <LessonBrief title={path}><CourseContent basePath={null} workspaceId="" diagrams={false}>{source}</CourseContent></LessonBrief>
        </div>
      </ScrollArea>
    );
  }

  try {
    const value = path.endsWith(".json") ? JSON.parse(source) : parseYaml(source);
    const spec = path === "dojo.yaml"
      ? courseManifestSpec(value, workspace)
      : jsonDocumentSpec(value);
    return (
      <ScrollArea className="h-full">
        <JSONUIProvider registry={previewRegistry}>
          <Renderer registry={previewRegistry} spec={spec} />
        </JSONUIProvider>
      </ScrollArea>
    );
  } catch (cause) {
    return <div role="alert" className="p-5 text-sm text-destructive sm:p-8">{cause instanceof Error ? cause.message : "Unable to preview this file."}</div>;
  }
}

function courseManifestSpec(value: unknown, workspace: AuthoringDraft): Spec {
  const manifest = isRecord(value) ? value : {};
  const entries = Array.isArray(manifest.katas) ? manifest.katas : [];
  const chapters = entries.filter(isRecord).map((entry, index) => ({
    description: typeof entry.description === "string" ? entry.description : null,
    id: String(entry.id ?? entry.name ?? index),
    title: String(entry.title ?? entry.name ?? `Lesson ${index + 1}`),
  }));
  return {
    elements: {
      course: {
        type: "CourseManifest",
        props: {
          chapters,
          description: typeof manifest.description === "string" ? manifest.description : null,
          title: String(manifest.name ?? workspace.name),
        },
      },
    },
    root: "course",
  };
}

function jsonDocumentSpec(value: unknown): Spec {
  return { elements: { document: { type: "JsonDocument", props: { value } } }, root: "document" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
