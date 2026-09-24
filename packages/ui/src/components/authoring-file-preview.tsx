import type { AuthoringDraft } from "@dojofoo/authoring/service";
import { defineCatalog, type Spec } from "@json-render/core";
import { defineRegistry, JSONUIProvider, Renderer } from "@json-render/react";
import { schema } from "@json-render/react/schema";
import { z } from "zod";
import { parse as parseYaml } from "yaml";
import { CourseContent } from "@/components/course-content";
import { ScrollArea } from "@dojofoo/ui/scroll-area";

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
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h2 className="text-3xl font-semibold tracking-tight">{props.title}</h2>
        {props.description ? (
          <div className="mt-5">
            <CourseContent basePath={null} workspaceId="">{props.description}</CourseContent>
          </div>
        ) : null}
        <section className="mt-10">
          <p className="font-display text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Chapters</p>
          <div className="mt-3 border border-dashed">
            {props.chapters.map((chapter, index) => (
              <article className="border-b border-dashed px-5 py-4 last:border-b-0" key={chapter.id}>
                <p className="font-display text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Chapter {index + 1}</p>
                <h3 className="mt-1 text-lg font-medium">{chapter.title}</h3>
                {chapter.description ? <p className="mt-1 font-prose text-sm text-muted-foreground">{chapter.description}</p> : null}
              </article>
            ))}
          </div>
        </section>
      </div>
    ),
    JsonDocument: ({ props }) => (
      <div className="mx-auto max-w-4xl px-8 py-10 font-mono text-sm">
        <JsonValue value={props.value} />
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
      <ScrollArea className="h-full bg-background">
        <div className="mx-auto max-w-3xl px-8 py-10">
          <CourseContent basePath={null} workspaceId="">{source}</CourseContent>
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
      <ScrollArea className="h-full bg-background">
        <JSONUIProvider registry={previewRegistry}>
          <Renderer registry={previewRegistry} spec={spec} />
        </JSONUIProvider>
      </ScrollArea>
    );
  } catch (cause) {
    return <div className="p-8 font-prose text-sm text-red-300">{cause instanceof Error ? cause.message : "Unable to preview this file."}</div>;
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

function JsonValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    return <div className="space-y-2 border-l border-dashed pl-4">{value.map((item, index) => <JsonRow key={index} label={String(index)} value={item} />)}</div>;
  }
  if (isRecord(value)) {
    return <div className="space-y-2 border-l border-dashed pl-4">{Object.entries(value).map(([key, item]) => <JsonRow key={key} label={key} value={item} />)}</div>;
  }
  return <span className={jsonScalarClass(value)}>{JSON.stringify(value)}</span>;
}

function JsonRow({ label, value }: { label: string; value: unknown }) {
  const nested = Array.isArray(value) || isRecord(value);
  return (
    <div className={nested ? "space-y-2" : "flex gap-3"}>
      <span className="text-muted-foreground">{label}{nested ? "" : ":"}</span>
      <JsonValue value={value} />
    </div>
  );
}

function jsonScalarClass(value: unknown): string {
  if (typeof value === "string") return "text-emerald-300";
  if (typeof value === "number") return "text-sky-300";
  if (typeof value === "boolean") return "text-amber-300";
  return "text-muted-foreground";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
