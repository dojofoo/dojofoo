import {
  HarnessAgent,
  type HarnessAgentAdapter,
  type HarnessAgentResumeSessionState,
  type HarnessAgentSettings,
} from "@ai-sdk/harness/agent";
import type {
  LanguageModelV4,
  LanguageModelV4Content,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
  LanguageModelV4Prompt,
  LanguageModelV4CallOptions,
  SharedV4Warning,
} from "@ai-sdk/provider";
import { convertDataContentToBase64String, jsonSchema, Output, tool, type ModelMessage, type OutputInterface, type LanguageModelUsage, type ToolSet } from "ai";

/** Opt-in Eve extension; no dependency on Eve's execution internals. */
export interface HarnessModel extends LanguageModelV4 {
  experimental_compact(input: { messages: ModelMessage[]; abortSignal?: AbortSignal }): Promise<ModelMessage[]>;
}

/** Adapter-specific runtime settings are inferred from the official adapter. */
type RuntimeSettings<Settings> = Settings extends unknown
  ? Omit<Settings, "id" | "instructions" | "tools" | "output">
  : never;
// Match HarnessAgent's adapter constraint: built-in tools keep adapter-specific
// schema types rather than being forced into a different package's ToolSet.
export type HarnessModelRuntime<Adapter extends HarnessAgentAdapter<any>> = RuntimeSettings<
  HarnessAgentSettings<Adapter, ToolSet, Record<string, unknown>, OutputInterface>
>;

/**
 * Native handles travel through standard content-level provider metadata.
 * No conversation state is retained on the model instance. Compaction/rewrite
 * coordination remains experimental. Eve owns host-tool execution.
 */
