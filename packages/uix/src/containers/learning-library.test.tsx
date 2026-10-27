import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LearningLibrary } from "./learning-library";

describe("the shared learning library", () => {
  it("keeps real course/draft links and omits unknown progress", () => {
    const html = renderToStaticMarkup(<LearningLibrary courses={[
      { id: "installed", title: "An installed dojo", href: "/session/real-session", caption: "TypeScript", detail: "First lesson" },
      { id: "known-progress", title: "A measured course", progress: 42 },
    ]} drafts={[{ id: "draft", title: "An independent draft", href: "/authoring?workspace=real-workspace" }]} />);
    expect(html).toContain('href="/session/real-session"');
    expect(html).toContain('href="/authoring?workspace=real-workspace"');
    expect(html).toContain("42%");
    expect(html).toContain('aria-label="An installed dojo"');
    expect(html).not.toContain('aria-label="An installed dojo,');
    expect(html).not.toContain("Alex Morgan");
    expect(html).not.toContain("New course");
  });

  it("distinguishes initial loading and failed discovery from an empty installation", () => {
    const loading = renderToStaticMarkup(<LearningLibrary courses={[]} loading />);
    expect(loading).toContain('role="status"');
    expect(loading).not.toContain("No courses yet");
    const failed = renderToStaticMarkup(<LearningLibrary courses={[]} error="The course directory is unavailable." />);
    expect(failed).toContain('role="alert"');
    expect(failed).toContain("The course directory is unavailable.");
    expect(failed).not.toContain("No courses yet");
  });

  it("offers only the actions supplied by the host", () => {
    const empty = renderToStaticMarkup(<LearningLibrary courses={[]} />);
    expect(empty).toContain("No courses yet");
    expect(empty).not.toContain("Explore courses");
    const actionable = renderToStaticMarkup(<LearningLibrary courses={[]} onExplore={() => {}} onNewCourse={() => {}} />);
    expect(actionable).toContain("Explore courses");
    expect(actionable).toContain("New course");
  });
});
