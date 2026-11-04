import type { EveDelivery } from "./runtime";

/** What a request to a session's Eve routes is: only a message or an answer starts or continues a turn. */
export type EveRequest =
  | { kind: "delivery"; delivery: EveDelivery }
  | { kind: "prepare" }
  | { kind: "control"; control: "cancel" | "clear" | "compact" | "end" }
  | { kind: "read" }
  | { kind: "other" };

const controls = new Set(["cancel", "clear", "compact", "end"]);

/** Classifies `POST /eve/v1/session/{id}` and its controls (Eve docs, channels/eve.mdx); `path` is the part after `/eve`. */
export function classifyEveRequest(method: string, path: string, body: unknown): EveRequest {
  const match = /^\/v1\/session\/[^/]+(?:\/([^/]+))?\/?$/u.exec(path);
  if (!match) return { kind: "other" };
  const [, action] = match;
  if (method === "GET" || method === "HEAD") return action === "stream" || action === undefined ? { kind: "read" } : { kind: "other" };
  if (method !== "POST") return { kind: "other" };
  if (action !== undefined) return controls.has(action) ? { kind: "control", control: action as "cancel" | "clear" | "compact" | "end" } : { kind: "other" };
  if (body === undefined || body === null) return { kind: "prepare" };
  if (typeof body !== "object" || Array.isArray(body)) return { kind: "other" };
  const fields = body as { message?: unknown; answers?: unknown; idempotencyKey?: unknown };
  const idempotencyKey = typeof fields.idempotencyKey === "string" ? { idempotencyKey: fields.idempotencyKey } : {};
  if (fields.message !== undefined) return { kind: "delivery", delivery: { kind: "message", text: messageText(fields.message), ...idempotencyKey } };
  if (fields.answers !== undefined) return { kind: "delivery", delivery: { kind: "answer", ...idempotencyKey } };
  return Object.keys(body).length === 0 ? { kind: "prepare" } : { kind: "other" };
}

/** A message's text: the string, or its text parts joined. */
function messageText(message: unknown): string {
  if (typeof message === "string") return message;
  const parts = Array.isArray(message) ? message : message && typeof message === "object" && Array.isArray((message as { parts?: unknown }).parts)
    ? (message as { parts: unknown[] }).parts : [];
  return parts.flatMap(part => part && typeof part === "object" && (part as { type?: unknown }).type === "text"
    && typeof (part as { text?: unknown }).text === "string" ? [(part as { text: string }).text] : []).join("");
}