export function experimental_createHarnessModel<Adapter extends HarnessAgentAdapter<any>>(
  runtime: HarnessModelRuntime<Adapter>,
  sessionOptions: Pick<NonNullable<Parameters<HarnessAgent<Adapter, ToolSet>["createSession"]>[0]>, "sandboxSession"> = {},
): { model: HarnessModel } {
  const model: HarnessModel = {
    specificationVersion: "v4",
    provider: "harness",
    modelId: runtime.model ?? runtime.harness.harnessId,
    supportedUrls: {},
    async experimental_compact({ messages, abortSignal }) {
      abortSignal?.throwIfAborted();
      const checkpoint = readCheckpoint(messages);
      if (!checkpoint) throw new Error("Native compaction requires a harness checkpoint.");
      if (checkpoint.resumeFrom.continueFrom) {
        // Eve may request compaction between host-tool execution and delivery of
        // its result. The official SDK cannot compact that suspended turn. Keep
        // it intact; Eve can retry compaction at the next completed boundary.
        return messages;
      }
      const checkpointIndex = messages.findLastIndex(message => readCheckpoint([message]) !== undefined);
      const agent = new HarnessAgent({ ...runtime });
      const session = await agent.createSession({ ...sessionOptions, ...checkpoint, abortSignal });
      try {
        abortSignal?.throwIfAborted();
        await session.compact();
      } catch (error) {
        try { await session.stop(); }
        catch (cleanupError) { throw new AggregateError([error, cleanupError], "Native compaction and cleanup failed."); }
        throw error;
      }
      const resumeFrom = JSON.parse(JSON.stringify(await session.stop()));
      return [{
        role: "assistant",
        content: [{ type: "text", text: "Earlier conversation is retained in the native harness checkpoint.",
          providerOptions: { harness: { sessionId: session.sessionId, resumeFrom } } }],
      }, ...messages.slice(checkpointIndex + 1)];
    },
    async doStream(options) {
      const warnings = unsupportedOptions(options);
      const cancellation = new AbortController();
      const abortSignal = options.abortSignal
        ? AbortSignal.any([options.abortSignal, cancellation.signal])
        : cancellation.signal;
      const last = options.prompt.at(-1);
      const checkpoint = readCheckpoint(options.prompt);
      const checkpointIndex = options.prompt.findLastIndex(message => readCheckpoint([message]) !== undefined);
      const deliveries = options.prompt.slice(checkpointIndex + 1);
      const continuing = last?.role === "tool" || Boolean(checkpoint?.resumeFrom.continueFrom);
      const pendingPrompts = [...(checkpoint?.pendingPrompts ?? [])];
      pendingPrompts.push(...deliveries.filter(message => message.role === "user"));

      if (!continuing) {
        if (last?.role !== "user") {
          throw new Error("Experimental harness provider requires a fresh user turn.");
        }
      }
      if (continuing && !checkpoint) throw new Error("Tool continuation requires a native checkpoint.");
      const format = options.responseFormat;
      const agent = new HarnessAgent<Adapter, ToolSet, Record<string, unknown>, OutputInterface>({
          ...runtime,
          headers: Object.fromEntries([
            ...Object.entries(runtime.headers ?? {}),
            // AI SDK supplies its own user-agent; HarnessAgent owns the native
            // one. All other managed-header validation stays in HarnessAgent.
            ...Object.entries(options.headers ?? {}).filter(([name]) => name.toLowerCase() !== "user-agent"),
          ].map(([name, value]) => [name.toLowerCase(), value])),
          output: format?.type === "json"
            ? format.schema
              ? Output.object({ schema: jsonSchema(format.schema), name: format.name, description: format.description })
              : Output.json({ name: format.name, description: format.description })
            : undefined,
          instructions: options.prompt
            .filter(message => message.role === "system")
            .map(message => message.content).join("\n"),
          tools: Object.fromEntries((options.tools ?? []).map(definition => {
            if (definition.type !== "function") {
              throw new Error("Experimental harness provider accepts function tools only.");
            }
            return [definition.name, tool({
              description: definition.description,
              inputSchema: jsonSchema(definition.inputSchema),
            })];
          })),
      });
      const toolParts = continuing ? deliveries
        .flatMap(message => message.role === "tool" ? message.content : []) : [];
      const toolResults = toolParts.filter(part => part.type === "tool-result");
      const toolApprovals = toolParts.filter(part => part.type === "tool-approval-response");
      const session = await agent.createSession({ ...sessionOptions, ...checkpoint, abortSignal });
      let stopped: Promise<HarnessAgentResumeSessionState> | undefined;
      const stop = () => stopped ??= session.stop();
      const stopAfterFailure = async (error: unknown): Promise<unknown> => {
        try {
          await stop();
        } catch (cleanupError) {
          if (cleanupError !== error) {
            return new AggregateError([error, cleanupError], "Harness operation and cleanup both failed.");
          }
        }
        return error;
      };
      let result: Awaited<ReturnType<typeof agent.stream>>;
      const promptNext = () => {
        const message = pendingPrompts.shift()!;
        return agent.stream({ session, abortSignal,
          ...(message.content.every(part => part.type === "text")
            ? { prompt: message.content.map(part => part.text).join("\n") }
            : { messages: [message] }),
        });
      };
      try {
        result = continuing
          ? await agent.continueStream({ session, toolResultContinuations: toolResults, toolApprovalContinuations: toolApprovals, abortSignal })
          : await promptNext();
      } catch (error) {
        throw await stopAfterFailure(error);
      }
      const settled = new Set(toolResults.map(part => part.toolCallId));

      return {
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          async start(output) {
            type CheckpointPart = Extract<LanguageModelV4StreamPart, {
              type: "text-end" | "reasoning-end" | "tool-call" | "tool-result" | "file" | "reasoning-file";
            }>;
            let pending: CheckpointPart | undefined;
            const calls = new Set<string>();
            let approvals: Extract<LanguageModelV4StreamPart, { type: "tool-approval-request" }>[] = [];
            const usages: LanguageModelV4Usage[] = [];
            const flush = () => {
              if (pending) output.enqueue(pending);
              pending = undefined;
              for (const approval of approvals) output.enqueue(approval);
              approvals = [];
            };
            const hold = (part: CheckpointPart) => { flush(); pending = part; };
            try {
              output.enqueue({ type: "stream-start", warnings });
              const drain = async function* () {
                while (true) {
                  yield* result.fullStream;
                  usages.push(providerUsage(await result.totalUsage));
                  // New deliveries can follow a parked background tool receipt.
                  // Finish its official continuation before starting that input.
                  // If it suspends again, retain the input beside the checkpoint.
                  if (session.hasUnfinishedTurn() || pendingPrompts.length === 0) return;
                  result = await promptNext();
                }
              };
              for await (const part of drain()) {
                switch (part.type) {
                  case "text-start": case "reasoning-start":
                    flush();
                    output.enqueue(part);
                    break;
                  case "text-end": case "reasoning-end":
                    hold(part);
                    break;
                  case "text-delta": case "reasoning-delta":
                    flush();
                    output.enqueue({ type: part.type, id: part.id, delta: part.text, providerMetadata: part.providerMetadata });
                    break;
                  case "tool-input-start": case "tool-input-delta": case "tool-input-end":
                  case "source": case "custom": case "raw":
                    flush();
                    output.enqueue(part);
                    break;
                  case "file": case "reasoning-file":
                    hold({ type: part.type, data: { type: "data", data: part.file.uint8Array }, mediaType: part.file.mediaType, providerMetadata: part.providerMetadata });
                    break;
                  case "tool-approval-request":
                    // AI SDK retains checkpoint metadata on the call, not the approval.
                    // Keep their order while annotating the call when the turn parks.
                    approvals.push({ type: part.type, approvalId: part.approvalId, toolCallId: part.toolCall.toolCallId });
                    break;
                  case "tool-call":
                    if (!settled.has(part.toolCallId)) {
                      calls.add(part.toolCallId);
                      hold({
                        type: "tool-call", toolCallId: part.toolCallId,
                        toolName: part.toolName, input: JSON.stringify(part.input),
                        providerExecuted: part.providerExecuted,
                        dynamic: part.dynamic,
                        providerMetadata: part.providerMetadata,
                      });
                    }
                    break;
                  case "tool-result": case "tool-error":
                    if (!settled.has(part.toolCallId)) {
                      // HarnessAgent suppresses the resumed approval's call replay.
                      // AI SDK requires the matching call in this model result.
                      if (!calls.has(part.toolCallId)) {
                        const previous = options.prompt.flatMap(message => message.role === "assistant" ? message.content : [])
                          .find(item => item.type === "tool-call" && item.toolCallId === part.toolCallId);
                        if (previous?.type === "tool-call") {
                          hold({ type: "tool-call", toolCallId: previous.toolCallId, toolName: previous.toolName, input: JSON.stringify(previous.input), providerExecuted: true, dynamic: true });
                          calls.add(previous.toolCallId);
                        }
                      }
                      const value = part.type === "tool-error" ? part.error : part.output;
                      hold({
                        type: "tool-result", toolCallId: part.toolCallId,
                        toolName: part.toolName,
                        result: JSON.parse(JSON.stringify(value instanceof Error ? value.message : value ?? "")),
                        isError: part.type === "tool-error",
                        dynamic: part.dynamic,
                        ...(part.type === "tool-result" ? { preliminary: part.preliminary } : {}),
                      });
                    }
                    break;
                  case "error": throw part.error;
                }
              }
              const providerMetadata = { harness: {
                sessionId: session.sessionId,
                resumeFrom: JSON.parse(JSON.stringify(await stop())),
                ...(pendingPrompts.length ? { pendingPrompts: JSON.parse(JSON.stringify(pendingPrompts.map(message => ({ ...message,
                  content: message.content.map(part => part.type === "file" ? { ...part,
                    data: part.data.type === "data" ? { type: "data", data: convertDataContentToBase64String(part.data.data) } : part.data,
                  } : part),
                })))) } : {}),
              } };
              if (pending) pending.providerMetadata = { ...pending.providerMetadata, ...providerMetadata };
              flush();
              output.enqueue({
                type: "finish", finishReason: { unified: await result.finishReason, raw: undefined },
                usage: sumUsage(usages),
              });
              output.close();
            } catch (error) {
              output.error(await stopAfterFailure(error));
            }
          },
          async cancel(reason) { cancellation.abort(reason); await stop(); },
        }),
      };
    },
    async doGenerate(options) {
      const { stream } = await model.doStream(options);
      const content: LanguageModelV4Content[] = [];
      const blocks = new Map<string, Extract<LanguageModelV4Content, { type: "text" | "reasoning" }>>();
      let finish: Extract<LanguageModelV4StreamPart, { type: "finish" }> | undefined;
      const warnings: SharedV4Warning[] = [];
      for await (const part of stream) {
        if (part.type === "text-start" || part.type === "reasoning-start") {
          const block = { type: part.type === "text-start" ? "text" as const : "reasoning" as const, text: "" };
          blocks.set(part.id, block);
          content.push(block);
        } else if (part.type === "text-delta" || part.type === "reasoning-delta") {
          const block = blocks.get(part.id);
          if (!block) throw new Error("Delta without a content block.");
          block.text += part.delta;
        } else if (part.type === "text-end" || part.type === "reasoning-end") {
          const block = blocks.get(part.id);
          if (!block) throw new Error("End without a content block.");
          block.providerMetadata = part.providerMetadata;
        } else if (part.type === "tool-call" || part.type === "tool-result" || part.type === "tool-approval-request" || part.type === "source" || part.type === "file" || part.type === "reasoning-file" || part.type === "custom") content.push(part);
        else if (part.type === "stream-start") warnings.push(...part.warnings);
        else if (part.type === "finish") finish = part;
      }
      if (!finish) throw new Error("Harness stream ended without a finish event.");
      return { content, finishReason: finish.finishReason, usage: finish.usage, warnings };
    },
  };
  return { model };
}

