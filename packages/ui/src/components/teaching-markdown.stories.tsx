import type { Meta, StoryObj } from "@storybook/react-vite";
import blocks, { second } from "virtual:dojo-teaching-fixture";
import { http, HttpResponse } from "msw";
import { mswLoader } from "msw-storybook-addon/csf3";
import source from "./teaching-markdown.fixture.md?raw";
import { useState } from "react";
import { CourseContent } from "./course-content";
import { TeachingDocument } from "./teaching-markdown";

const meta = {
  title: "Components/Teaching Content",
  component: TeachingDocument,
  args: { blocks },
  decorators: [(Story) => <div className="h-screen overflow-auto bg-background p-8 font-prose text-foreground"><div className="mx-auto max-w-3xl"><Story /></div></div>],
} satisfies Meta<typeof TeachingDocument>;
export default meta;
export const Lesson: StoryObj<typeof meta> = {};
export const CodeTransitions: StoryObj<typeof meta> = { args: { blocks: blocks.filter((block) => block.type === "code-steps") } };
export const AuthoredPreview: StoryObj<typeof meta> = {
  loaders: [mswLoader()],
  parameters: { msw: [http.post("/api/teaching/preview", async ({ request }) => {
    const body = await request.json() as { source: string };
    return HttpResponse.json({ blocks: body.source === source ? blocks : second });
  })] },
  render: () => <PreviewFixture />,
};
export const PreviewError: StoryObj<typeof meta> = {
  ...AuthoredPreview,
  parameters: { msw: [http.post("/api/teaching/preview", () => HttpResponse.json({ error: "The example has an unexpected TypeScript error." }, { status: 422 }))] },
};

function PreviewFixture() {
  const [second, setSecond] = useState(false);
  return <>
    <nav className="mb-6 flex gap-4" aria-label="Preview files">
      <button onClick={() => setSecond(false)}>Lesson file</button>
      <button onClick={() => setSecond(true)}>Second file</button>
    </nav>
    <CourseContent basePath="lessons/one" workspaceId="fixture">{second ? "# Second file\n\nA different lesson." : source}</CourseContent>
  </>;
}
