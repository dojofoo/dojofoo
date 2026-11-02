import { agentDefinitions } from "@dojofoo/config/agents";
import { discoverAgents } from "@dojofoo/config/agent-installations";
import { Hono } from "hono";
import { readCourseManifest } from "@dojofoo/config";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { starterCourses } from "../lib/starter-courses";
import { installStarter } from "./control/starters";
import { requestOrigin } from "./request-origin";

type Settings = { completed: boolean; agents?: string[]; agent?: string; user: { name: string; email?: string; avatar?: string } };
const anonymous = (): Settings => ({ completed: false, user: { name: "Anonymous" } });
function settingsFile() { return join(process.env.DOJOFOO_HOME ?? join(homedir(), ".dojofoo"), "settings.json"); }
function settings(): Settings {
  const file = settingsFile();
  if (!existsSync(file)) return anonymous();
  return JSON.parse(readFileSync(file, "utf8"));
}
function save(value: Settings) {
  const file = settingsFile();
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  renameSync(temporary, file);
}
function catalog() {
  return starterCourses.map(course => ({
    id: course.id, title: course.title, author: "Dojo.foo",
    color: `oklch(0.65 0.18 ${course.art.hue})`,
  }));
}

export const localRoutes = new Hono()
  .use("*", async (c, next) => {
    const origin = c.req.header("origin");
    if (origin && origin !== requestOrigin(c.req.raw)) return c.json({ error: "Local access only." }, 403);
    await next();
  })
  .get("/setup", c => c.json({ ...settings(), workspace: resolve(process.env.DOJO_PROJECT_ROOT ?? process.cwd()) }))
  .get("/agents", c => c.json(discoverAgents()))
  .get("/courses", async c => c.json(await catalog()))
  .post("/setup", async c => {
    const body = await c.req.json<{ agents?: string[]; agent?: string; courses?: string[] }>();
    const requested = body.agents ?? (body.agent ? [body.agent] : []);
    if (!Array.isArray(requested) || !requested.length || requested.some(id => !agentDefinitions.some(agent => agent.id === id))
      || !Array.isArray(body.courses) || body.courses.some(id => typeof id !== "string")) {
      return c.json({ error: "Choose at least one agent and your courses." }, 400);
    }
    const agents = [...new Set(requested)];
    const selectedAgent = agents[0];
    const root = resolve(process.env.DOJO_PROJECT_ROOT ?? process.cwd());
    if (body.courses.length) {
      const courses = catalog();
      const selected = body.courses.map(id => courses.find(course => course.id === id));
      if (selected.some(course => !course)) return c.json({ error: "A selected course is no longer available." }, 400);
      for (const course of selected) {
        try { readCourseManifest(root, course!.id); continue; } catch { /* Install missing courses without overwriting existing files. */ }
        await installStarter(root, course!.id, agents);
      }
    }
    const next: Settings = { ...settings(), completed: true, agents, agent: selectedAgent };
    save(next);
    return c.json({ ...next, workspace: root });
  });
