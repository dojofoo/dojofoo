import type { AuthInteraction, AuthType } from "@earendil-works/pi-ai";
import type { AgentId, AuthEvent, AuthPrompt, LoginState } from "@dojofoo/protocol";
import { randomUUID } from "node:crypto";
import type { AgentAccess } from "./runtime";

/** A sign-in running in the server: the browser reads its state, answers its question and can cancel it */
export interface LoginSession {
  state(): LoginState;
  /** Answers the waiting question; false when `promptId` is not the one waiting */
  answer(promptId: string, value: string): boolean;
  cancel(): void;
  /** Settles when the sign-in ends, however it ends */
  done: Promise<void>;
}

// A structured clone of Pi's event or question is its JSON form, protocol's copy of the type (test/access.test.ts keeps them equal)

/**
 * Runs `access.login` with a Pi `AuthInteraction` whose events and questions are kept for the browser to read. Answers are passed
 * to the agent and never kept: an API key is a `secret` answer. The sign-in fails after `timeoutMs`.
 */
export function startLogin(access: AgentAccess, request: { agent: AgentId; provider: string; type: AuthType },
  timeoutMs = 10 * 60_000): LoginSession {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("The sign-in timed out.")), timeoutMs);
  timer.unref?.();
  const state: LoginState = { id: randomUUID(), ...request, status: "running", events: [] };
  let waiting: { id: string; resolve(value: string): void; reject(error: Error): void } | undefined;
  let cancelled = false;

  const interaction: AuthInteraction = {
    signal: controller.signal,
    notify(event) {
      if (state.status === "running") state.events.push(structuredClone(event) as AuthEvent);
    },
    prompt({ signal, ...prompt }) {
      return new Promise<string>((resolve, reject) => {
        const id = randomUUID();
        const settle = () => {
          if (waiting?.id !== id) return false;
          waiting = undefined;
          delete state.prompt;
          return true;
        };
        waiting = { id, resolve: value => settle() && resolve(value), reject: error => settle() && reject(error) };
        state.prompt = { ...structuredClone(prompt) as AuthPrompt, id };
        // Pi aborts a question that something else answered (a manual code raced against its callback server)
        for (const source of [signal, controller.signal]) {
          source?.addEventListener("abort", () => waiting?.id === id && waiting.reject(reason(source)), { once: true });
        }
      });
    },
  };

  const done = (async () => {
    try {
      await access.login(request.provider, request.type, interaction);
      state.status = "succeeded";
    } catch (error) {
      state.status = cancelled ? "cancelled" : "failed";
      if (!cancelled) state.error = controller.signal.aborted ? reason(controller.signal).message : error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(timer);
      waiting = undefined;
      delete state.prompt;
    }
  })();

  return {
    state: () => structuredClone(state),
    answer(promptId, value) {
      if (!waiting || waiting.id !== promptId) return false;
      waiting.resolve(value);
      return true;
    },
    cancel() {
      if (state.status !== "running") return;
      cancelled = true;
      controller.abort(new Error("The sign-in was cancelled."));
    },
    done,
  };
}

const reason = (signal: AbortSignal) => signal.reason instanceof Error ? signal.reason : new Error("The sign-in was cancelled.");
