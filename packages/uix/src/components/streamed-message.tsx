"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { UIMessage, ThinkingPart, ToolCallPart } from "@tanstack/ai-client";
import { ChatMessage } from "./chat-message";
import { ChatAttachment } from "./chat-attachment";
import { ChatMarkdown } from "./chat-markdown";
import { ToolCallCard } from "./tool-call-card";
import { ThinkingPanel } from "./thinking-panel";
import { TerminalOutput } from "./terminal-output";
import { AgentQuestion, toolQuestion, type AgentQuestionState } from "./agent-question";
import type { AskUserAnswer } from "./ask-user-questions";
import { activityLabels, toolActivity } from "../lib/chat-activity-labels";
import { codeHighlights, type CodeHighlight } from "../lib/code-highlight";
import { cn } from "../lib/utils";

/*
 * StreamedChatMessage – one message of the Sensei's chat as it streams: the learner's words, or the Sensei's – its
 * thinking and tool calls folded into one activity panel, its words in Markdown, the questions it asks as a form,
 * the lesson's checks as a terminal, attachments as attachments. The app hands it the message (TanStack AI's
 * UIMessage); what only the app knows comes in as props: the questions its agent asks (`question`) and the lesson
 * material it shows (`renderFragment`).
 */

/** A lesson check run's report, as dojo_lesson_verify returns it */
type TestReport = { passed: number; failed: number; total: number; tests: Array<{ name: string; status: string; failureMessages: string[] }> };

export function StreamedChatMessage({
  message,
  onToolAnswer,
  onHighlight,
  question = toolQuestion,
  renderFragment,
  streaming = false,
}: {
  message: UIMessage;
  onToolAnswer?: (answers: Record<string, AskUserAnswer>) => void | Promise<void>;
  onHighlight?: (highlight: CodeHighlight) => void;
  /** The question a tool call asks, if it asks one */
  question?: (part: ToolCallPart) => AgentQuestionState | undefined;
  /** A lesson fragment the Sensei shows (dojo_ui_show, a dojo://lessons/ resource), by its id */
  renderFragment?: (id: string) => ReactNode;
  streaming?: boolean;
}) {
  const assistant = message.role === "assistant";
  const groups = groupMessageParts(message.parts, question);
  return (
    <ChatMessage role={assistant ? "assistant" : "user"} className="dojo-chat-message min-w-0 max-w-full font-prose"
      data-testid={assistant ? "sensei-streaming-message" : "senpai-streaming-message"}>
      <div className={cn("min-w-0 max-w-full space-y-2", assistant && "w-full")}>
        {groups.map((group, index) => {
          if (group.kind === "activity") {
            return <ActivityTimeline activities={group.parts} key={`activity-${index}`} streaming={streaming && index === groups.length - 1} />;
          }
          const part = group.part;
          if (part.type === "text") {
            return <MessageText autoHighlight={streaming} key={`${part.type}-${index}`} onHighlight={onHighlight} streaming={streaming && index === groups.length - 1} text={part.content} />;
          }
          if (part.type === "image" || part.type === "audio" || part.type === "video" || part.type === "document") {
            const metadata = part.metadata as { filename?: string; eve?: { filename?: string } } | undefined;
            const src = part.source.type === "url" ? part.source.value
              : part.source.type === "data" ? `data:${part.source.mimeType};base64,${part.source.value}` : undefined;
            return <ChatAttachment key={`${part.type}-${index}`} kind={part.type} src={src}
              name={metadata?.filename || metadata?.eve?.filename || `${part.type[0].toUpperCase()}${part.type.slice(1)} attachment`} />;
          }
          if (part.type === "ui-resource" && /^(?:dojo|dojofoo):\/\/lessons\//u.test(part.resource.uri)) {
            return <Fragment key={`${part.type}-${index}`} id={part.resource.text ?? ""} render={renderFragment} />;
          }
          if (part.type === "tool-call") {
            if (part.name.includes("dojo_ui_show") && part.state === "complete") {
              const fragmentId = lessonFragmentId(part.input);
              return fragmentId ? <Fragment key={`${part.type}-${part.id}`} id={fragmentId} render={renderFragment} /> : null;
            }
            const asked = question(part);
            if (asked) {
              return onToolAnswer ? (
                <AgentQuestion className="w-full max-w-none" key={`${part.type}-${part.id}`} onAnswer={onToolAnswer}
                  questions={asked.questions} answers={asked.answers} disabled={asked.disabled} failure={asked.failure} />
              ) : null;
            }
            return null;
          }
          return null;
        })}
      </div>
    </ChatMessage>
  );
}

function Fragment({ id, render }: { id: string; render?: (id: string) => ReactNode }) {
  return render?.(id) ?? <p className="w-full text-sm text-muted-foreground">The authored lesson fragment “{id}” is unavailable.</p>;
}

