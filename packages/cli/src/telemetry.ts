import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readInstalledSource } from "./source";

export type CourseEventName = "installed" | "started" | "kata_completed" | "finished";

interface QueuedCourseEvent {
  root: string;
  courseId: string;
  event: CourseEventName;
  occurredAt: string;
  kata?: string;
  source?: {
    type: "github";
    repository: string;
    integrity?: string;
  };
}

const queuedEvents: QueuedCourseEvent[] = [];

function telemetryDisabled() {
  return [process.env.DO_NOT_TRACK, process.env.DOJO_TELEMETRY_DISABLED]
    .some((value) => value === "1" || value === "true");
}

function normalizeCourseId(name: string) {
  const unscoped = name.replace(/^@/u, "");
  return unscoped.includes("/") ? unscoped : `dojofoo/${unscoped}`;
}

function instanceId(root: string) {
  const stateDirectory = resolve(root, ".dojo");
  const statePath = resolve(stateDirectory, "instance.json");
  if (existsSync(statePath)) {
    try {
      const state = JSON.parse(readFileSync(statePath, "utf8")) as { instanceId?: unknown };
      if (typeof state.instanceId === "string" && state.instanceId.length > 0) return state.instanceId;
    } catch {
      // Replace malformed local telemetry state without affecting course progress.
    }
  }

  const value = randomUUID();
  mkdirSync(stateDirectory, { recursive: true });
  writeFileSync(statePath, `${JSON.stringify({ version: 1, instanceId: value }, null, 2)}\n`);
  return value;
}

export function queueCourseEvent(
  root: string,
  courseName: string,
  event: CourseEventName,
  kata?: string,
  source?: { type: "github"; locator: string; integrity?: string },
) {
  if (telemetryDisabled()) return;
  const recorded = readInstalledSource(resolve(root, ".dojos", courseName));
  const githubSource = source ?? (recorded?.type === "github" ? recorded : undefined);
  queuedEvents.push({
    root,
    courseId: githubSource?.type === "github" ? githubSource.locator : normalizeCourseId(courseName),
    event,
    occurredAt: new Date().toISOString(),
    ...(kata ? { kata } : {}),
    ...(event === "installed" && githubSource ? {
      source: {
        type: githubSource.type,
        repository: githubSource.locator,
        ...(githubSource.integrity ? { integrity: githubSource.integrity } : {}),
      },
    } : {}),
  });
}

export async function flushCourseEvents() {
  const events = queuedEvents.splice(0);
  if (telemetryDisabled()) return;
  const origin = (process.env.DOJO_API_URL || "https://dojofoo.vercel.app").replace(/\/$/u, "");

  await Promise.all(events.map(async ({ root, ...event }) => {
    try {
      await fetch(`${origin}/api/v1/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instanceId: instanceId(root), ...event }),
        signal: AbortSignal.timeout(1_500),
      });
    } catch {
      // Metrics must never change the outcome or latency of a dojo command.
    }
  }));
}

export function resetCourseEventsForTest() {
  queuedEvents.splice(0);
}
