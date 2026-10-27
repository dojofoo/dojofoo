import { useEffect, useRef } from "react";
import type { UIMessage, ThinkingPart, ToolCallPart } from "@tanstack/ai-client";
import type { BundledLanguage } from "shiki";
import { ChatMessage } from "@dojofoo/uix/components/chat-message";
import { ToolCallCard } from "@dojofoo/uix/components/tool-call-card";
import { ThinkingPanel } from "@dojofoo/uix/components/thinking-panel";
import { TerminalOutput } from "@dojofoo/uix/components/terminal-output";
import type { AskUserAnswer } from "@dojofoo/ui/ask-user-questions";
import { CodeBlock } from "@dojofoo/uix/components/code-block";
import { CourseContent } from "@/components/course-content";
import { activityLabels, toolActivity } from "@/lib/chat-activity-labels";
import { isInternalLessonMessage } from "@/lib/chat-internal";
import { cn } from "@/lib/utils";
import { codeHighlight, codeHighlights, type CodeHighlight } from "@/lib/code-highlight";
import type { ChatWorkTiming } from "@/lib/chat-work-timing";
import type { TestReport } from "@/server/lesson/service";
import { AgentQuestion, isAgentQuestion, agentQuestionState, agentQuestionId } from "./agent-question";

export function StreamedChatMessage({
  fragments,
  message,
  onToolAnswer,
  onHighlight,
  streaming = false,
  timing,
  workspaceId,
}: {
  fragments: Record<string, string>;
  message: UIMessage;
  onToolAnswer?: (answers: Record<string, AskUserAnswer>) => void | Promise<void>;
  onHighlight?: (highlight: CodeHighlight) => void;
  streaming?: boolean;
  timing?: ChatWorkTiming;
  workspaceId: string;
}) {
  const assistant = message.role === "assistant";
  const groups = groupMessageParts(message.parts);
  return (
    <ChatMessage role={assistant ? "assistant" : "user"} className="dojo-chat-message min-w-0 max-w-full font-prose"
      data-testid={assistant ? "sensei-streaming-message" : "senpai-streaming-message"}>
      <div className={cn("min-w-0 max-w-full space-y-2", assistant && "w-full")}>
        {groups.map((group, index) => {
          if (group.kind === "activity") {
            return <ActivityTimeline activities={group.parts} key={`activity-${index}`} streaming={streaming && index === groups.length - 1} />;
          }
          const part = group.part;
          if (part.type === "thinking") {
            return null;
          }
          if (part.type === "text") {
            if (isInternalLessonMessage(part.content)) return null;
            return <MessageContent autoHighlight={streaming} fragments={fragments} key={`${part.type}-${index}`} onHighlight={onHighlight} text={part.content} workspaceId={workspaceId} />;
          }
          if (part.type === "ui-resource" && /^(?:dojo|dojofoo):\/\/lessons\//u.test(part.resource.uri)) {
            return <MessageContent fragments={fragments} key={`${part.type}-${index}`} kind="lesson-fragment" text={part.resource.text ?? ""} workspaceId={workspaceId} />;
          }
          if (part.type === "tool-call") {
            if (part.name.includes("dojo_ui_show") && part.state === "complete") {
              const fragmentId = lessonFragmentId(part.input);
              return fragmentId
                ? <MessageContent fragments={fragments} key={`${part.type}-${part.id}`} kind="lesson-fragment" text={fragmentId} workspaceId={workspaceId} />
                : null;
            }
            if (isAgentQuestion(part)) {
              return onToolAnswer ? (
                <AgentQuestion
                  className="w-full max-w-none"
                  key={`${part.type}-${part.id}`}
                  onAnswer={onToolAnswer}
                  {...agentQuestionState(part)}
                />
              ) : null;
            }
            if (part.name.includes("dojo_lesson_complete") && !toolFailed(part)) return null;
            return null;
          }
          return null;
        })}
      </div>
    </ChatMessage>
  );
}

type MessagePart = UIMessage["parts"][number];
type ActivityPart = ThinkingPart | ToolCallPart;
type MessagePartGroup = { kind: "activity"; parts: ActivityPart[] } | { kind: "part"; part: MessagePart };

function groupMessageParts(parts: UIMessage["parts"]): MessagePartGroup[] {
  const groups: MessagePartGroup[] = [];
  const questionIds = new Set<string>();
  for (const part of parts) {
    if (part.type === "tool-call" && isAgentQuestion(part)) {
      const id = agentQuestionId(part);
      if (questionIds.has(id)) continue;
      questionIds.add(id);
    }
    if (part.type === "tool-result") continue;
    if (isTimelineActivity(part)) {
      const previous = groups.at(-1);
      if (previous?.kind === "activity") previous.parts.push(part);
      else groups.push({ kind: "activity", parts: [part] });
    } else groups.push({ kind: "part", part });
  }
  return groups;
}