type MessagePart = UIMessage["parts"][number];
type ActivityPart = ThinkingPart | ToolCallPart;
type MessagePartGroup = { kind: "activity"; parts: ActivityPart[] } | { kind: "part"; part: MessagePart };

function groupMessageParts(parts: UIMessage["parts"], question: (part: ToolCallPart) => AgentQuestionState | undefined): MessagePartGroup[] {
  const groups: MessagePartGroup[] = [];
  const questionIds = new Set<string>();
  for (const part of parts) {
    const asked = part.type === "tool-call" ? question(part) : undefined;
    if (asked) {
      if (questionIds.has(asked.id)) continue;
      questionIds.add(asked.id);
    }
    if (part.type === "tool-result") continue;
    if (isTimelineActivity(part, asked !== undefined)) {
      const previous = groups.at(-1);
      if (previous?.kind === "activity") previous.parts.push(part);
      else groups.push({ kind: "activity", parts: [part] });
    } else groups.push({ kind: "part", part });
  }
  return groups;
}

function isTimelineActivity(part: MessagePart, asks: boolean): part is ActivityPart {
  if (part.type === "thinking") return true;
  if (part.type !== "tool-call") return false;
  if (asks) return false;
  if (part.name.includes("dojo_ui_show") || (part.name.includes("dojo_lesson_complete") && !toolFailed(part))) return false;
  // A question renders as its form once Eve publishes the input request.
  if (part.name.includes("dojo_ui_ask") && !toolFailed(part)) return false;
  return true;
}

function lessonFragmentId(input: unknown): string | undefined {
  if (!input || typeof input !== "object" || !("fragmentId" in input)) return undefined;
  return typeof input.fragmentId === "string" ? input.fragmentId : undefined;
}

function isActiveThinkingActivity(activity: ToolCallPart): boolean {
  return activity.type === "tool-call"
    && (activity.state === "awaiting-input" || activity.state === "input-streaming" || activity.state === "input-complete");
}

function ActivityTimeline({ activities, streaming }: { activities: ActivityPart[]; streaming: boolean }) {
  // Part durations may overlap; only a single part gives a chain duration.
  const durationMs = activities.length === 1
    ? (activities[0] as ActivityPart & { durationMs?: number }).durationMs
    : undefined;
  const usedTools = activities.some(part => part.type === "tool-call");
  const currentTool = activities.findLast(part => part.type === "tool-call" && isActiveThinkingActivity(part));
  const tail = activities.at(-1);
  const currentActivity = currentTool?.type === "tool-call" ? toolActivity(currentTool.name, currentTool.input ?? currentTool.arguments)
    : tail?.type === "thinking" ? "thinking" : "waiting";
  const visible = activities.filter(part => part.type !== "thinking" || part.content.trim());
  const duration = typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : undefined;
  const completedLabel = usedTools ? "Worked" : "Thought";
  return <ThinkingPanel label="Activity details" done={!streaming} defaultOpen={false} collapsible={visible.length > 0}
    title={streaming ? <span className="ui-think__shimmer" data-text={activityLabels[currentActivity].label}>{activityLabels[currentActivity].label}</span>
      : duration === undefined ? completedLabel : `${completedLabel} for ${duration < 1000 ? "<1s" : `${Math.round(duration / 1000)}s`}`}>
    {visible.length > 0 ? <div className="w-full min-w-0">
    {visible.map((activity, index) => {
      if (activity.type === "thinking") return <ToolCallCard key={`thinking-${index}`} name="Reasoning" status="success"
        icon={<span className="size-1.5 rounded-full bg-muted-foreground/50" />}>
        <div role="region" aria-label="Reasoning step details" tabIndex={0}
          className="scrollbar-compact max-h-[min(12rem,40vh)] overflow-y-auto overflow-x-hidden overscroll-contain focus-visible:outline focus-visible:outline-1 focus-visible:outline-ring focus-visible:-outline-offset-1">
          <p className="whitespace-pre-wrap text-[13px] leading-6 text-muted-foreground [overflow-wrap:anywhere]">{activity.content}</p>
        </div>
      </ToolCallCard>;
      const completedChecks = activity.name === "dojo_lesson_verify" && activity.state === "complete" && isTestReport(activity.output);
      const failed = !completedChecks && toolFailed(activity);
      const active = isActiveThinkingActivity(activity);
      const output = activity.output === undefined ? undefined : toolOutputText(activity.output) ?? serializeToolValue(activity.output);
      const evaluation = activity.name.includes("dojo_authoring_evaluate") ? evaluationSummary(activity.output, active) : undefined;
      return <ToolCallCard
        key={activity.id}
        name={activity.name}
        summary={evaluation?.label}
        args={typeof activity.input === "string" ? activity.input : activity.input && typeof activity.input === "object" ? activity.input as Record<string, unknown> : undefined}
        result={activity.name === "dojo_lesson_verify" && isTestReport(activity.output) ? undefined : evaluation?.detail ?? output}
        error={failed ? output || "Tool call failed." : undefined}
        status={failed ? "error" : active ? "running" : "success"}
        duration={(activity as ToolCallPart & { durationMs?: number }).durationMs}
      >
        {activity.name === "dojo_lesson_verify" && (isTestReport(activity.output)
          ? <ChatTestTerminal report={activity.output} /> : active ? <ChatTestTerminal /> : null)}
      </ToolCallCard>;
    })}
  </div> : null}
  </ThinkingPanel>;
}