function unsupportedOptions(options: LanguageModelV4CallOptions): SharedV4Warning[] {
  const names = ["maxOutputTokens", "temperature", "stopSequences", "topP", "topK", "presencePenalty", "frequencyPenalty", "seed", "providerOptions"] as const;
  const warnings: SharedV4Warning[] = names.filter(name => options[name] !== undefined)
    .map(name => ({ type: "unsupported", feature: name, details: "Configure the selected harness through its official runtime settings." }));
  if (options.reasoning && options.reasoning !== "provider-default") warnings.push({ type: "unsupported", feature: "reasoning" });
  if (options.toolChoice && options.toolChoice.type !== "auto") warnings.push({ type: "unsupported", feature: "toolChoice" });
  if (options.includeRawChunks) warnings.push({ type: "unsupported", feature: "includeRawChunks", details: "Only raw events exposed by HarnessAgent can be forwarded." });
  return warnings;
}

function readCheckpoint(prompt: readonly (LanguageModelV4Prompt[number] | ModelMessage)[]): {
  sessionId: string; resumeFrom: HarnessAgentResumeSessionState;
  pendingPrompts?: Extract<LanguageModelV4Prompt[number], { role: "user" }>[];
} | undefined {
  for (const message of [...prompt].reverse()) {
    if (message.role !== "assistant" || typeof message.content === "string") continue;
    for (const part of [...message.content].reverse()) {
      const metadata = "providerOptions" in part ? part.providerOptions?.harness : undefined;
      if (!metadata) continue;
      if (typeof metadata.sessionId !== "string" || !metadata.resumeFrom || typeof metadata.resumeFrom !== "object" || Array.isArray(metadata.resumeFrom)) {
        throw new Error("Invalid harness checkpoint metadata.");
      }
      // HarnessAgent validates its opaque lifecycle payload, including harness ID
      // and adapter-specific schema. Do not recreate that validation here.
      if (metadata.pendingPrompts !== undefined && !Array.isArray(metadata.pendingPrompts)) {
        throw new Error("Invalid pending harness input metadata.");
      }
      const pendingPrompts = metadata.pendingPrompts as unknown as Extract<LanguageModelV4Prompt[number], { role: "user" }>[] | undefined;
      return { sessionId: metadata.sessionId, resumeFrom: metadata.resumeFrom as unknown as HarnessAgentResumeSessionState,
        pendingPrompts: pendingPrompts?.map(message => ({ ...message, content: message.content.map(part =>
          part.type === "file" && part.data.type === "url" ? { ...part, data: { ...part.data, url: new URL(part.data.url) } } : part),
        })),
      };
    }
  }
}

