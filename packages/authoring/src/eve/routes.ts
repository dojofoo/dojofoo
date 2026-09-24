import { ClientError, defaultMessageReducer, parseInputResponses, type Client, type ClientSession } from "@dojofoo/agent/client";
import { chatParamsFromRequestBody, convertMessagesToModelMessages, toServerSentEventsResponse } from "@tanstack/ai";
import { Hono } from "hono";
import { eveChatMessages } from "./messages";
import { eveQuestionInterrupts, streamEveAsAgUi } from "./stream";
import { resumeEveEvents } from "./resume";

async function authoringInput(body: unknown): Promise<{ message?: unknown; runId?: unknown; resume?: unknown }> {
  if (!body || typeof body !== "object") return {};
  if (!("messages" in body)) return body;
  let input;
  try { input = await chatParamsFromRequestBody(body); }
  catch (cause) { throw new SyntaxError("Invalid AG-UI authoring request", { cause }); }
  const latest = convertMessagesToModelMessages(input.messages).at(-1);
  const content = latest?.role === "user" ? latest.content : undefined;
  const message = typeof content === "string" ? content : content?.flatMap(part => part.type === "text" ? [part.content] : []).join("");
  // Eve owns history; forward only the new user turn, never replay client history.
  return { message, runId: input.runId, resume: input.resume };
}

/** Mount behind the application's workspace authorization. The injected client
 * chooses the authored agent host; request bodies cannot select a remote host.
 * Eve owns IDs, cursors, durable history, validation and execution.
 */
export function createEveAuthoringRoutes(source: Client | (() => Promise<Client>)) {
  const getClient = typeof source === "function" ? source : async () => source;
  const reducer = defaultMessageReducer();
  const read = async (sessionId: string, signal: AbortSignal) => {
    const client = await getClient();
    const snapshot = await client.sessions.attach(sessionId).snapshot({ signal });
    return {
      session: client.sessions.attach(snapshot.session.sessionId, { streamIndex: snapshot.session.streamIndex }),
      projection: snapshot.events.reduce(reducer.reduce, reducer.initial()),
      events: snapshot.events,
    };
  };
  return new Hono()
    .onError(error => new Response(JSON.stringify({ error: error.message, ...(error instanceof ClientError ? { code: error.code } : {}) }), {
      status: error instanceof ClientError ? error.status : error instanceof SyntaxError ? 400 : 500,
      headers: { "content-type": "application/json" },
    }))
    .post("/sessions", async c => {
      const { message, runId } = await authoringInput(await c.req.json());
      if (runId !== undefined && (typeof runId !== "string" || !runId.trim())) return c.json({ error: "Run ID must be a non-empty string" }, 422);
      if (typeof message !== "string" || !message.trim()) return c.json({ error: "Message is required" }, 422);
      const { session, response } = await (await getClient()).sessions.create({ message, signal: c.req.raw.signal });
      return toServerSentEventsResponse(streamEveAsAgUi({
        events: response, initial: reducer.initial(), threadId: session.state.sessionId, runId: runId ?? crypto.randomUUID(),
      }));
    })
    .get("/sessions/:sessionId", async c => {
      const { session, projection } = await read(c.req.param("sessionId"), c.req.raw.signal);
      const runId = `${session.state.sessionId}:${session.state.streamIndex}`;
      const pendingInterrupts = eveQuestionInterrupts(projection, runId);
      return c.json({
        session: session.state, messages: eveChatMessages(projection.messages),
        initialResumeSnapshot: {
          resumeState: { threadId: session.state.sessionId, runId }, pendingInterrupts,
        },
      });
    })
    .get("/sessions/:sessionId/messages", async c => {
      const sessionId = c.req.param("sessionId");
      const runId = c.req.query("runId") || crypto.randomUUID();
      const { session, projection, events } = await read(sessionId, c.req.raw.signal);
      return toServerSentEventsResponse(streamEveAsAgUi({
        events: resumeEveEvents(session, c.req.raw.signal, events),
        initial: projection, threadId: sessionId, runId,
      }));
    })
    .post("/sessions/:sessionId/messages", async c => {
      const { message, runId, resume } = await authoringInput(await c.req.json());
      if (runId !== undefined && (typeof runId !== "string" || !runId.trim())) return c.json({ error: "Run ID must be a non-empty string" }, 422);
      let responses: ReturnType<typeof parseInputResponses> | undefined;
      if (resume !== undefined) {
        try {
          if (!Array.isArray(resume) || resume.length === 0) throw new Error("A non-empty resume batch is required");
          responses = parseInputResponses(resume.map(item => {
            if (!item || item.status !== "resolved") throw new Error("Only resolved Eve questions can be resumed; use session cancellation to stop the agent");
            return { ...item.payload, requestId: item.interruptId };
          }));
        } catch (error) {
          return c.json({ error: error instanceof Error ? error.message : String(error) }, 422);
        }
      } else if (typeof message !== "string" || !message.trim()) return c.json({ error: "Message is required" }, 422);
      const { session, projection } = await read(c.req.param("sessionId"), c.req.raw.signal);
      const response = responses
        ? await session.respond(responses, { signal: c.req.raw.signal })
        : await session.send(message as string, { signal: c.req.raw.signal });
      return toServerSentEventsResponse(streamEveAsAgUi({
        events: response, initial: projection, threadId: session.state.sessionId, runId: runId ?? crypto.randomUUID(),
      }));
    })
    .post("/sessions/:sessionId/answers", async c => {
      const { responses } = await c.req.json<{ responses?: Parameters<ClientSession["respond"]>[0] } | null>() ?? {};
      if (!Array.isArray(responses) || responses.length === 0) return c.json({ error: "Responses are required" }, 422);
      const { session, projection } = await read(c.req.param("sessionId"), c.req.raw.signal);
      // Resume after the authoritative snapshot, never cursor zero. Eve performs
      // request/answer validation and returns the continuing stream immediately.
      const response = await session.respond(responses, { signal: c.req.raw.signal });
      return toServerSentEventsResponse(streamEveAsAgUi({
        events: response, initial: projection, threadId: session.state.sessionId, runId: crypto.randomUUID(),
      }));
    })
    .post("/sessions/:sessionId/cancel", async c => c.json(
      await (await getClient()).sessions.attach(c.req.param("sessionId")).cancel({ signal: c.req.raw.signal }),
    ));
}
