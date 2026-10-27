import { fadeViewTransition } from "../lib/view-transition";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CodeEditor, Editor, EditorStatus, EditorTabs, type EditorLanguage } from "../containers/editor";
import { BrandLogo } from "../components/brand-logo";
import { useAuthoringFiles } from "../hooks/use-authoring-files";
import { AgentChatWorkspace } from "../containers/agent-chat";
import { ChatMessages, Composer as OriginalComposer, useChatThread } from "../containers/assistant-home";
import { Icon } from "../components/app-shell";
import { Button } from "../components/button";
import { ToolCallCard, ToolCallGroup } from "../components/tool-call-card";
import { EvalsPanel } from "../components/evals";
import { VideoStage, type VideoCue, type VideoCueEvent } from "../containers/video-stage";
import { CodexIcon, PiIcon } from "../components/harness-icons";
import { BookOpen01Icon, File01Icon, Globe02Icon, PencilEdit02Icon, CheckListIcon, PlayIcon, PlusSignIcon } from "../lib/icons";
import { LessonBrief, LessonChecklist, type LessonCheck, type LessonResource } from "../components/lesson-brief";

type DraftFile = { path: string; label: string; content: string };
type DraftLesson = { id: string; title: string; description: string; senseiPath: string; templatePath: string; hasSensei: boolean; sensei: string; evalPaths: string[]; checks: LessonCheck[]; files: DraftFile[] };
type AuthoringDraft = { root: string; style: string; name: string; description: string; language: string; manifestSource: string; courseGuidance: string; rootFiles: DraftFile[]; lessons: DraftLesson[]; issues: unknown[]; courseChecks: LessonCheck[] };

