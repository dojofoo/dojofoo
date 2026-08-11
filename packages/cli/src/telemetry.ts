import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
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
const REGISTRATION_OUTBOX = "registration-outbox.json";

type RegistrationEvent = Omit<QueuedCourseEvent, "root"> & {
  event: "installed";
  source: NonNullable<QueuedCourseEvent["source"]>;
};

interface RegistrationOutbox {
  version: 1;
  registrations: RegistrationEvent[];
}

function telemetryDisabled() {
  return [process.env.DO_NOT_TRACK, process.env.DOJO_TELEMETRY_DISABLED]
    .some((value) => value === "1" || value === "true");
}

function normalizeCourseId(name: string) {
  const unscoped = name.replace(/^@/u, "");
  return unscoped.includes("/") ? unscoped : `dojofoo/${unscoped}`;
}

function outboxPath(root: string) {
  return resolve(root, ".dojo", REGISTRATION_OUTBOX);
}

function readRegistrationOutbox(root: string): RegistrationEvent[] {
  const path = outboxPath(root);
  if (!existsSync(path)) return [];
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Partial<RegistrationOutbox>;
    return value.version === 1 && Array.isArray(value.registrations)
      ? value.registrations
      : [];
  } catch {
    return [];
  }
}

function writeRegistrationOutbox(root: string, registrations: RegistrationEvent[]) {
  const path = outboxPath(root);
  if (registrations.length === 0) {
    if (existsSync(path)) unlinkSync(path);
    return;
  }

  mkdirSync(resolve(root, ".dojo"), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify({ version: 1, registrations }, null, 2)}\n`);
  renameSync(temporaryPath, path);
}

function registrationKey(event: RegistrationEvent) {
  return `${event.courseId}:${event.source.repository}:${event.source.integrity ?? ""}`;
}

function persistRegistration(root: string, registration: RegistrationEvent) {
  const registrations = readRegistrationOutbox(root)
    .filter((candidate) => candidate.courseId !== registration.courseId);
  registrations.push(registration);
  writeRegistrationOutbox(root, registrations);
}

function acknowledgeRegistration(root: string, registration: RegistrationEvent) {
  const key = registrationKey(registration);
  writeRegistrationOutbox(
    root,
    readRegistrationOutbox(root).filter((candidate) => registrationKey(candidate) !== key),
  );
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
  const queued: QueuedCourseEvent = {
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
  };
  queuedEvents.push(queued);
  if (queued.source) persistRegistration(root, queued as RegistrationEvent);
}

export async function flushCourseEvents() {
  const events = queuedEvents.splice(0);
  if (telemetryDisabled()) return;
  const origin = (process.env.DOJO_API_URL || "https://dojofoo.vercel.app").replace(/\/$/u, "");

  const roots = new Set(events.map(({ root }) => root));
  if (process.env.DOJO_PROJECT_ROOT) roots.add(process.env.DOJO_PROJECT_ROOT);

  const registrations = new Map<string, { root: string; event: RegistrationEvent }>();
  for (const root of roots) {
    for (const event of readRegistrationOutbox(root)) {
      registrations.set(registrationKey(event), { root, event });
    }
  }

  for (const { root, ...event } of events) {
    if (event.source) {
      registrations.set(registrationKey(event as RegistrationEvent), {
        root,
        event: event as RegistrationEvent,
      });
    }
  }

  for (const { root, event } of registrations.values()) {
    try {
      const response = await fetch(`${origin}/api/v1/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instanceId: instanceId(root), ...event }),
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) acknowledgeRegistration(root, event);
    } catch {
      // Keep registration in the outbox for the next dojo command.
    }
  }

  await Promise.all(events.filter(({ source }) => !source).map(async ({ root, ...event }) => {
    try {
      const response = await fetch(`${origin}/api/v1/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instanceId: instanceId(root), ...event }),
        signal: AbortSignal.timeout(1_500),
      });
      if (!response.ok) return;
    } catch {
      // Metrics must never change the outcome or latency of a dojo command.
    }
  }));
}

export function resetCourseEventsForTest() {
  queuedEvents.splice(0);
}
