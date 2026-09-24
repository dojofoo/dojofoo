import { ArrowRight, Check, Circle, LockKeyhole, RotateCcw, Save as SaveIcon, Undo2 } from "lucide-react";
import type { CSSProperties } from "react";
import CodeEditor from "../code-editor";
import { ChatContainer, ChatContainerContent, ChatContainerFooter } from "./chat-container";
import { CourseLessonLayout, CourseLessonNavigation } from "./course-lesson-layout";
import { InputMessage } from "./input-message";
import { ScrollArea } from "./scroll-area";

const demoCode = `export function normalizeHandle(name: string) {
  return name
    .trim()
    .toLowerCase();
}`;

export type CourseLessonScreenModel = {
  courseTitle: string;
  lessons: Array<{
    id: string;
    title: string;
    summary: string;
    state: "completed" | "current" | "upcoming";
  }>;
  lesson: {
    title: string;
    introduction: string;
    tasks: string[];
  };
  workspace: {
    code: string;
    filePath: string;
    language: "javascript" | "typescript" | "python";
    testPercentage: string;
    lineHits?: Record<string, number>;
  };
  chat: Array<{
    id: string;
    link?: { href: string; label: string };
    role: "assistant" | "user";
    text: string;
  }>;
};

export const starterKataCourseScreen: CourseLessonScreenModel = {
  courseTitle: "Starter TypeScript",
  lessons: [
    { id: "001", title: "Normalize a handle", summary: "Turn a display name into one stable value that later domain logic can trust.", state: "current" },
    { id: "002", title: "Model validation", summary: "Represent valid and invalid input as explicit outcomes.", state: "upcoming" },
    { id: "003", title: "Build a summary", summary: "Transform domain records without mutating their source.", state: "upcoming" },
  ],
  lesson: {
    title: "Normalize a handle",
    introduction: "Build a small pure function that converts a display name into a stable handle.",
    tasks: [
      "Trim outer whitespace and lowercase letters.",
      "Collapse each internal whitespace run into one hyphen.",
      "Keep empty or whitespace-only input empty.",
    ],
  },
  workspace: {
    code: demoCode,
    filePath: "katas/001-normalize-handle/solution.ts",
    language: "typescript",
    testPercentage: "50%",
    lineHits: { "1": 1, "2": 1, "3": 1, "4": 0 },
  },
  chat: [
    {
      id: "intro",
      link: {
        href: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions",
        label: "MDN’s regular-expression guide",
      },
      role: "assistant",
      text: "You're close—the remaining step is to recognize a whole run of whitespace. A regular expression can describe that pattern without listing spaces, tabs, and newlines separately. This reference explains the building blocks:",
    },
    { id: "answer", role: "user", text: "Could you show me with this example, especially how I can target every kind of whitespace character?" },
    { id: "nudge", role: "assistant", text: "Sure. In a regular expression, \\s matches a whitespace character. Then the quantifier defines the run: * allows zero or more characters, while + requires at least one. Since a whitespace run cannot be empty, which quantifier fits here?" },
  ],
};

export type CourseLessonScreenProps = {
  className?: string;
  height?: number;
  model: CourseLessonScreenModel;
  onCodeChange?: (code: string) => void;
  readOnly?: boolean;
  showLogo?: boolean;
  style?: CSSProperties;
  theme?: "dark" | "light" | "inherit";
  width?: number;
};

