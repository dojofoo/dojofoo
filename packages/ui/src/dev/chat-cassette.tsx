import type { AskUserAnswer } from "@dojofoo/ui/ask-user-questions";
import { ChatContainer, ChatContainerContent, ChatContainerFooter, ChatContainerHeader } from "@dojofoo/ui/chat-container";
import { InputMessage } from "@dojofoo/ui/input-message";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@dojofoo/ui/select";
import { ThinkingIndicator } from "@dojofoo/ui/thinking-indicator";
import { stream, useChat, type UIMessage } from "@tanstack/ai-react";
import type { StreamChunk } from "@tanstack/ai";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { StreamedChatMessage } from "@/routes/index";
import { useChatWorkTiming } from "@/lib/chat-work-timing";

export type ChatCassetteFrame = {
  delayMs: number;
  chunk?: StreamChunk;
  historyMessage?: UIMessage;
  prompt?: string;
};

export function parseChatCassette(source: string): ChatCassetteFrame[] {
  return source.split("\n").flatMap((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return [];
    try {
      return [JSON.parse(trimmed) as ChatCassetteFrame];
    } catch (error) {
      throw new Error(`Invalid chat cassette line ${index + 1}`, { cause: error });
    }
  });
}

export function ChatCassettePlayer({
  autoPlay = true,
  cassette,
  onAnswer,
  onComplete,
  onFrame,
  speed = 0.5,
}: {
  autoPlay?: boolean;
  cassette: string;
  onAnswer?: (answers: Record<string, AskUserAnswer>) => void;
  onComplete?: (messages: UIMessage[]) => void;
  onFrame?: (frame: ChatCassetteFrame, index: number) => void;
  speed?: number;
}) {
  const frames = useMemo(() => parseChatCassette(cassette), [cassette]);
  const history = useMemo(() => frames.flatMap((frame) => frame.historyMessage ? [frame.historyMessage] : []), [frames]);
  const prompt = frames.find((frame) => frame.prompt !== undefined)?.prompt ?? "Replay this interaction.";
  const replayStartedAt = useRef(Date.now());
  const viewportRef = useRef<HTMLElement>(null);
  const followsOutput = useRef(true);
  const messagesRef = useRef<UIMessage[]>([]);
  const connection = useMemo(() => stream(async function* () {
    for (const [index, frame] of frames.entries()) {
      if (!frame.chunk) continue;
      await new Promise<void>((resolve) => window.setTimeout(resolve, frame.delayMs / speed));
      onFrame?.(frame, index);
      yield resolveCassetteTiming(frame.chunk, replayStartedAt.current);
    }
  }), [frames, onFrame, speed]);
  const { messages, sendMessage, status } = useChat({
    connection,
    initialMessages: history,
    persistence: false,
    threadId: "storybook-session",
    onFinish: () => queueMicrotask(() => onComplete?.(messagesRef.current)),
  });
  messagesRef.current = messages;
  const started = useRef(false);

  useEffect(() => {
    if (!autoPlay || started.current) return;
    started.current = true;
    void sendMessage(prompt);
  }, [autoPlay, prompt, sendMessage]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => {
      followsOutput.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 32;
    };
    viewport.addEventListener("scroll", update, { passive: true });
    return () => viewport.removeEventListener("scroll", update);
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport && followsOutput.current) viewport.scrollTop = viewport.scrollHeight;
  }, [messages]);

  const working = status === "submitted" || status === "streaming";
  const workTiming = useChatWorkTiming(working, "storybook-session");
  const hasOutput = messages.at(-1)?.role === "assistant" && messages.at(-1)!.parts.length > 0;

  return (
    <main className="h-[42rem] w-[30rem] overflow-hidden bg-background text-foreground">
      <ChatContainer className="h-full border-l-0">
        <ChatContainerHeader>
          <div className="grid w-full min-w-0 grid-cols-2 items-start gap-3 text-xs text-muted-foreground">
            <div className="flex min-w-0 flex-col items-start gap-1">
              <span className="px-3 font-display text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Active course</span>
              <Select value="starter-kata">
                <SelectTrigger className="w-full min-w-0 px-3 text-sm font-medium" variant="borderless" />
                <SelectContent><SelectItem index={0} value="starter-kata">Starter Kata</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col items-start gap-1">
              <span className="px-3 font-display text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Session</span>
              <Select value="storybook-session">
                <SelectTrigger className="w-full min-w-0 px-3 text-sm font-medium" variant="borderless" />
                <SelectContent><SelectItem index={0} value="storybook-session">storybook-session</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
        </ChatContainerHeader>
        <ChatContainerContent viewportRef={viewportRef}>
          {messages.map((message) => (
            <StreamedChatMessage
              fragments={{ "whitespace-runs": "A whitespace **run** contains one or more adjacent whitespace characters." }}
              key={message.id}
              message={message}
              onToolAnswer={async (answers) => onAnswer?.(answers)}
              streaming={working && message.id === messages.at(-1)?.id}
              timing={message.id === messages.at(-1)?.id ? workTiming : undefined}
              workspaceId="storybook"
            />
          ))}
          {working && !hasOutput && <ThinkingIndicator label="Thinking" className="py-2" />}
        </ChatContainerContent>
        <ChatContainerFooter>
          <InputMessage disabled onValueChange={() => undefined} placeholder="Ask about the lesson…" sendLabel="Send" status={working ? "streaming" : "idle"} value="" />
        </ChatContainerFooter>
      </ChatContainer>
    </main>
  );
}

function resolveCassetteTime(value: number | undefined, replayStartedAt: number): number | undefined {
  return value !== undefined && value < 1_000_000_000_000 ? replayStartedAt + value : value;
}

function resolveCassetteTiming(chunk: StreamChunk, replayStartedAt: number): StreamChunk {
  return {
    ...chunk,
    timestamp: resolveCassetteTime(chunk.timestamp, replayStartedAt),
  } as StreamChunk;
}
