import { describe, expect, it, vi } from "vitest";
import { GitHubCourseRegistrar } from "../src/github-registrar";

describe("GitHubCourseRegistrar", () => {
  it("validates a public repository manifest and persists a marketplace snapshot", async () => {
    const manifest = {
      name: "@acme/typescript-basics",
      version: "0.0.1",
      description: "Learn TypeScript basics.",
      author: "Ada Lovelace",
      language: "TypeScript",
      framework: "Effect",
      tags: ["Values"],
      test: "npx vitest run {template}",
      katas: [{
        name: "001-values",
        template: "katas/001-values/solution.ts",
        tags: ["Values"],
      }],
    };
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/repos/acme/typescript-basics")) {
        return Response.json({
          private: false,
          full_name: "acme/typescript-basics",
          default_branch: "main",
          pushed_at: "2026-08-11T10:00:00.000Z",
        });
      }
      if (url.includes("/git/trees/main?recursive=1")) {
        return Response.json({
          sha: "commit-sha",
          tree: [
            { path: "dojo.json", type: "blob", size: 500 },
            { path: "DOJO.md", type: "blob", size: 100 },
            { path: "katas/001-values/KATA.md", type: "blob", size: 100 },
            { path: "prepare.sh", type: "blob", size: 20 },
            { path: "mise-tasks/setup", type: "blob", size: 20 },
            { path: "scripts/release.sh", type: "blob", size: 20 },
          ],
        });
      }
      if (url.endsWith("/prepare.sh")) return new Response("#!/bin/sh\n");
      if (url.endsWith("/mise-tasks/setup")) return new Response("#!/bin/sh\n");
      if (url.endsWith("/dojo.json")) {
        return new Response(JSON.stringify(manifest));
      }
      if (url.endsWith("/DOJO.md")) return new Response("# TypeScript Basics");
      if (url.endsWith("/katas/001-values/KATA.md")) return new Response("# Values");
      return new Response("missing", { status: 404 });
    });
    const saved: unknown[] = [];
    const registrar = new GitHubCourseRegistrar({
      fetch,
      store: { remove: async () => undefined, upsert: async (value) => { saved.push(value); } },
    });

    const registered = await registrar.register({
      type: "github",
      repository: "acme/typescript-basics",
      integrity: "sha256-client-archive",
    });

    expect(registered).toMatchObject({
      id: "acme/typescript-basics",
      source: "acme",
      slug: "typescript-basics",
      name: "TypeScript Basics",
      sourceType: "github",
      installUrl: "acme/typescript-basics",
      author: "Ada Lovelace",
      language: "TypeScript",
      framework: "Effect",
      tags: ["Values"],
      katas: ["001-values"],
      hash: "commit-sha",
    });
    expect(registered?.files).toEqual([
      { path: "DOJO.md", contents: "# TypeScript Basics" },
      { path: "dojo.json", contents: JSON.stringify(manifest) },
      { path: "katas/001-values/KATA.md", contents: "# Values" },
      { path: "mise-tasks/setup", contents: "#!/bin/sh\n" },
      { path: "prepare.sh", contents: "#!/bin/sh\n" },
    ]);
    expect(saved).toEqual([registered]);
  });

  it("rejects private repositories", async () => {
    const privateFetch = vi.fn(async () => Response.json({ private: true, full_name: "acme/private" }));
    const registrar = new GitHubCourseRegistrar({
      fetch: privateFetch,
      store: { remove: async () => undefined, upsert: async () => undefined },
    });

    expect(await registrar.register({ type: "github", repository: "acme/private" })).toBeNull();
  });

  it("registers a YAML-authored interactive course with its MDX and artifacts", async () => {
    const manifest = [
      "name: '@acme/learn-python'",
      "version: 1.0.0",
      "description: Learn Python interactively.",
      "mode: interactive",
      "lessons: lessons",
    ].join("\n");
    const files = new Map([
      ["dojo.yaml", manifest],
      ["lessons/install/lesson.json", JSON.stringify({ id: "install", title: "Install", steps: [] })],
      ["content/install.mdx", "# Install Python"],
      ["assets/python.svg", "<svg xmlns=\"http://www.w3.org/2000/svg\" />"],
      ["components/check.html", "<!doctype html><title>Check</title>"],
      ["mise.toml", "[tools]\npython = \"3.13\""],
    ]);
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/repos/acme/learn-python")) {
        return Response.json({ private: false, full_name: "acme/learn-python", default_branch: "main" });
      }
      if (url.includes("/git/trees/main?recursive=1")) {
        return Response.json({
          sha: "interactive-sha",
          tree: [...files].map(([path, contents]) => ({ path, type: "blob", size: contents.length })),
        });
      }
      const path = [...files.keys()].find((candidate) => url.endsWith(`/${candidate}`));
      return path ? new Response(files.get(path)) : new Response("missing", { status: 404 });
    });
    const upsert = vi.fn();

    const registered = await new GitHubCourseRegistrar({ fetch, store: { remove: async () => undefined, upsert } }).register({
      type: "github",
      repository: "acme/learn-python",
    });

    expect(registered).toMatchObject({ mode: "interactive", katas: [], hash: "interactive-sha" });
    expect(registered?.files?.map(({ path }) => path)).toEqual([...files.keys()].sort());
    expect(upsert).toHaveBeenCalledWith(registered);
  });

  it("rejects a repository whose dojo manifest is invalid", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/repos/acme/invalid")) {
        return Response.json({ private: false, full_name: "acme/invalid", default_branch: "main" });
      }
      if (url.includes("/git/trees/main?recursive=1")) {
        return Response.json({ sha: "invalid-sha", tree: [
          { path: "dojo.json", type: "blob", size: 2 },
        ] });
      }
      return new Response(JSON.stringify({
        name: "@acme/invalid",
        version: "0.0.1",
        description: "Invalid duplicate facets.",
        language: "TypeScript",
        framework: "Effect",
        tags: ["effect"],
        test: "true",
        katas: [{ template: "katas/001/solution.ts" }],
      }));
    });
    const upsert = vi.fn();
    const registrar = new GitHubCourseRegistrar({
      fetch,
      store: { remove: async () => undefined, upsert },
    });

    expect(await registrar.register({ type: "github", repository: "acme/invalid" })).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("canonicalizes a renamed GitHub repository and removes its stale alias", async () => {
    const files = new Map([
      ["dojo.json", JSON.stringify({
        name: "@acme/starter-kata",
        version: "0.0.1",
        description: "Starter dojo.",
        test: "true",
        katas: [{ template: "katas/001/solution.ts" }],
      })],
    ]);
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/repos/acme/starter")) {
        return Response.json({
          private: false,
          full_name: "acme/starter-kata",
          default_branch: "main",
        });
      }
      if (url.includes("/git/trees/main?recursive=1")) {
        return Response.json({
          sha: "canonical-sha",
          tree: [{ path: "dojo.json", type: "blob", size: files.get("dojo.json")!.length }],
        });
      }
      return url.endsWith("/dojo.json")
        ? new Response(files.get("dojo.json"))
        : new Response("missing", { status: 404 });
    });
    const remove = vi.fn();
    const upsert = vi.fn();

    const registered = await new GitHubCourseRegistrar({ fetch, store: { remove, upsert } }).register({
      type: "github",
      repository: "acme/starter",
    });

    expect(registered).toMatchObject({
      id: "acme/starter-kata",
      repository: "acme/starter-kata",
      installUrl: "acme/starter-kata",
    });
    expect(remove).toHaveBeenCalledWith("acme/starter");
    expect(upsert).toHaveBeenCalledWith(registered);
  });

  it("removes a private repository from the marketplace", async () => {
    const manifest = JSON.stringify({
      private: true,
      name: "@acme/private-starter",
      version: "0.0.1",
      description: "A starter that should not be listed.",
      test: "true",
      katas: [{ template: "katas/001/solution.ts" }],
    });
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/repos/acme/private-starter")) {
        return Response.json({
          private: false,
          full_name: "acme/private-starter",
          default_branch: "main",
        });
      }
      if (url.includes("/git/trees/main?recursive=1")) {
        return Response.json({ tree: [{ path: "dojo.json", type: "blob", size: manifest.length }] });
      }
      return url.endsWith("/dojo.json")
        ? new Response(manifest)
        : new Response("missing", { status: 404 });
    });
    const remove = vi.fn();
    const upsert = vi.fn();

    const registered = await new GitHubCourseRegistrar({ fetch, store: { remove, upsert } }).register({
      type: "github",
      repository: "acme/private-starter",
    });

    expect(registered).toBeNull();
    expect(remove).toHaveBeenCalledWith("acme/private-starter");
    expect(upsert).not.toHaveBeenCalled();
  });
  it("still honors the older marketplace: false", async () => {
    const manifest = JSON.stringify({
      marketplace: false,
      name: "@acme/private-starter",
      version: "0.0.1",
      description: "A starter that should not be listed.",
      test: "true",
      katas: [{ template: "katas/001/solution.ts" }],
    });
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/repos/acme/private-starter")) {
        return Response.json({
          private: false,
          full_name: "acme/private-starter",
          default_branch: "main",
        });
      }
      if (url.includes("/git/trees/main?recursive=1")) {
        return Response.json({ tree: [{ path: "dojo.json", type: "blob", size: manifest.length }] });
      }
      return url.endsWith("/dojo.json")
        ? new Response(manifest)
        : new Response("missing", { status: 404 });
    });
    const remove = vi.fn();
    const upsert = vi.fn();

    const registered = await new GitHubCourseRegistrar({ fetch, store: { remove, upsert } }).register({
      type: "github",
      repository: "acme/private-starter",
    });

    expect(registered).toBeNull();
    expect(remove).toHaveBeenCalledWith("acme/private-starter");
    expect(upsert).not.toHaveBeenCalled();
  });
});