/** Mockable production course workspace for Storybook, visual tests, and embeds. */
export function CourseLessonScreen({
  className,
  height = 900,
  model,
  onCodeChange = () => undefined,
  readOnly = true,
  showLogo = true,
  style,
  theme = "inherit",
  width = 1440,
}: CourseLessonScreenProps) {
  const currentLesson = model.lessons.find((lesson) => lesson.state === "current") ?? model.lessons[0];
  return (
    <CourseLessonLayout
      chat={(
        <ChatContainer>
          <ChatContainerContent>
            {model.chat.map((message) => message.role === "user"
              ? <div className="ml-auto w-fit bg-muted px-3 py-2 font-prose text-sm leading-6" key={message.id}>{message.text}</div>
              : (
                <div className="w-full space-y-2 font-prose text-sm leading-6" key={message.id}>
                  <p>{message.text}</p>
                  {message.link ? (
                    <a
                      className="inline-flex border-muted-foreground/40 border-b text-foreground transition-colors hover:border-foreground"
                      href={message.link.href}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {message.link.label}
                    </a>
                  ) : null}
                </div>
              ))}
          </ChatContainerContent>
          <ChatContainerFooter>
            <InputMessage onSend={() => undefined} onValueChange={() => undefined} placeholder="Ask about the lesson…" sendLabel="Send" status="idle" value="" />
          </ChatContainerFooter>
        </ChatContainer>
      )}
      className={className}
      height={height}
      lesson={(
        <ScrollArea className="min-h-0 bg-surface-1">
          <div className="flex flex-col pb-12">
            <div className="order-2 px-8 pt-8">
              <p className="font-display text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Current lesson</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">{model.lesson.title}</h2>
              <div className="mt-5 space-y-4 font-prose text-muted-foreground">
                <p>{model.lesson.introduction}</p>
                <h3 className="text-lg font-semibold text-foreground">Tasks</h3>
                <ul className="list-disc space-y-1 pl-5">
                  {model.lesson.tasks.map((task) => <li key={task}>{task}</li>)}
                </ul>
              </div>
            </div>

            <section className="order-1 w-full border-[#242424] border-b bg-[#0a0a0a] text-[#ededed] shadow-surface-3">
              <div className="flex h-10 items-stretch border-[#242424] border-b bg-black">
                <div className="flex items-stretch">
                  <button className="border-[#242424] border-r border-t-2 border-t-[#ededed] bg-[#0a0a0a] px-4 font-mono text-[#a1a1a1] text-xs" type="button">
                    <span className="flex items-center gap-2">solution.ts <Circle className="size-2 fill-[#878787] text-[#878787]" /></span>
                  </button>
                  <button className="flex items-center gap-2 border-[#242424] border-r border-t-2 border-t-transparent bg-black px-4 text-[#a1a1a1] text-xs" type="button">
                    <span>Tests</span><span className="text-[#878787] text-[10px]">{model.workspace.testPercentage}</span>
                  </button>
                </div>
                <div className="ml-auto flex items-stretch border-[#242424] border-l">
                  <button className="flex items-center gap-2 border-[#242424] border-r px-3 text-[#a1a1a1] text-xs" type="button"><RotateCcw className="size-3.5" />Reset</button>
                  <button className="flex items-center gap-2 border-[#242424] border-r px-3 text-[#a1a1a1] text-xs" type="button"><Undo2 className="size-3.5" />Undo</button>
                  <button className="flex items-center gap-2 border-[#242424] border-r px-3 text-[#878787] text-xs" type="button"><SaveIcon className="size-3.5" />Save</button>
                  <button className="bg-[#0070f3] px-4 text-white text-xs" type="button">Check</button>
                </div>
              </div>
              <div className="aspect-video min-h-0 overflow-hidden">
                <CodeEditor code={model.workspace.code} coverage filePath={model.workspace.filePath} language={model.workspace.language} lessonApiBase="" lineHits={model.workspace.lineHits} onChange={onCodeChange} readOnly={readOnly} />
              </div>
            </section>
          </div>
        </ScrollArea>
      )}
      navigation={(
        <CourseLessonNavigation courseTitle={model.courseTitle} showLogo={showLogo}>
            {model.lessons.map((lesson) => (
              <div className={`w-full border-b border-dashed ${lesson.state === "current" ? "bg-hover" : ""}`} key={lesson.id}>
                <div className={`flex w-full items-center gap-2.5 px-4 py-4 text-left text-[14px] font-medium ${lesson.state === "upcoming" ? "text-muted-foreground/40" : lesson.state === "current" ? "text-foreground" : "text-muted-foreground"}`}>
                  <span className="min-w-0 flex-1 truncate">{lesson.id} {lesson.title}</span>
                  {lesson.state === "completed"
                    ? <Check className="size-4 text-emerald-400" strokeWidth={1.75} />
                    : lesson.state === "current"
                      ? <ArrowRight className="size-4 text-foreground" strokeWidth={1.75} />
                      : <LockKeyhole className="size-3.5 text-muted-foreground/45" strokeWidth={1.75} />}
                </div>
                {lesson.id === currentLesson?.id ? <p className="border-t border-dashed p-4 font-prose text-[13px] text-muted-foreground leading-5">{lesson.summary}</p> : null}
              </div>
            ))}
        </CourseLessonNavigation>
      )}
      style={style}
      theme={theme}
      width={width}
    />
  );
}
