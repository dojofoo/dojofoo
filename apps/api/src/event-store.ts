import type { CourseEvent } from "./app";

export interface CourseEventStore {
  list(courseId: string): Promise<CourseEvent[]>;
  append(event: CourseEvent): Promise<boolean>;
}

function eventKey(event: Pick<CourseEvent, "instanceId" | "courseId" | "event" | "kata">) {
  return [event.courseId, event.instanceId, event.event, event.kata ?? ""].join("\u0000");
}

export class MemoryCourseEventStore implements CourseEventStore {
  readonly #events: CourseEvent[];
  readonly #keys: Set<string>;

  constructor(events: CourseEvent[] = []) {
    this.#events = [...events];
    this.#keys = new Set(events.map(eventKey));
  }

  async list(courseId: string) {
    return this.#events.filter((event) => event.courseId === courseId);
  }

  async append(event: CourseEvent) {
    const key = eventKey(event);
    if (this.#keys.has(key)) return false;
    this.#keys.add(key);
    this.#events.push(event);
    return true;
  }
}
