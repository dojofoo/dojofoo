import type { AskUserAnswer } from "@dojofoo/ui/ask-user-questions";
import { ChatContainer, ChatContainerContent, ChatContainerFooter } from "@dojofoo/ui/chat-container";
import { InputMessage } from "@dojofoo/ui/input-message";
import { ChatTranscript } from "@/components/chat/assistant-response";
import { stream, useChat, type UIMessage } from "@tanstack/ai-react";
import type { StreamChunk } from "@tanstack/ai";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { StreamedChatMessage } from "@/routes/index";

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

  return (
    <main className="h-[42rem] w-[30rem] overflow-hidden bg-background text-foreground">
      <ChatContainer className="h-full border-l-0">
        <ChatContainerContent viewportRef={viewportRef}>
          <ChatTranscript messages={messages} streaming={working}
            renderMessage={(message, streaming) => <StreamedChatMessage
              key={message.id} message={message} streaming={streaming}
              fragments={{ "whitespace-runs": "A whitespace **run** contains one or more adjacent whitespace characters." }}
              onToolAnswer={async answers => onAnswer?.(answers)} workspaceId="storybook" />}
          />
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