function isTimelineActivity(part: MessagePart): part is ActivityPart {
  if (part.type === "thinking") return true;
  if (part.type !== "tool-call") return false;
  if (isAgentQuestion(part)) return false;
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

function MessageContent({
  autoHighlight = false,
  fragments,
  kind,
  onHighlight,
  text,
  workspaceId,
}: {
  autoHighlight?: boolean;
  fragments?: Record<string, string>;
  kind?: "message" | "commentary" | "reasoning" | "tool" | "checkpoint" | "lesson-fragment";
  onHighlight?: (highlight: CodeHighlight) => void;
  text: string;
  workspaceId?: string;
}) {
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

  if (kind === "lesson-fragment") {
    const fragment = fragments?.[text];
    return fragment
      ? <div className="w-full rounded-[var(--box-radius)] bg-[var(--surface-3)] p-4 shadow-[var(--shadow-2)]"><CourseContent basePath={null} workspaceId={workspaceId ?? ""} diagrams={false}>{fragment}</CourseContent></div>
      : <p className="w-full text-sm text-muted-foreground">The authored lesson fragment “{text}” is unavailable.</p>;
  }
  if (kind === "commentary") {
    return (
      <div className="w-full border-l border-dashed pl-3 text-sm text-muted-foreground">
        <p className="mb-1 font-display text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Agent note</p>
        <MarkdownText onHighlight={onHighlight} text={text} />
      </div>
    );
  }
  if (kind === "tool" || kind === "checkpoint") {
    return <p className="w-full font-mono text-xs text-muted-foreground">{text}</p>;
  }

  const parts = text.split(/```([\w-]*)\n([\s\S]*?)```/g);
  return (
    <div className="w-full space-y-2 text-sm leading-6">
      {parts.map((part, index) => {
        if (index % 3 === 1) return null;
        if (index % 3 === 2) {
          return (
            <CodeBlock code={part.trimEnd()} key={index} lang={codeLanguage(parts[index - 1])} />
          );
        }
        return part.trim() ? <MarkdownText key={index} onHighlight={onHighlight} text={part} /> : null;
      })}
    </div>
  );
}

function MarkdownText({ onHighlight, text }: { onHighlight?: (highlight: CodeHighlight) => void; text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }
    const listMatch = line.match(/^([-*]|\d+[.)])\s+(.*)$/);
    if (listMatch) {
      const ordered = /^\d/.test(listMatch[1]);
      const items: string[] = [];
      while (index < lines.length) {
        const match = lines[index].trim().match(/^([-*]|\d+[.)])\s+(.*)$/);
        if (!match || /^\d/.test(match[1]) !== ordered) break;
        items.push(match[2]);
        index += 1;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List className={`${ordered ? "list-decimal" : "list-disc"} space-y-1 pl-7`} key={`list-${index}`}>
          {items.map((item, itemIndex) => <li key={itemIndex}>{inlineMessage(item, onHighlight)}</li>)}
        </List>,
      );
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      blocks.push(<p className="font-semibold text-foreground" key={`heading-${index}`}>{inlineMessage(heading[2], onHighlight)}</p>);
    } else if (line.startsWith("> ")) {
      blocks.push(<blockquote className="border-l border-dashed pl-3 text-muted-foreground" key={index}>{inlineMessage(line.slice(2), onHighlight)}</blockquote>);
    } else {
      blocks.push(<p className="whitespace-pre-wrap" key={index}>{inlineMessage(line, onHighlight)}</p>);
    }
    index += 1;
  }
  return <>{blocks}</>;
}

function inlineMessage(value: string, onHighlight?: (highlight: CodeHighlight) => void) {
  return value.split(/(`[^`]+`|\*\*[^*]+\*\*|\[highlight:L\d+(?:-(?:L)?\d+)?\])/giu).map((part, index) => {
    const highlight = codeHighlight(part);
    if (highlight) {
      return (
        <button
          className="dojo-inline-code cursor-pointer text-[var(--brand)] hover:opacity-80"
          key={index}
          onClick={() => onHighlight?.(highlight)}
          type="button"
        >
          {part}
        </button>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code className="dojo-inline-code" key={index}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
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

function codeLanguage(value: string): BundledLanguage {
  const language = value.toLowerCase();
  if (language === "js") return "javascript";
  if (language === "ts") return "typescript";
  if (language === "py") return "python";
  if (language === "tsx" || language === "jsx" || language === "javascript" || language === "typescript" || language === "python" || language === "json" || language === "bash" || language === "shell") {
    return language;
  }
  return "markdown";
}