/** ACP tool updates wrap the actual result in content blocks. */
function toolOutputText(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return;
  const content = (value as Record<string, unknown>).content;
  if (!Array.isArray(content)) return;
  const text = content.flatMap(block => block?.type === "content" && block.content?.type === "text" && typeof block.content.text === "string" ? [block.content.text] : []);
  return text.length ? text.join("\n") : undefined;
}

function serializeToolValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

const evaluationStatuses: Record<string, string> = {
  passed: "Teaching passed",
  "material-failed": "Lesson material needs a revision",
  "teaching-failed": "Trial teaching needs a revision",
  "infrastructure-failed": "Evaluation could not finish",
  "preflight-failed": "Preflight found gaps to fix (no attempt used)",
  "not-configured": "Evaluations are not configured",
  "allowance-exhausted": "All three attempts are used",
  stale: "Result no longer matches the lesson",
};

/** A teaching evaluation is a verdict, not a crashed tool: summarize it. */
export function evaluationSummary(output: unknown, active: boolean): { label: string; detail?: string } | undefined {
  if (active) return { label: "Evaluating teaching: trial and two judges, a few minutes" };
  let value = output;
  if (typeof value === "string") { try { value = JSON.parse(value); } catch { return undefined; } }
  if (!value || typeof value !== "object") return undefined;
  const result = value as { status?: string; remaining?: number; error?: string; next?: string; decisions?: Record<string, { blocking?: Array<{ id: string }>; disputed?: Array<{ id: string }> } | undefined> };
  if (!result.status) return undefined;
  const remaining = typeof result.remaining === "number" ? ` · ${result.remaining} ${result.remaining === 1 ? "attempt" : "attempts"} left` : "";
  const decisions = Object.values(result.decisions ?? {}).filter(decision => decision !== undefined);
  const blocking = [...new Set(decisions.flatMap(decision => decision.blocking?.map(({ id }) => id) ?? []))];
  const disputed = [...new Set(decisions.flatMap(decision => decision.disputed?.map(({ id }) => id) ?? []))];
  const detail = [
    blocking.length ? `Revise: ${blocking.join(", ")}` : "",
    disputed.length ? `Disputed (one judge): ${disputed.join(", ")}` : "",
    result.error ?? "",
    result.next ?? "",
  ].filter(Boolean).join("\n");
  return { label: `${evaluationStatuses[result.status] ?? result.status}${remaining}`, detail: detail || undefined };
}

function toolFailed(part: ToolCallPart): boolean {
  if (part.state === "error") return true;
  if (part.output && typeof part.output === "object") {
    const native = part.output as { rawOutput?: { metadata?: { error?: unknown } } };
    if (native.rawOutput?.metadata?.error === true) return true;
  }
  return /(?:"status"\s*:\s*"failed"|request timed out|mcp error)/iu.test(serializeToolValue(part.output));
}

function isTestReport(value: unknown): value is TestReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Partial<TestReport>;
  return typeof report.passed === "number"
    && typeof report.total === "number"
    && Array.isArray(report.tests);
}

/** The Sensei's words; while they stream, the last line range they mention is highlighted in the editor */
function MessageText({ autoHighlight, onHighlight, streaming, text }: { autoHighlight: boolean; onHighlight?: (highlight: CodeHighlight) => void; streaming: boolean; text: string }) {
  const automaticHighlight = useRef("");
  useEffect(() => {
    if (!autoHighlight || !onHighlight) return;
    const highlight = codeHighlights(text).at(-1);
    if (!highlight) return;
    const signature = `${highlight.from}:${highlight.to}`;
    if (automaticHighlight.current === signature) return;
    automaticHighlight.current = signature;
    onHighlight(highlight);
  }, [autoHighlight, onHighlight, text]);
  return <ChatMarkdown className="w-full" text={text} streaming={streaming} onHighlight={onHighlight} />;
}

function ChatTestTerminal({ report }: { report?: TestReport }) {
  const lines = report?.tests.flatMap((test) => [
    `${test.status === "passed" ? "✓" : test.status === "failed" ? "×" : "-"} ${test.name}`,
    ...test.failureMessages.slice(0, 1).map((failure) => `  ${failure.split("\n")[0]}`),
  ]) ?? [];
  return (
    <TerminalOutput
      label={report ? `${report.passed}/${report.total} lesson checks passed` : "Running lesson checks"}
      status={!report ? "running" : report.failed ? "error" : "success"}
      exitCode={report ? report.failed ? 1 : 0 : undefined}
      lines={lines}
    />
  );
}
