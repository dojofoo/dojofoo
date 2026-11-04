/** What a conversation does with a failure (D33): every error the chat can receive ends with an action. */
export type ChatAction = "try-again" | "choose-agent" | "login" | "reload-page" | "dashboard";
export type ChatFailure =
  /** Open the page's default conversation again (Sensei: POST /sessions/default; Kyoshi: today's recovery) */
  | { kind: "default-open" }
  /** The conversation can't continue: Sensei replaces it (`new` + `from`); Kyoshi starts another */
  | { kind: "replace" }
  /** A cancel found nothing to stop: the turn shows as stopped, with no alert */
  | { kind: "stopped" }
  | { kind: "alert"; message: string; actions: ChatAction[]; refusedAgent?: string; retryAfter?: string };

export type TurnFailure = "sign-in" | "rate-limit" | "native-crash" | "other";

/** An `/api/v1` failure, as the session API and Eve answer it (`{ error, message }` or Eve's `{ error, code }`). */
export class ChatApiError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string) {
    super(message);
    this.name = "ChatApiError";
  }
}

/** Reads an unsuccessful API response once into a ChatApiError. */
export async function chatApiError(response: Response): Promise<ChatApiError> {
  const text = (await response.text()).trim();
  let body: { error?: unknown; message?: unknown; code?: unknown } = {};
  try { body = JSON.parse(text) ?? {}; } catch {}
  // The public shape is { error: code, message }; Eve's routes answer { error: message, code }
  const code = typeof body.code === "string" ? body.code : typeof body.message === "string" && typeof body.error === "string" ? body.error : undefined;
  const message = typeof body.message === "string" ? body.message : typeof body.error === "string" && body.code !== undefined ? body.error : text || `Request failed (${response.status}).`;
  return new ChatApiError(response.status, code, message);
}

/** A failed turn's error (`turn.settled.data.error`): `code` first, then `message`. Per-adapter codes stay unverified until tier A records them. */
export function classifyTurnFailure(error: { code?: string; message?: string }): TurnFailure {
  for (const text of [error.code, error.message]) {
    if (!text) continue;
    if (/sign.?in|log.?in|auth|unauthori[sz]ed|credential|401|403/iu.test(text)) return "sign-in";
    if (/rate.?limit|quota|429|too many requests/iu.test(text)) return "rate-limit";
    if (/exited|crash|signal|ECONNRESET|EPIPE|spawn/iu.test(text)) return "native-crash";
  }
  return "other";
}

const retryTime = (message: string) => /(?:retry|try again)[^0-9]{0,20}(\d+\s*(?:ms|s|sec(?:ond)?s?|m|min(?:ute)?s?|h|hours?))/iu.exec(message)?.[1];

/** Maps any error the chat receives to its action (step-4 plan, "Interactive courses on AgentChat", the outcome table). */
export function chatFailure(error: unknown, context: { operation?: "load" | "send" | "cancel" | "answer"; file?: string; agentName?: string; crashes?: number } = {}): ChatFailure {
  const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : undefined;
  const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : undefined;
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "";
  // Eve's client marks a session that can't take input with SessionNotActiveError (retryable while it starts)
  if (name === "SessionNotActiveError") {
    if ((error as { retryable?: boolean }).retryable) return { kind: "alert", message, actions: ["try-again"] };
    return context.operation === "cancel" ? { kind: "stopped" } : { kind: "replace" };
  }
  if (name === "LaunchTokenError" || (status === 403 && code === "launch_token_invalid")) return { kind: "alert", message: "This page is out of date.", actions: ["reload-page"] };
  if (status !== undefined) {
    if ((status === 409 && code === "agent_unavailable") || (status === 404 && code === "session_not_found")) return { kind: "default-open" };
    if (status === 409 && code === "session_not_active") return context.operation === "cancel" ? { kind: "stopped" } : { kind: "replace" };
    if ((status === 409 && (code === "session_stranded" || code === "session_version_unsupported")) || (status === 410 && code === "session_expired")) return { kind: "replace" };
    if (status === 404 && code === "workspace_not_found") return { kind: "alert", message: "This workspace is no longer available.", actions: ["dashboard"] };
    if ((status === 400 && code === "invalid_request") || (status === 404 && (code === "agent_not_found" || code === "not_found"))) return { kind: "alert", message, actions: ["reload-page"] };
    if (status === 413 || status === 415) return { kind: "alert", message: `Remove ${context.file ?? "the attachment"} and send again.`, actions: [] };
    if (status === 503 && code === "agent_failed") return { kind: "alert", message, actions: ["choose-agent", "try-again"] };
    if (status === 409 && code === "agent_not_offered") return { kind: "alert", message, actions: ["choose-agent"], ...(context.agentName ? { refusedAgent: context.agentName } : {}) };
    return { kind: "alert", message, actions: ["try-again"] };
  }
  // A failed turn: Eve names its error by code
  const turn = classifyTurnFailure({ code: name && name !== "Error" ? name : undefined, message });
  if (turn === "sign-in") return { kind: "alert", message, actions: ["login", "try-again"] };
  if (turn === "rate-limit") {
    const after = retryTime(message);
    return { kind: "alert", message, actions: ["try-again"], ...(after ? { retryAfter: after } : {}) };
  }
  if (turn === "native-crash") return { kind: "alert", message, actions: (context.crashes ?? 1) > 1 ? ["try-again", "choose-agent"] : ["try-again"] };
  return { kind: "alert", message, actions: ["try-again"] };
}