function providerUsage(usage: LanguageModelUsage): LanguageModelV4Usage {
  return {
    inputTokens: {
      total: usage.inputTokens, noCache: usage.inputTokenDetails.noCacheTokens,
      cacheRead: usage.inputTokenDetails.cacheReadTokens,
      cacheWrite: usage.inputTokenDetails.cacheWriteTokens,
    },
    outputTokens: {
      total: usage.outputTokens, text: usage.outputTokenDetails.textTokens,
      reasoning: usage.outputTokenDetails.reasoningTokens,
    },
    raw: usage.raw,
  };
}

function sumUsage(usages: LanguageModelV4Usage[]): LanguageModelV4Usage {
  const sum = (values: (number | undefined)[]) => values.every(value => value === undefined)
    ? undefined : values.reduce<number>((total, value) => total + (value ?? 0), 0);
  return {
    inputTokens: {
      total: sum(usages.map(usage => usage.inputTokens.total)),
      noCache: sum(usages.map(usage => usage.inputTokens.noCache)),
      cacheRead: sum(usages.map(usage => usage.inputTokens.cacheRead)),
      cacheWrite: sum(usages.map(usage => usage.inputTokens.cacheWrite)),
    },
    outputTokens: {
      total: sum(usages.map(usage => usage.outputTokens.total)),
      text: sum(usages.map(usage => usage.outputTokens.text)),
      reasoning: sum(usages.map(usage => usage.outputTokens.reasoning)),
    },
    ...(usages.length === 1 ? { raw: usages[0]?.raw } : {}),
  };
}