const rootFiles = [
  { path: "dojo.yaml", label: "dojo.yaml", content: "name: Everyday TypeScript\nmode: katas\nlanguage: typescript\nkatas:\n  - name: 001-largest-number\n    template: src/001-largest-number/kata.ts\n" },
  { path: "DOJO.md", label: "DOJO.md", content: "# Everyday TypeScript\n\nBuild confidence with arrays through small, useful programs.\n\n- Assume basic functions and variables.\n- Connect each new idea to the learner's attempt.\n" },
];
const lessons = ["001-largest-number", "002-filter-positive"].map((id, index) => ({
  id, title: index === 0 ? "Largest number" : "Positive numbers", description: "Explore one array operation at a time.",
  senseiPath: `src/${id}/SENSEI.md`, templatePath: `src/${id}/kata.ts`, hasSensei: true, sensei: "", evalPaths: [], checks: [
    { id: "sensei", label: "Lesson briefing and Sensei guidance", ready: true },
    { id: "scaffold", label: "Learner scaffold and checks", ready: true },
  ],
  files: [
    { path: `src/${id}/SENSEI.md`, label: "SENSEI.md", content: index === 0
      ? "# Find the best day\n\n## Start\n\nYour fitness tracker has a week of step counts. Which day was your best?\n\nAsk the learner to predict what they would remember after each value.\n\n## Teach\n\nUse a different problem to explore a running value. Let the learner choose the edit.\n\n## Orientation\n\n### How the learner gets there\n\n1. **Predict:** read `4, 9, 2` aloud and say what you’d remember after each number.\n2. Turn that memory into a **running value** and update it in a [`for...of`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for...of) loop.\n3. Handle the edge cases the checks name: an empty list, all negative numbers, equal values.\n\n### Watch for\n\n- Starting the running value at `0` – it fails on `[-3, -7, -1]`.\n- Sorting the list to take the last item: correct, but it changes the input and hides the idea.\n"
      : "# Keep the positive ones\n\n## Start\n\nA list of daily temperature changes: which days got warmer?\n\nAsk the learner which values stay before they write anything.\n\n## Orientation\n\n### How the learner gets there\n\n1. **Predict:** which of `3, -1, 0, 8` stay, and is `0` positive?\n2. Build the result in a new array first, then meet [`Array.prototype.filter`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter) as the same idea in one line.\n3. Mark the parameter `readonly` so TypeScript guards the input.\n" },
    { path: `src/${id}/kata.ts`, label: "kata.ts", content: index === 0
      ? "/** Return the largest value, or undefined for an empty array. */\nexport function max(numbers: number[]): number | undefined {\n  // Your first step goes here.\n  return undefined;\n}\n"
      : "/** Keep positive values without changing the input. */\nexport function positive(numbers: number[]): number[] {\n  return [];\n}\n" },
    { path: `src/${id}/kata.test.ts`, label: "kata.test.ts", content: index === 0
      ? "import { expect, it } from 'vitest';\nimport { max } from './kata';\n\nit('handles an empty list', () => {\n  expect(max([])).toBeUndefined();\n});\n\nit('finds the largest of mixed signs', () => {\n  expect(max([-3, -7, -1])).toBe(-1);\n});\n\nit('keeps the first of equal values', () => {\n  expect(max([4, 9, 9])).toBe(9);\n});\n"
      : "import { expect, it } from 'vitest';\nimport { positive } from './kata';\n\nit('keeps an empty list empty', () => {\n  expect(positive([])).toEqual([]);\n});\n" },
  ],
}));
const everyday: AuthoringDraft = { root: "/preview", style: "katas", name: "Everyday TypeScript", description: "Practice with arrays.", language: "TypeScript", manifestSource: rootFiles[0].content, courseGuidance: rootFiles[1].content, rootFiles, lessons, issues: [], courseChecks: [
  { id: "manifest", label: "Course metadata", ready: true },
  { id: "intent", label: "Course intent and teaching rules", ready: true },
  { id: "curriculum", label: "At least one lesson", ready: true },
] };
/** A second course, one lesson so far – its files live under advanced/ */
const advancedFiles = [
  { path: "advanced/dojo.yaml", label: "dojo.yaml", content: "name: Advanced TypeScript\nmode: katas\nlanguage: typescript\nkatas:\n  - name: 001-narrow-shapes\n    template: src/001-narrow-shapes/kata.ts\n" },
  { path: "advanced/DOJO.md", label: "DOJO.md", content: "# Advanced TypeScript\n\nLet the type system carry the logic: unions, narrowing and exhaustive checks.\n\n- Assume Everyday TypeScript.\n- One type-level idea per lesson.\n" },
];
const advanced: AuthoringDraft = { ...everyday, root: "/preview/advanced", name: "Advanced TypeScript", description: "Let the types carry the logic.", manifestSource: advancedFiles[0].content, courseGuidance: advancedFiles[1].content, rootFiles: advancedFiles, lessons: [{
  id: "001-narrow-shapes", title: "Narrowing shapes", description: "Narrow a union by its tag.",
  senseiPath: "advanced/src/001-narrow-shapes/SENSEI.md", templatePath: "advanced/src/001-narrow-shapes/kata.ts", hasSensei: true, sensei: "", evalPaths: [], checks: lessons[0].checks,
  files: [
    { path: "advanced/src/001-narrow-shapes/SENSEI.md", label: "SENSEI.md", content: "# Narrowing shapes\n\n## Start\n\nA drawing app stores circles, squares and rectangles. How big is each one?\n\nAsk the learner which properties they can read before they know the shape.\n\n## Orientation\n\n### How the learner gets there\n\n1. **Predict:** before you know the kind, can you read `shape.radius`? Why not?\n2. Switch on `shape.kind` and watch TypeScript [narrow the union](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions) in each `case`.\n3. End with a `default` that assigns the shape to `never`, so a new kind of shape stops the build: [exhaustiveness checking](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#exhaustiveness-checking).\n\n### Watch for\n\n- Testing `\"radius\" in shape` instead of the tag – it narrows too, but it hides the idea of a shared tag.\n- Casting with `as` to silence an error – that turns the checker off exactly where it should help.\n" },
    { path: "advanced/src/001-narrow-shapes/kata.ts", label: "kata.ts", content: "export type Shape =\n  | { kind: \"circle\"; radius: number }\n  | { kind: \"square\"; size: number }\n  | { kind: \"rect\"; width: number; height: number };\n\n/** The area of any shape – TypeScript should flag a shape you forgot. */\nexport function area(shape: Shape): number {\n  // Your first step goes here.\n  return 0;\n}\n" },
    { path: "advanced/src/001-narrow-shapes/kata.test.ts", label: "kata.test.ts", content: "import { expect, it } from 'vitest';\nimport { area } from './kata';\n\nit('measures a circle', () => {\n  expect(area({ kind: 'circle', radius: 1 })).toBeCloseTo(Math.PI);\n});\n\nit('measures a square', () => {\n  expect(area({ kind: 'square', size: 3 })).toBe(9);\n});\n\nit('measures a rectangle', () => {\n  expect(area({ kind: 'rect', width: 2, height: 5 })).toBe(10);\n});\n" },
  ],
}] };
const initialCourses = [everyday, advanced];
/** Kyoshi's and the Sensei's tool calls as the real tools report them, one set per view. */
function ToolCalls({ view }: { view: "Authoring" | "Evaluation" | "Trial" }) {
  const [started] = useState(() => Date.now() - 41_000);
  if (view === "Trial") return <ToolCallCard name="run_checks" summary="kata.test.ts · 1 of 3 passing" status="success" duration={1840}
    args={{ lesson: "001-largest-number" }} result={{ passed: ["handles an empty list"], failed: ["finds the largest of mixed signs", "keeps the first of equal values"] }} />;
  if (view === "Evaluation") return <ToolCallCard name="dojo_authoring_evaluate" summary="Trial · attempt 2 of 3" status="running" startedAt={started}
    args={{ lessonIds: ["001-largest-number"] }} />;
  return <ToolCallGroup label="Drafted the lesson eval-first">
    <ToolCallCard name="read" summary="SENSEI.md, kata.test.ts" status="success" duration={420} args={{ paths: ["src/001-largest-number/SENSEI.md", "src/001-largest-number/kata.test.ts"] }} />
    <ToolCallCard name="edit" summary="kata.test.ts · three checks, easiest first" status="success" duration={1260} args={{ path: "src/001-largest-number/kata.test.ts" }} />
    <ToolCallCard name="edit" summary="SENSEI.md · Start, Teach, Stumbling points" status="success" duration={2310} args={{ path: "src/001-largest-number/SENSEI.md" }} />
    <ToolCallCard name="dojo_authoring_evaluate" summary="Preflight · 1 finding, no attempt used" status="success" duration={180}
      args={{ lessonIds: ["001-largest-number"] }} result={{ status: "preflight-failed", findings: ["Add the **Predict:** line from SENSEI.tmpl."] }} />
  </ToolCallGroup>;
}

type Lesson = AuthoringDraft["lessons"][number];
/** The last run's passing checks per lesson – a preview stand-in for the course's test results */
const lessonRuns: Record<string, number> = { "001-largest-number": 1, "002-filter-positive": 0, "001-narrow-shapes": 0 };
const checkNames = (lesson: Lesson) => lesson.files.filter(file => /\.test\.ts$/.test(file.path)).flatMap(file => [...file.content.matchAll(/\bit\(['"](.+?)['"]/g)].map(match => match[1]));

const mdn = (path: string) => `https://developer.mozilla.org/en-US/docs/Web/JavaScript/${path}`;
const ts = (page: string) => `https://www.typescriptlang.org/docs/handbook/2/${page}`;
/** What the learner reads about each lesson: its goal and where to read more. How to get there and what to watch for
    are the Sensei's – its orientation in SENSEI.md */
const briefs: Record<string, { lead: string; body: ReactNode; resources: LessonResource[] }> = {
  "001-largest-number": {
    lead: "Find the largest number in a list by walking through it once – and decide what “largest” means for an empty list.",
    body: <>
      <h3>Goal</h3>
      <p>Write <code>max(numbers)</code> so it returns the largest value, or <code>undefined</code> when the list is empty – without reaching for <a href={mdn("Reference/Global_Objects/Math/max")} target="_blank" rel="noreferrer"><code>Math.max</code></a>.</p>
    </>,
    resources: [
      { title: "for…of", note: "MDN · Statements", href: mdn("Reference/Statements/for...of"), icon: BookOpen01Icon },
      { title: "Math.max()", note: "MDN · Why the empty case differs (-Infinity)", href: mdn("Reference/Global_Objects/Math/max"), icon: BookOpen01Icon },
      { title: "Everyday Types", note: "TypeScript Handbook · Arrays and union types", href: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html", icon: Globe02Icon },
    ],
  },
  "001-narrow-shapes": {
    lead: "Compute the area of any shape by switching on its kind – and let TypeScript tell you when a shape is missing.",
    body: <>
      <h3>Goal</h3>
      <p>Write <code>area(shape)</code> for a <code>Shape</code> that is a circle, a square or a rectangle, using only what each kind of shape has.</p>
    </>,
    resources: [
      { title: "Discriminated unions", note: "TypeScript Handbook · Narrowing", href: ts("narrowing.html#discriminated-unions"), icon: Globe02Icon },
      { title: "The never type", note: "TypeScript Handbook · Exhaustiveness checking", href: ts("narrowing.html#exhaustiveness-checking"), icon: Globe02Icon },
      { title: "switch", note: "MDN · Statements", href: mdn("Reference/Statements/switch"), icon: BookOpen01Icon },
    ],
  },
  "002-filter-positive": {
    lead: "Keep only the positive numbers – and leave the original list exactly as it was.",
    body: <>
      <h3>Goal</h3>
      <p>Write <code>positive(numbers)</code> so it returns a new array of the values above zero, with the input unchanged.</p>
    </>,
    resources: [
      { title: "Array.prototype.filter()", note: "MDN · Reference", href: mdn("Reference/Global_Objects/Array/filter"), icon: BookOpen01Icon },
      { title: "The ReadonlyArray type", note: "TypeScript Handbook · Object types", href: "https://www.typescriptlang.org/docs/handbook/2/objects.html#the-readonlyarray-type", icon: Globe02Icon },
    ],
  },
};
/** Each course's own page: its lead line and where to read up */
const courseBriefs: Record<string, { lead: string; resources: LessonResource[] }> = {
  "Everyday TypeScript": { lead: "Build confidence with arrays through small, useful programs – one operation per lesson.", resources: [
    { title: "Indexed collections", note: "MDN · Guide to arrays", href: mdn("Guide/Indexed_collections"), icon: BookOpen01Icon },
    { title: "The TypeScript Handbook", note: "typescriptlang.org", href: "https://www.typescriptlang.org/docs/handbook/intro.html", icon: Globe02Icon },
  ] },
  "Advanced TypeScript": { lead: "Let the type system carry the logic: unions, narrowing and exhaustive checks – one type-level idea per lesson.", resources: [
    { title: "Narrowing", note: "TypeScript Handbook", href: "https://www.typescriptlang.org/docs/handbook/2/narrowing.html", icon: Globe02Icon },
    { title: "Creating types from types", note: "TypeScript Handbook · Type manipulation", href: "https://www.typescriptlang.org/docs/handbook/2/types-from-types.html", icon: Globe02Icon },
  ] },
};

/** What's open, explained as Dojofoo's lesson page does: the title, the briefing and its resources –
    the lesson itself, not how it's built or checked */
function LessonDetails({ course, lesson }: { course: AuthoringDraft; /** The open lesson; without one, the course */ lesson?: Lesson }) {
  const brief: { lead: string; body?: ReactNode; resources: LessonResource[] } | undefined = lesson ? briefs[lesson.id] : courseBriefs[course.name];
  return <LessonBrief title={lesson?.title ?? course.name} lead={brief?.lead ?? lesson?.description ?? course.description}
    resources={brief?.resources}>
    {brief?.body}
    <LessonChecklist checks={lesson?.checks ?? course.courseChecks} />
  </LessonBrief>;
}

/** The models the harnesses offer, each with its harness's mark from the website */
const harnessModels = [
  { id: "pi/deepseek", name: "DeepSeek V4 Pro", description: "Pi · your local login", harness: PiIcon },
  { id: "codex/sol", name: "GPT-6.1-Sol", description: "Codex · your local login", harness: CodexIcon },
];
const composerModels = harnessModels.map(({ name, description, harness }) => ({ name, description, icon: harness }));

/** The course's intro video: Blender's open movie Big Buck Bunny as a plain file served without CORS (a 10-second 720p
    clip from test-videos.co.uk) – the light still glows, since the SVG filter never reads the frames */
const sampleVideo = "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_5MB.mp4";
/** The same film on YouTube (Blender's upload), played in our player through its YouTube engine */
const sampleYoutube = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
/** The cues an author sets on the intro video: a moment to tell Kyoshi about, a range to skip, and when it counts as
    watched – a little before the end */
const videoCues = (src: string): VideoCue[] => src === sampleYoutube
  ? [{ kind: "marker", id: "awake", at: 12, label: "The bunny wakes up" }, { kind: "skip", id: "titles", from: 20, to: 30, label: "titles" }, { kind: "done", id: "watched", before: 30, label: "Intro watched" }]
  : [{ kind: "marker", id: "awake", at: 3, label: "The bunny wakes up" }, { kind: "skip", id: "sponsor", from: 5, to: 7, label: "sponsor" }, { kind: "done", id: "watched", before: 2, label: "Intro watched" }];
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
/** How a cue reads where the agent hears about it */
const cueSummary = ({ cue, time }: VideoCueEvent) => cue.kind === "skip" ? `Skipped ${cue.label} · ${clock(cue.from)}–${clock(cue.to)}` : `${cue.kind === "done" ? cue.label ?? "Watched" : cue.label} · ${clock(time)}`;
export function CourseAuthoringPage({ mode = "Authoring", initialCourse = "Everyday TypeScript", question = false, settings = false, evals = false, video = sampleVideo, documentationUrl }: { mode?: "Authoring" | "Evaluation" | "Trial"; initialCourse?: string; question?: boolean; settings?: boolean; evals?: boolean; video?: string; documentationUrl?: string }) {
  const [courses, setCourses] = useState(() => {
    const selected = initialCourses.find(course => course.name === initialCourse) ?? initialCourses[0];
    return [selected, ...initialCourses.filter(course => course !== selected)];
  });
  const cues = useMemo(() => videoCues(video), [video]);
  const [videoEvents, setVideoEvents] = useState<VideoCueEvent[]>([]);
  // A course is a page, not files: its intro video (Everyday TypeScript has one) on the stage and its description. Only
  // lessons open in the editor
  const [page, setPage] = useState<string | null>(null);
  const files = useMemo(() => courses.flatMap(course => [...course.rootFiles, ...course.lessons.flatMap(lesson => lesson.files)]), [courses]);
  const editor = useAuthoringFiles(files);
  const file = editor.tabs.active ?? "";
  const setFile = editor.open;
  const saveFile = (value: string) => {
    const save = (entry: DraftFile) => entry.path === file ? { ...entry, content: value } : entry;
    setCourses(items => items.map(item => ({ ...item,
      rootFiles: item.rootFiles.map(save),
      lessons: item.lessons.map(lesson => ({ ...lesson, files: lesson.files.map(save) })),
    })));
    editor.saved(file, value);
  };
  const [view, setView] = useState(mode);
  const [choice, setChoice] = useState<string>();
  const [queue, setQueue] = useState<Array<{ id: string; text: string }>>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const chat = useChatThread(() => ({ steps: [{ kind: "step", label: "Reading your lesson and its tests" }], paragraphs: view === "Trial"
    ? ["You already spotted the empty-list case. Let's try three temperatures: −3, −7, and −1. Which would a thermometer call the warmest?", "Use that prediction to decide whether your starting value belongs in this list."]
    : ["Let's keep this lesson focused on one idea: remembering a useful value while reading a list.", "I'll give the Sensei a concrete opening, an example from a different problem, and a revealing input for the mistake we expect. You can edit those alongside me."] }));
  const waiting = question && !choice;
  useEffect(() => {
    if (chat.busy || waiting || queue.length === 0) return;
    chat.send(queue[0].text);
    setQueue(items => items.slice(1));
  }, [chat.busy, waiting, queue]);
  const current = editor.activeFile;
  // The course you're in: the page that's open, or the one holding the open lesson file; its lessons fill the sidebar
  // and its files the tabs
  const courseFiles = (target: AuthoringDraft) => [...target.rootFiles, ...target.lessons.flatMap(item => item.files)];
  const holds = (target: AuthoringDraft) => courseFiles(target).some(entry => entry.path === file);
  const course = courses.find(item => item.name === page) ?? courses.find(holds) ?? courses[0];
  const lesson = page ? undefined : course.lessons.find(item => item.files.some(entry => entry.path === file));
  // Where you are: the course, then the open lesson. The mode needs no crumb; the sidebar shows it
  const openCourse = (target: AuthoringDraft) => fadeViewTransition(() => setPage(target.name));
  const openFile = (path: string) => fadeViewTransition(() => { setPage(null); setFile(path); });
  const addLesson = () => {
    const base = course.rootFiles[0].path.replace(/dojo\.yaml$/, "");
    const next = { ...lessons[1], id: `${base}003-new-lesson`, title: "New lesson", files: [{ path: `${base}src/003-new-lesson/SENSEI.md`, label: "SENSEI.md", content: "# New lesson\n" }] };
    setCourses(previous => previous.map(item => item === course ? { ...item, lessons: [...item.lessons.filter(entry => entry.id !== next.id), next] } : item));
    openFile(next.files[0].path);
  };
  const chapter = lesson?.title;
  const language: EditorLanguage = file.endsWith(".md") ? "markdown" : file.endsWith(".yaml") ? "yaml" : "typescript";
  return <div className="h-dvh w-full overflow-hidden">
    <AgentChatWorkspace contentKind={page ? course === courses[0] ? "video" : "material" : "code"} key={`${settings}:${evals}`} defaultSettingsOpen={settings} defaultEvalsOpen={evals} evals={view === "Trial" ? undefined : <EvalsPanel />} workspace={course.name} user={{ name: "You" }} active={[view, `course:${course.name}`, ...(page ? [] : [`file:${file}`])]} showOnboarding showNews={false} sidebarWidth="18rem"
      brand={<a href="#" aria-label="Dojo dashboard" className="flex items-center" onClick={event => event.preventDefault()}><BrandLogo className="w-11" /></a>}
      navigation={[
        { id: "views", layout: "views", items: [
          { id: "Authoring", label: "Authoring", icon: PencilEdit02Icon },
          { id: "Evaluation", label: "Evaluation", icon: CheckListIcon },
          { id: "Trial", label: "Trial", icon: PlayIcon },
        ] },
        // Courses, numbered: each opens its page; the one you're in stays lit while you work in its lessons
        { id: "courses", heading: "Courses", layout: "files", items: courses.map((item, index) => ({ id: `course:${item.name}`, label: item.name, marker: String(index + 1).padStart(2, "0"), children: item.rootFiles.map(entry => ({ id: `file:${entry.path}`, label: entry.label })) })) },
        { id: "lessons", heading: "Lessons", layout: "files", items: [
          ...course.lessons.map((item, index) => ({ id: `lesson:${item.id}`, label: item.title, marker: String(index + 1).padStart(2, "0"), children: item.files.map(entry => ({ id: `file:${entry.path}`, label: entry.label })) })),
          { id: "add-lesson", label: "New lesson", icon: PlusSignIcon },
        ] },
      ]}
      onNavigate={id => {
        if (id.startsWith("file:")) return openFile(id.slice(5));
        if (id === "add-lesson") return addLesson();
        if (id.startsWith("lesson:")) { const lesson = course.lessons.find(item => `lesson:${item.id}` === id); if (lesson) return openFile(lesson.senseiPath); }
        const picked = courses.find(item => `course:${item.name}` === id);
        if (picked) return openCourse(picked);
        setView(id as typeof view);
      }} scroller={scroller} details={<LessonDetails course={course} lesson={lesson} />}
      commands={[
        { id: "files", label: "Files", commands: files.map(item => ({ id: `open:${item.path}`, label: item.label, hint: courses.flatMap(entry => entry.lessons).find(entry => entry.files.includes(item))?.title, icon: <Icon icon={File01Icon} size={16} />, keywords: item.path })) },
        { id: "lesson", label: "Lesson", commands: [
          { id: "evaluate", label: "Evaluate lesson", icon: <Icon icon={CheckListIcon} size={16} />, keywords: "trial judges" },
          { id: "trial", label: "Try it as a learner", icon: <Icon icon={PlayIcon} size={16} />, keywords: "trial sensei" },
        ] },
      ]}
      onCommand={(id, query) => {
        if (id.startsWith("open:")) openFile(id.slice(5));
        else if (id === "evaluate") fadeViewTransition(() => setView("Evaluation"));
        else if (id === "trial") fadeViewTransition(() => setView("Trial"));
        else if (id === "ask" && query) setQueue(items => [...items, { id: crypto.randomUUID(), text: query }]);
      }}
      crumbs={chapter ? [{ label: course.name, onClick: () => openCourse(course) }, { label: chapter }] : [{ label: course.name }]}
      editor={page ? (course === courses[0] ? <VideoStage key={video} src={video} title="Intro video" cues={cues} onCue={event => setVideoEvents(events => [...events, event])} /> : null) : <Editor flush
        tabs={<EditorTabs mode="authoring" label="Open files" active={file}
          tabs={editor.tabs.paths.filter(path => courseFiles(course).some(entry => entry.path === path)).map(path => ({ path, label: files.find(item => item.path === path)?.label ?? path, dirty: files.some(item => item.path === path && editor.dirty(item)) }))}
          onSelect={setFile} onClose={editor.close} onMove={editor.move} />}
        status={lesson && file === lesson.templatePath ? <EditorStatus passed={lessonRuns[lesson.id] ?? 0} total={checkNames(lesson).length} /> : undefined}>
        {view === "Evaluation" ? <div className="h-full overflow-auto p-6 text-sm"><h2 className="mb-3 font-semibold">Teaching review</h2><p>This is a layout preview. No models or paid evaluations are called.</p><ul className="mt-4 list-inside list-disc"><li>Clear opening and achievable first step</li><li>Help changes when the learner gets stuck</li><li>No solution revealed</li></ul></div>
          : current ? <CodeEditor code={editor.draft} filePath={file} language={language} lessonApiBase="" documentationUrl={documentationUrl} readOnly={view === "Trial" && !file.endsWith("kata.ts")} coverage={false} onChange={editor.setDraft} onSave={saveFile} />
          : <p className="p-6 text-sm">Open a file from the sidebar.</p>}
      </Editor>}
      header={<span className="ui-as-chat__route ui-as-chat__speaker">
        <span className="ui-as-chat__dot" aria-hidden="true" />
        <b>{view === "Trial" ? "Sensei" : "Kyoshi"}</b>
        <span className="ui-as-chat__speaker-note">{view === "Trial" ? "Teaches this lesson" : "Master of Senseis and course shaper"}</span>
      </span>}
      composer={<>
        {queue.length > 0 && <div className="mb-2 text-sm" aria-label="Queued messages">{waiting ? "Waiting for your choice" : "Queued"}{queue.map(item => <div key={item.id} className="flex items-center justify-between gap-2"><span>{item.text}</span><Button variant="ghost" size="sm" onClick={() => setQueue(items => items.filter(entry => entry.id !== item.id))}>Remove</Button></div>)}</div>}
        <OriginalComposer tray={false} models={composerModels} placeholder={waiting ? "Add a note while the question waits…" : "Shape this lesson with Kyoshi…"} onSend={text => setQueue(items => [...items, { id: crypto.randomUUID(), text }])} />
      </>}>
      <p className="text-sm leading-relaxed">{view === "Trial" ? "Your tracker holds a week of step counts. Before editing, what would you remember after reading 4, then 9, then 2?" : "Let's build a lesson that makes the first step inviting and gives the learner room to work things out. Open a file on the left, or tell me what you'd change."}</p>
      <ToolCalls view={view} />
      {/* What the video tells Kyoshi: each cue as it happens */}
      {videoEvents.map((event, index) => <ToolCallCard key={index} name="video_cue" summary={cueSummary(event)} status="success" args={{ video: "Intro video", cue: event.cue.id, at: Number(event.time.toFixed(1)) }} />)}
      {question && <section aria-label="Authoring question" className="space-y-3 text-sm"><p>Where should we start?</p>{["The opening example", "The test cases"].map(label => <Button key={label} size="sm" variant={choice === label ? "primary" : "secondary"} disabled={Boolean(choice)} onClick={() => setChoice(label)}>{label}</Button>)}</section>}
      <ChatMessages messages={chat.messages} name={view === "Trial" ? "Sensei" : "Kyoshi"} scroller={scroller} onDone={chat.finish} />
    </AgentChatWorkspace>
  </div>;
}
