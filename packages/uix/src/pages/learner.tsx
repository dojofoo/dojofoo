import { fadeViewTransition } from "~/lib/view-transition";
import { SettingsContent } from "~/components/settings-billing";
import { SlideDeck } from "~/components/slide-deck";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { prepareEditor } from "~/lib/preload-editor";
import { AgentChatWorkspace } from "~/containers/agent-chat";
import { AgentSetup, setupSteps } from "~/containers/agent-setup";
import { AppDirectory, categoryIcons, type App, type AppCategory } from "~/components/app-directory";
import { AppShell, EmptyState, Icon, useToast, type AppShellProps, type ShellEntry, type ShellSection } from "~/components/app-shell";
import { ChatMessages, Composer, useChatThread } from "~/containers/assistant-home";
import { Button } from "~/components/button";
import { AddCard, CardFigure, CardMark, CardText, CardTitle, ColorCard, ColorCardButton, ColorCardTag } from "~/components/color-card";
import { CertificateCard, CourseArt, CourseCard, type CourseArtwork, type CourseInfo } from "~/components/course-card";
import { ChangelogFeed, type ChangelogEntry, type ChangelogMonth } from "~/components/arc/blocks/changelog-feed/changelog-feed";
import { EditorTestResults } from "~/components/editor-test-results";
import { CodeEditor, Editor, EditorStatus, EditorTabs } from "~/containers/editor";
import { LessonBrief } from "~/components/lesson-brief";
import type { SetupGroup } from "~/components/setup-guide";
import { TestimonialHighlight, type Testimonial } from "~/components/testimonial-highlight";
import { VideoStage } from "~/containers/video-stage";
import { BackIcon, BookOpen01Icon, CertificateIcon, ClaudeIcon, CommentsIcon, CoursesIcon, DoneIcon, ExploreIcon, LearnersIcon, LikesIcon, PlusSignIcon } from "~/lib/icons";
import { BrandLogo } from "~/components/brand-logo";
import samAltmanPhoto from "../../../../apps/web/public/sam-altman.jpg?url";

/*
 * The learner's journey, to explore how the sidebar changes along it:
 *
 * - Fresh: setting up the agent on this machine, in the affectUI onboarding's card and wizard – Agent, Courses, Profile,
 *   Style, Workspace – with a few lines on the right about each step. The sidebar has Documentation and Getting started,
 *   which follows the steps; no account yet.
 * - Dashboard: Courses (the ones you study, then the ones you write) and Explore (one featured course), then
 *   a Collection – Certificates. Getting started now waits at the foot,
 *   above the account.
 * - In a course: the course as a square card that turns over for its details – your version (or Update, once a newer
 *   one is out) and how far you are on its front – then its Chapters and the open chapter's
 *   Lessons – done, in progress or locked. The window is the learner's workspace, as in the Authoring story's Trial: a
 *   chapter opens on its video, a lesson in the editor, and the Sensei teaches in the chat. Dashboard, in the
 *   breadcrumbs, closes the course.
 *
 * Moving between them uses the shared page fade. `start` jumps to a
 * state; from there everything is clickable.
 */
export type LearnerStart = "Fresh" | "Dashboard" | "Explore" | "Intro" | "Kata" | "Slides" | "Certificates" | "Settings";

/* ---------- Data ---------- */

type Progress = "done" | "active" | "locked";
type Lesson = { id: string; title: string; state: Progress; lead: string; goal: string; fn: string };
type Chapter = { id: string; title: string; state: Progress; blurb: string; lessons: Lesson[] };
type Course = CourseInfo & { id: string; /** A newer version than the one installed */ latest?: string; blurb: string; rating: number; reviews?: number; likes?: string; learners: string; chapterList: Chapter[] };

const lesson = (id: string, title: string, state: Progress, fn: string, lead: string, goal = `Write ${fn}() so the tests pass – without reaching for a library.`): Lesson => ({ id, title, state, fn, lead, goal });
const course = (info: Omit<Course, "chapters" | "lessons"> & { chapters?: number; lessons?: number }): Course => ({
  ...info,
  chapters: info.chapterList.length || info.chapters || 5,
  lessons: info.chapterList.reduce((n, item) => n + item.lessons.length, 0) || info.lessons || 18,
});

const library: Course[] = [
  course({
    id: "everyday", shader: "topography", likes: "3.2k", reviews: 1284, title: "Everyday TypeScript", repo: "dojofoo/everyday-typescript", author: "Dojo.foo", version: "v1.4.0", latest: "v1.5.0", updated: "12 Oct 2026", language: "TypeScript", hours: 6, rating: 4.9, learners: "12.4k",
    art: { hue: 350, glyph: "TS" }, blurb: "Arrays, objects and the types that keep them honest – one small program at a time.",
    chapterList: [
      { id: "arrays", title: "Arrays", state: "done", blurb: "Walk a list, keep what matters, fold it into one value.", lessons: [
        lesson("largest", "Largest number", "done", "max", "Walk a list once and decide what “largest” means for an empty one."),
        lesson("positive", "Positive numbers", "done", "positive", "Keep what passes a test, and leave the list you were given alone."),
        lesson("total", "Running total", "done", "total", "Fold a list into one number, one step at a time."),
      ] },
      { id: "objects", title: "Objects", state: "active", blurb: "Read, combine and compare objects without surprises.", lessons: [
        lesson("pick", "Pick a key", "done", "pick", "Read a property that might not be there."),
        lesson("merge", "Merge settings", "active", "merge", "Combine defaults with what the user chose – without one clobbering the other.", "Write merge(defaults, overrides) so nested settings combine and nothing is mutated."),
        lesson("equal", "Deep equal", "locked", "equal", "Tell two objects apart by what they hold, not where they live."),
        lesson("group", "Group by", "locked", "groupBy", "Sort a list into buckets by a key."),
      ] },
      { id: "narrowing", title: "Narrowing", state: "locked", blurb: "Let the compiler know what your checks already know.", lessons: [
        lesson("unions", "Discriminated unions", "locked", "area", "Let a tag tell you which shape you have."),
        lesson("never", "Exhaustive switch", "locked", "describe", "Make the compiler tell you when a case is missing."),
        lesson("guards", "Type guards", "locked", "isUser", "Teach TypeScript what your checks already know."),
      ] },
      { id: "generics", title: "Generics", state: "locked", blurb: "Functions that work for any type and keep it.", lessons: [
        lesson("identity", "Identity", "locked", "identity", "A function that works for any type and keeps it."),
        lesson("constraints", "Constraints", "locked", "longest", "Ask for just enough of a type."),
      ] },
    ],
  }),
  course({
    id: "advanced", shader: "waves", title: "Advanced TypeScript", repo: "dojofoo/advanced-typescript", author: "Dojo.foo", version: "v0.9.2", updated: "30 Sep 2026", language: "TypeScript", hours: 9, rating: 4.6, learners: "3.1k",
    art: { hue: 255, glyph: "ATS" }, blurb: "Types that compute: mapped, conditional and template literal types.",
    chapterList: [
      { id: "shapes", title: "Narrowing shapes", state: "active", blurb: "Unions you can trust in every branch.", lessons: [
        lesson("tag", "Narrow by tag", "active", "area", "Compute an area for every shape a union allows."),
        lesson("assert", "Assert never", "locked", "assertNever", "Turn a forgotten case into a compile error."),
      ] },
      { id: "mapped", title: "Mapped types", state: "locked", blurb: "Types made from other types.", lessons: [lesson("readonly", "Deep readonly", "locked", "freeze", "Freeze a type all the way down.")] },
      { id: "conditional", title: "Conditional types", state: "locked", blurb: "Types that ask questions.", lessons: [lesson("unwrap", "Unwrap a promise", "locked", "unwrap", "Ask a type what it holds.")] },
    ],
  }),
  course({ id: "async", shader: "network", likes: "2.4k", reviews: 962, title: "Async JavaScript", repo: "dojofoo/async-javascript", author: "Dojo.foo", version: "v2.0.1", updated: "8 Oct 2026", language: "JavaScript", hours: 5, rating: 4.8, learners: "9.8k", chapters: 5, lessons: 21, art: { hue: 190, glyph: "JS" }, blurb: "Promises, async and await, and cancelling what you started.", chapterList: [] }),
  course({ id: "vitest", shader: "waves", likes: "1.1k", reviews: 541, title: "Testing with Vitest", repo: "vitest-dev/learn-vitest", author: "Vitest", version: "v1.2.0", updated: "2 Oct 2026", language: "TypeScript", hours: 4, rating: 4.7, learners: "6.2k", chapters: 4, lessons: 16, art: { hue: 145, glyph: "VT" }, blurb: "Tests that tell you what broke and why.", chapterList: [] }),
  course({ id: "regex", shader: "network", title: "Regex Katas", repo: "katacommunity/regex", author: "Community", version: "v3.1.0", updated: "21 Aug 2026", language: "JavaScript", hours: 3, rating: 4.4, learners: "2.7k", chapters: 6, lessons: 24, art: { hue: 235, glyph: "RX" }, blurb: "Patterns from simple matches to lookarounds.", chapterList: [] }),
  course({ id: "rust", shader: "topography", title: "Rust for TypeScript devs", repo: "ferris-school/rust-for-ts", author: "Community", version: "v0.6.0", updated: "14 Sep 2026", language: "Rust", hours: 12, rating: 4.5, learners: "4.0k", chapters: 7, lessons: 30, art: { hue: 35, glyph: "RS" }, blurb: "Ownership and borrowing, from what you already know.", chapterList: [] }),
  course({ id: "sql", shader: "network", title: "SQL Foundations", repo: "dojofoo/sql-foundations", author: "Dojo.foo", version: "v1.0.3", updated: "1 Oct 2026", language: "SQL", hours: 5, rating: 4.3, learners: "5.5k", chapters: 5, lessons: 20, art: { hue: 295, glyph: "SQL" }, blurb: "Select, join and group – queries you can read later.", chapterList: [] }),
];
const byId = (id: string) => library.find((item) => item.id === id)!;

/** Explore's categories: the best rated, everything, then by topic */
const topics: Record<string, string[]> = { everyday: ["typescript"], advanced: ["typescript"], async: ["javascript"], vitest: ["testing", "typescript"], regex: ["javascript"], rust: ["systems"], sql: ["data"] };
const courseCategories: AppCategory[] = [
  { id: "essentials", label: "Top rated", icon: categoryIcons.essentials },
  { id: "all", label: "All courses", icon: categoryIcons.all },
  { id: "typescript", label: "TypeScript", icon: categoryIcons.development },
  { id: "javascript", label: "JavaScript", icon: categoryIcons.automation },
  { id: "testing", label: "Testing", icon: categoryIcons.product },
  { id: "systems", label: "Systems", icon: categoryIcons.design },
  { id: "data", label: "Data", icon: categoryIcons.storage },
];

/** What learners say about the top courses – the marked phrase is drawn over with the highlighter */
const voices: Record<string, Testimonial[]> = {
  everyday: [
    { quote: "I'd tried three TypeScript courses before and quit each one by week two. Here every lesson is a small program I actually finish, and when I get stuck the Sensei asks me what I expected instead of handing me the fix.", highlight: "a small program I actually finish", name: "Hannah Osei", role: "Career changer" },
    { quote: "Every lesson is one small program, and the Sensei never just gives me the answer – it asks the question I should have asked myself.", highlight: "never just gives me the answer", name: "Priya Natarajan", role: "Frontend developer" },
    { quote: "I finally understand why my reduce calls kept breaking on empty arrays. The tests catch exactly the case you forget.", highlight: "catch exactly the case you forget", name: "Jonas Weber", role: "Bootcamp graduate" },
    { quote: "Twenty minutes a day before work, and the chapters actually stuck. I use the object patterns at my job every week.", highlight: "actually stuck", name: "Lena Hoffmann", role: "Data analyst" },
  ],
  async: [
    { quote: "Cancellation was the chapter I didn't know I needed. My fetch code is half the size and actually stops when it should.", highlight: "actually stops when it should", name: "Mei Tanaka", role: "Full-stack engineer" },
    { quote: "Seeing the event loop step through my own code made promises click in an afternoon.", highlight: "click in an afternoon", name: "Diego Alvarez", role: "Student" },
    { quote: "The race-condition katas were humbling. Now I write the timeout before I write the fetch.", highlight: "write the timeout before", name: "Noah Kim", role: "Mobile developer" },
  ],
  vitest: [
    { quote: "Writing the failing test first felt slow for a day, then everything else got faster.", highlight: "everything else got faster", name: "Amara Okafor", role: "Backend developer" },
    { quote: "The katas on mocking are the clearest explanation of test doubles I have read.", highlight: "the clearest explanation", name: "Liam Chen", role: "QA engineer" },
    { quote: "Snapshot tests used to be noise for me. The course showed when they help and when to delete them.", highlight: "when to delete them", name: "Zara Ahmed", role: "Frontend lead" },
  ],
};

const certificates = [
  // SHA-256 of demo issuer/learner/course records, not issued credentials.
  { id: "js-foundations", title: "JavaScript Foundations", learner: "Sam Rivera", art: { hue: 35, glyph: "JS" }, issued: "12 Sep 2026", lessons: 24, score: 96, digest: "d1d0ac5f87007c80c7a0d1773773b4ac9361c8aba3c175473f46bff44da78f8d" },
  { id: "ts-arrays", title: "Everyday TypeScript · Arrays", learner: "Sam Rivera", art: library[0].art, issued: "3 Oct 2026", lessons: 3, score: 100, digest: "8aabeef599580a6a9cb47c2b59b7b722db0194054c0f297fc824944b738c0026" },
];
const authored = [
  { id: "everyday", status: "Published", learners: "128 learners", edited: "Edited 2 days ago" },
  { id: "advanced", status: "Draft", learners: "Not published", edited: "Edited today" },
];
const lessonsOf = (item: Course) => item.chapterList.flatMap((chapter) => chapter.lessons);
const progressOf = (item: Course) => (lessonsOf(item).length ? Math.round((lessonsOf(item).filter((x) => x.state === "done").length / lessonsOf(item).length) * 100) : 0);
/** Where a course opens: the chapter in progress, else the last that isn't locked */
const currentChapter = (item: Course) => item.chapterList.find((chapter) => chapter.state === "active") ?? [...item.chapterList].reverse().find((chapter) => chapter.state !== "locked") ?? item.chapterList[0];
/** Where a chapter opens: the lesson in progress, else the last done, else the first */
const currentLesson = (chapter: Chapter) => chapter.lessons.find((x) => x.state === "active") ?? [...chapter.lessons].reverse().find((x) => x.state === "done") ?? chapter.lessons[0];
const pad = (n: number) => String(n).padStart(2, "0");
/** A course's color, for the cards drawn from one */
const colorOf = (item: { art: CourseArtwork }) => `oklch(0.58 0.2 ${item.art.hue})`;
/** Our own courses carry our logo, at the author name's size; others their author's name */
const markOf = (item: Course) => (item.author === "Dojo.foo" ? <BrandLogo /> : undefined);
const lockNote = (items: Array<{ title: string; state: Progress }>, index: number, what: string) =>
  items[index].state === "locked" && index > 0 ? `Finish “${items[index - 1].title}” to unlock this ${what}` : undefined;

/* ---------- The journey ---------- */

type View = "courses" | "explore" | "certificates" | "changelog" | "settings";

export function LearnerPage({ start, slideSource = "/slides/index.html?embedded=true", documentationUrl, settings = false }: { start: LearnerStart; slideSource?: string; documentationUrl?: string; settings?: boolean }) {
  // The cards' classes are used here without a card component (the rectangles), so their styles load with the story
  return <div style={{ height: "100dvh" }}><Journey key={`${start}:${settings}`} start={start} slideSource={slideSource} documentationUrl={documentationUrl} settings={settings} /></div>;
}

function Journey({ start, slideSource, documentationUrl, settings }: { start: LearnerStart; slideSource: string; documentationUrl?: string; settings: boolean }) {
  const [setupStep, setSetupStep] = useState(0);
  const [setupDone, setSetupDone] = useState<number[]>([]);
  const [onboarded, setOnboarded] = useState(start !== "Fresh");
  const [installed, setInstalled] = useState<string[]>(start === "Fresh" ? [] : ["everyday", "advanced"]);
  const [view, setView] = useState<View>(start === "Settings" ? "settings" : start === "Explore" ? "explore" : start === "Certificates" ? "certificates" : "courses");
  const [courseId, setCourseId] = useState<string | null>(["Intro", "Kata", "Slides"].includes(start) ? "everyday" : null);
  const [toast, showToast] = useToast();

  // One list from the first run on: setting Dojo up (the wizard's steps, ticked as they're done), then learning, then
  // sharing what you know
  const setup: SetupGroup[] = [
    { id: "setup", title: "Set up Dojo", tasks: setupSteps.map((item, index) => ({ id: item.id, label: item.title, done: onboarded || setupDone.includes(index) })) },
    { id: "learn", title: "Set up learning", tasks: [
      { id: "install", label: "Install a course", done: installed.length > 0 },
      { id: "lesson", label: "Finish your first lesson", done: onboarded },
      { id: "certificate", label: "Earn a certificate" },
    ] },
    { id: "share", title: "Share what you know", tasks: [{ id: "author", label: "Author a course" }, { id: "publish", label: "Publish it to GitHub" }] },
  ];
  const shell: Partial<AppShellProps> = {
    workspace: "Dojo",
    user: { name: "Sam Rivera", email: "sam.rivera@example.com" },
    brand: <a href="#" aria-label="Dojo dashboard" className="flex items-center" onClick={(event) => event.preventDefault()}><BrandLogo className="w-11" /></a>,
    sidebarWidth: "18rem",
    showNews: false,
    setup,
    showUser: onboarded,
    // While Dojo is set up, Getting started stays open and follows the steps
    setupPinned: !onboarded,
  };

  if (courseId) return <CourseWorkspace key={courseId} settings={settings} shell={shell} item={byId(courseId)} documentationUrl={documentationUrl} initialView={start === "Intro" ? "intro" : start === "Slides" ? "slides" : "kata"} slideSource={slideSource} onClose={() => fadeViewTransition(() => { setCourseId(null); setView("courses"); })} />;

  // Fresh: the only menu point is Documentation; Getting started follows the steps
  if (!onboarded) {
    const navigation: ShellSection[] = [{ id: "main", items: [{ id: "docs", label: "Documentation", icon: BookOpen01Icon }] }];
    const next = () => fadeViewTransition(() => { setSetupDone((list) => [...new Set([...list, setupStep])]); setSetupStep((n) => Math.min(n + 1, setupSteps.length - 1)); });
    return (
      <AppShell {...shell} navigation={navigation} navigationKey="setup" active={[]} onNavigate={() => {}}>
        <AgentSetup step={setupStep} done={setupDone}
          // The top courses, as their cards
          courses={[...library].sort((a, b) => b.rating - a.rating).slice(0, 4).map((item) => ({ id: item.id, title: item.title, color: colorOf(item), shader: item.shader, mark: markOf(item), author: item.author, rating: item.rating, lessons: item.lessons, hours: item.hours }))} onNext={next} onBack={() => fadeViewTransition(() => setSetupStep((n) => Math.max(n - 1, 0)))} onSkip={() => fadeViewTransition(() => setSetupStep((n) => Math.min(n + 1, setupSteps.length - 1)))}
          onFinish={(values) => fadeViewTransition(() => { setSetupDone(setupSteps.map((_, index) => index)); setInstalled(values.courses); setOnboarded(true); setView("courses"); })} />
      </AppShell>
    );
  }

  const navigation: ShellSection[] = [
    { id: "main", items: [
      { id: "courses", label: "Courses", icon: CoursesIcon, count: installed.length || undefined },
      { id: "explore", label: "Explore", icon: ExploreIcon },
    ] },
    { id: "collection", heading: "Collection", items: [
      { id: "certificates", label: "Certificates", icon: CertificateIcon, count: certificates.length },
    ] },
  ];
  return (
    <AppShell {...shell} navigation={navigation} navigationKey="dashboard" active={[view]} onNavigate={(id) => setView(id as View)}>
      {view === "explore" ? <Explore installed={installed} onInstall={(id) => { setInstalled((list) => [...list, id]); showToast(`${byId(id).title} is in your courses`); }} />
        : view === "certificates" ? <Certificates />
        : view === "changelog" ? <Changelog />
        : view === "settings" ? <SettingsContent workspace="Dojo" onClose={() => fadeViewTransition(() => setView("courses"))} />
        : <Courses installed={installed} onOpen={id => fadeViewTransition(() => setCourseId(id))} onAuthor={(id) => {
          const url = new URL("/", window.location.href);
          url.search = new URLSearchParams({ path: "/story/pages-dojo--course-authoring", args: `initialCourse:${byId(id).title}` }).toString();
          (window.parent ?? window).location.assign(url);
        }} onExplore={() => fadeViewTransition(() => setView("explore"))} />}
      {toast}
    </AppShell>
  );
}

/* ---------- In a course: the learner's workspace ---------- */

const sampleVideo = "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_5MB.mp4";
const kataFiles = (item: Lesson) => ({
  "kata.ts": `/** ${item.lead} */\nexport function ${item.fn}(input: unknown) {\n  // Your first step goes here.\n  return undefined;\n}\n`,
  "kata.test.ts": `import { expect, it } from "vitest";\nimport { ${item.fn} } from "./kata";\n\nit("handles the simplest case", () => {\n  expect(${item.fn}([])).toBeUndefined();\n});\n`,
});

/** Landing-only sample, following https://sebastianraschka.com/llms-from-scratch/. */
export function LearningPreview() {
  const item = course({
    id: "llm", title: "Build your own LLM", author: "Sebastian Raschka", repo: "rasbt/LLMs-from-scratch",
    version: "v1.0.0", updated: "", language: "Python", hours: 12, rating: 4.9, learners: "",
    art: { hue: 350, glyph: "LLM" }, shader: "topography", blurb: "Build a language model one small step at a time.",
    chapterList: [
      { id: "basics", title: "How LLMs work", state: "done", blurb: "Learn how predicting the next token creates text.", lessons: [lesson("next", "Predict the next token", "done", "predict", "Follow a tiny next-token prediction.")] },
      { id: "tokens", title: "Text & tokens", state: "active", blurb: "Turn text into numbers a model can learn from.", lessons: [
        lesson("split", "Split some text", "done", "split", "Break a sentence into a small list of words."),
        lesson("encode", "Give words an ID", "active", "encode", "Turn each word into a number. The same word always gets the same ID.", "Complete encode(text, vocab) with the supplied vocabulary. Try “the cat the” and check that it becomes [0, 1, 0]."),
        lesson("windows", "Make training pairs", "locked", "pairs", "Slide a small window across tokens to make inputs and targets."),
        lesson("embed", "Look up embeddings", "locked", "embed", "Give each token a small vector of numbers."),
      ] },
      { id: "attention", title: "Paying attention", state: "locked", blurb: "Let tokens gather useful context from one another.", lessons: [lesson("scores", "Score two tokens", "locked", "score", "Use a dot product to measure a connection."), lesson("mask", "Hide future tokens", "locked", "mask", "Keep the next word a surprise with a causal mask.")] },
      { id: "gpt", title: "Build a tiny GPT", state: "locked", blurb: "Connect attention and feed-forward layers into a model.", lessons: [lesson("block", "A transformer block", "locked", "block", "Trace a small batch through one transformer block.")] },
      { id: "training", title: "Train & generate", state: "locked", blurb: "Measure a prediction, improve it, and generate a sentence.", lessons: [lesson("loss", "Measure the loss", "locked", "loss", "Compare predicted tokens with the next tokens."), lesson("generate", "One token at a time", "locked", "generate", "Extend a prompt with the model’s next prediction.")] },
      { id: "classification", title: "Fine-tune a classifier", state: "locked", blurb: "Adapt a pretrained model to recognize a label.", lessons: [lesson("classify", "Spot a spam message", "locked", "classify", "Turn a model’s output into a simple class prediction.")] },
      { id: "instructions", title: "Follow instructions", state: "locked", blurb: "Prepare examples that teach a model how to respond.", lessons: [lesson("format", "Format a conversation", "locked", "format", "Arrange an instruction and its answer into a training example.")] },
    ],
  });
  return <CourseWorkspace preview item={item} initialView="kata" settings={false} slideSource="/slides/index.html?embedded=true" onClose={() => {}}
    shell={{ workspace: "Dojo", user: { name: "Sam Altman", avatar: samAltmanPhoto }, sidebarWidth: "18rem", showNews: false, setup: [], showUser: true }} />;
}

const previewCode = `vocab = {"the": 0, "cat": 1, "sat": 2}

def encode(text, vocab):
    """Turn words into their vocabulary IDs."""
    tokens = text.split()
    # Look up each token in vocab.
    return []

# Try: encode("the cat the", vocab)
# Expected: [0, 1, 0]
`;

function CourseWorkspace({ shell, item, onClose, initialView, slideSource, documentationUrl, settings, preview = false }: { settings: boolean; shell: Partial<AppShellProps>; item: Course; onClose: () => void; initialView: "intro" | "kata" | "slides"; slideSource: string; documentationUrl?: string; preview?: boolean }) {
  useEffect(() => { if (initialView !== "slides") prepareEditor(); }, [initialView]);
  const [chapterId, setChapterId] = useState(currentChapter(item).id);
  const chapter = item.chapterList.find((x) => x.id === chapterId)!;
  // A chapter opens on its video; a lesson in the editor
  const [lessonId, setLessonId] = useState<string | null>(initialView === "intro" ? null : currentLesson(chapter).id);
  const open = lessonId ? chapter.lessons.find((x) => x.id === lessonId) ?? null : null;
  const [file, setFile] = useState<"kata.ts" | "kata.test.ts">("kata.ts");
  const [resultsOpen, setResultsOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const scroller = useRef<HTMLDivElement>(null);
  // A newer version is out: the card's Update brings it in
  const [version, setVersion] = useState(item.version);
  const [updating, setUpdating] = useState(false);
  const update = () => { setUpdating(true); window.setTimeout(() => { setUpdating(false); setVersion(item.latest ?? item.version); }, 900); };
  const at = currentChapter(item);
  const chat = useChatThread(() => ({ steps: [{ kind: "step", label: "Reading the lesson and your code" }], paragraphs: ["Before you change anything: what should happen when the settings you're given leave a value out?", "Write that down as a guess – then we'll check it against the first test."] }));

  const navigation: ShellSection[] = [
    {
      id: "chapters", heading: "Chapters", layout: "chapters",
      // Inset to the logo's and the rows' text line on the left, the same on the right
      before: <div className="lj-course"><CourseCard course={item} mark={markOf(item)} badge={preview ? "Kata" : undefined} enrolled={{ version, latest: item.latest, updating, onUpdate: update, progress: progressOf(item), label: at && `${pad(item.chapterList.indexOf(at) + 1)} · ${at.title}`, value: at && currentLesson(at)?.title }} /></div>,
      items: item.chapterList.map((x, index): ShellEntry => ({ id: `chapter:${x.id}`, label: x.title, marker: pad(index + 1), state: x.state, note: lockNote(item.chapterList, index, "chapter") })),
    },
    {
      id: "lessons", heading: "Lessons", layout: "lessons",
      items: chapter.lessons.map((x, index): ShellEntry => ({ id: `lesson:${x.id}`, label: x.title, marker: pad(index + 1), state: x.state, note: lockNote(chapter.lessons, index, "lesson") })),
    },
  ];
  const path = open ? `src/${chapter.id}/${open.id}/${preview ? "kata.py" : file}` : "";
  const code = open ? drafts[path] ?? (preview ? previewCode : kataFiles(open)[file]) : "";

  return (
    <AgentChatWorkspace {...shell} defaultSettingsOpen={settings} contentKind={initialView === "slides" ? "slides" : open ? "code" : "video"} navigation={navigation} navigationKey={item.id}
      // The open chapter keeps its box whatever the window shows; its lesson lights while it is the one open
      active={[`chapter:${chapter.id}`, ...(open ? [`lesson:${open.id}`] : [])]}
      onNavigate={(id) => {
        if (id.startsWith("chapter:")) { setChapterId(id.slice(8)); setLessonId(null); }
        else if (id.startsWith("lesson:")) { setLessonId(id.slice(7)); setFile("kata.ts"); setResultsOpen(false); }
      }}
      crumbs={[
        { label: "Dashboard", icon: <Icon icon={BackIcon} size={14} />, onClick: onClose },
        open ? { label: chapter.title, onClick: () => fadeViewTransition(() => setLessonId(null)) } : { label: chapter.title },
        ...(open ? [{ label: open.title }] : []),
      ]}
      editor={initialView === "slides" ? <SlideDeck src={slideSource} title={`${chapter.title} · Slidev`} /> : open ? (
        <Editor flush
          tabs={<EditorTabs mode="learning" label="Lesson files" active={resultsOpen ? "results" : file}
            tabs={[...(preview ? ["kata.ts"] as const : ["kata.ts", "kata.test.ts"] as const).map((name) => ({ path: name, label: preview ? "kata.py" : name, dirty: drafts[`src/${chapter.id}/${open.id}/${name}`] !== undefined })), { path: "results", label: "Test results" }]}
            onSelect={(name) => { setResultsOpen(name === "results"); if (name !== "results") setFile(name as typeof file); }} />}
          status={!resultsOpen ? <EditorStatus passed={open.state === "done" ? 3 : 1} total={3} /> : undefined}>
          <div hidden={resultsOpen} className="h-full">
            <CodeEditor code={code} filePath={path} language={preview ? "python" : "typescript"} lessonApiBase="" documentationUrl={documentationUrl} readOnly={file !== "kata.ts"} coverage={false} onChange={(next) => setDrafts((all) => ({ ...all, [path]: next }))} />
          </div>
          {resultsOpen && <EditorTestResults tests={[
            { suite: open.title, name: "handles the simplest case", status: "passed", durationMs: 1 },
            { suite: open.title, name: "handles a typical input", status: open.state === "done" ? "passed" : "failed", durationMs: 3,
              message: "Sample output from the last check." },
            { suite: open.title, name: "handles edge cases", status: open.state === "done" ? "passed" : "failed", durationMs: 2 },
          ]} />}
        </Editor>
      ) : <VideoStage key={chapter.id} src={sampleVideo} title={`${chapter.title} – intro`} onNext={() => {
        const next = item.chapterList.slice(item.chapterList.indexOf(chapter) + 1).find(candidate => candidate.state !== "locked");
        if (next) fadeViewTransition(() => { setChapterId(next.id); setLessonId(null); });
      }} />}
      details={open ? (
        <LessonBrief title={open.title} lead={open.lead}><h3>Goal</h3><p>{open.goal}</p></LessonBrief>
      ) : (
        <LessonBrief title={chapter.title} lead={chapter.blurb}>
          <h3>Lessons</h3>
          <ol>{chapter.lessons.map((x) => <li key={x.id}>{x.title}</li>)}</ol>
        </LessonBrief>
      )}
      header={<span className="ui-as-chat__route ui-as-chat__speaker"><span className="ui-as-chat__dot" aria-hidden="true" /><b>Sensei</b><span className="ui-as-chat__speaker-note">Teaches this lesson</span></span>}
      composer={<Composer tray={false} placeholder="Ask your Sensei…" busy={chat.busy} onSend={chat.send}
        agent={preview ? { name: "Claude", icon: ClaudeIcon } : undefined}
        models={preview ? [{ name: "Opus 5.5", effort: "medium", description: "Claude Opus 5.5 · medium effort", icon: ClaudeIcon }] : undefined} />}
      scroller={scroller}>
      {preview ? <>
        <p className="ui-as-msg-user" aria-label="Learner">How do I turn words into numbers?</p>
        <div className="ui-as-msg" aria-label="Sensei"><p className="ui-as-msg__p">Start with a tiny vocabulary: give each word an ID. “the cat” could become [0, 1].</p></div>
        <p className="ui-as-msg-user" aria-label="Learner">What if a word appears twice?</p>
        <div className="ui-as-msg" aria-label="Sensei"><p className="ui-as-msg__p">Reuse its ID. Try “the cat the” → [0, 1, 0], then check your encode function.</p></div>
      </> : <p className="text-sm leading-relaxed">{open ? `${open.title}: ${open.lead} Tell me what you expect the first test to check.` : `${chapter.title} starts with a short video – watch it, then open the first lesson.`}</p>}
      <ChatMessages messages={chat.messages} name="Sensei" scroller={scroller} onDone={chat.finish} />
    </AgentChatWorkspace>
  );
}

/* ---------- Dashboard windows ---------- */

/** A window's page, set like the onboarding: a kicker, a large title and a lead line, in a centered column with room
    around it */
function Page({ kicker, title, sub, children }: { kicker: string; title: string; sub: string; children: ReactNode }) {
  return (
    <div className="lj-page">
      <header className="lj-page__head">
        <span className="ui-ob-kicker">{kicker}</span>
        <h1 className="ui-ob-title">{title}</h1>
        <p className="ui-ob-sub">{sub}</p>
      </header>
      {children}
    </div>
  );
}

/** Something as affectUI shows a file: its artwork in a box (a status inside it), the name and a line below */
function Tile({ title, art, meta, inside, onClick }: { title: string; art: CourseArtwork; meta: ReactNode; inside?: ReactNode; onClick?: () => void }) {
  const box = <span className="lj-box"><CourseArt art={art} size={76} />{inside}</span>;
  const text = <><b className="lj-tile__name">{title}</b><span className="lj-tile__meta">{meta}</span></>;
  return onClick ? <button type="button" className="lj-tile" onClick={onClick}>{box}{text}</button> : <article className="lj-tile">{box}{text}</article>;
}

/** Courses: the ones you study – where you are in each – and below them the ones you write */
function Courses({ installed, onOpen, onAuthor, onExplore }: { installed: string[]; onOpen: (id: string) => void; onAuthor: (id: string) => void; onExplore: () => void }) {
  const mine = library.filter((item) => installed.includes(item.id));
  return (
    <Page kicker="Courses" title="Your courses" sub="The ones you're learning, with how far you are – and the ones you're writing with Kyoshi.">
      <section>
        <h2 className="lj-section">Studying</h2>
        {mine.length === 0 ? <EmptyState title="No courses yet" text="Install one from Explore to start learning." action={<Button onClick={onExplore}>Explore courses</Button>} /> : (
          <div className="lj-grid lj-grid--cards">
            {mine.map((item) => {
              const pct = progressOf(item);
              const at = currentChapter(item);
              const next = at ? currentLesson(at) : undefined;
              return <ColorCard key={item.id} color={colorOf(item)}
                header={<CardMark>{markOf(item) ?? item.author}</CardMark>} main={<CardTitle>{item.title}</CardTitle>}
                footer={<><CardText label={at ? `${pad(item.chapterList.indexOf(at) + 1)} · ${at.title}` : `${item.chapters} chapters`} value={pct && next ? next.title : "Not started"} /><CardFigure>{pct}%</CardFigure></>}
                progress={pct} onPointerEnter={prepareEditor} onFocus={prepareEditor} onClick={() => onOpen(item.id)} aria-label={`${item.title}, ${pct}% done`} />;
            })}
            {/* One more, dashed – it finds a course to add */}
            <AddCard icon={<Icon icon={PlusSignIcon} size={18} />} title="Add a course" label="Find one in Explore" onClick={onExplore} />
          </div>
        )}
      </section>
      <section className="lj-courses__next">
        <h2 className="lj-section">Authoring</h2>
        <div className="lj-grid lj-grid--cards">
          {authored.map((entry) => {
            const item = byId(entry.id);
            return <ColorCard key={entry.id} color={colorOf(item)}
              header={<><CardMark>{markOf(item) ?? item.author}</CardMark><CardFigure>{entry.status}</CardFigure></>} main={<CardTitle>{item.title}</CardTitle>}
              footer={<CardText label={entry.learners} value={entry.edited} />} aria-label={`Open ${item.title}`} onPointerEnter={prepareEditor} onFocus={prepareEditor} onClick={() => onAuthor(item.id)} />;
          })}
          <AddCard icon={<Icon icon={PlusSignIcon} size={18} />} title="New course" label="Start from a template" />
        </div>
      </section>
    </Page>
  );
}

function Stars({ value }: { value: number }) {
  return <span className="lj-stars" role="img" aria-label={`Rated ${value} out of 5`}><i style={{ "--rating": value } as CSSProperties} /></span>;
}

function Explore({ installed, onInstall }: { installed: string[]; onInstall: (id: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const install = (id: string) => { setBusy(id); window.setTimeout(() => { setBusy(null); onInstall(id); }, 700); };
  const top = [...library].sort((a, b) => b.rating - a.rating).slice(0, 1);
  const action = (item: Course) => {
    const has = installed.includes(item.id);
    // Installed reads as the cards say it – a check and the word – at the Install button's height
    return has
      ? <span className="lj-installed rounded-lg"><Icon icon={DoneIcon} size={13} />Installed</span>
      : <Button size="sm" loading={busy === item.id} onClick={() => install(item.id)}>Install</Button>;
  };
  return (
    <Page kicker="Explore" title="Find your next course" sub="Courses from Dojo and the community. Install one and it joins your courses, ready to start.">
      <h2 className="ui-ob-step__title lj-heading">Featuring</h2>
      <ol className="lj-top" aria-label="Featuring">
        {top.map((item) => (
          <li key={item.id} className="lj-top__item">
            <CourseCard course={item} mark={markOf(item)} showVersion />
            {/* The quote sits beside the card – its mark and the numbers share the top line, its speaker sits
                on the card's bottom line, the rating after the quote's own controls */}
            <div className="lj-top__side">
              <div className="lj-top__line">
                <span className="lj-top__counts">
                  <span title="Likes"><Icon icon={LikesIcon} size={14} />{item.likes}<span className="sr-only"> likes</span></span>
                  <span title="Comments"><Icon icon={CommentsIcon} size={14} />{(item.reviews ?? 0).toLocaleString("en")}<span className="sr-only"> comments</span></span>
                  <span title="Learners"><Icon icon={LearnersIcon} size={14} />{item.learners}<span className="sr-only"> learners</span></span>
                </span>
                <span className="lj-top__rating"><Stars value={item.rating} /><b>{item.rating.toFixed(1)}</b></span>
              </div>
              <TestimonialHighlight className="lj-top__voice w-full rounded-none bg-transparent p-0 shadow-none sm:p-0" testimonials={voices[item.id] ?? voices.everyday}
                controlsEnd={action(item)} />
            </div>
          </li>
        ))}
      </ol>
      {/* Every course: the app directory's search, filter and categories, our course cards in its grid */}
      <div className="lj-browse">
        <h2 className="ui-ob-step__title">Browse courses</h2>
        <p className="ui-ob-step__text">Search by name or topic, show only what you haven't installed, or pick a category on the left.</p>
      </div>
      <AppDirectory className="lj-directory" title="All courses" defaultCategory="all" categories={courseCategories}
        labels={{ bar: "Courses", connectedCount: (n) => `${n} installed`, search: "Search courses", all: "All courses", connected: "Installed", available: "Not installed", empty: "No courses match." }}
        apps={library.map((item): App => ({ id: item.id, name: item.title, vendor: item.author, description: `${item.blurb} ${item.repo} ${item.language}`, categories: topics[item.id] ?? [], logo: <CourseArt art={item.art} size={24} />, essential: item.rating >= 4.7, connected: installed.includes(item.id) }))}
        onToggle={(app, on) => on && onInstall(app.id)}
        renderApps={(apps, state) => (
          <div className="lj-grid lj-grid--cards">
            {apps.map((app) => {
              const item = byId(app.id);
              const busy = state.busy.has(app.id);
              // Still: only the featured card above moves
              return <ColorCard key={app.id} color={colorOf(item)} aria-label={item.title}
                header={<><CardMark>{markOf(item) ?? item.author}</CardMark><CardFigure>★ {item.rating.toFixed(1)}</CardFigure></>} main={<CardTitle>{item.title}</CardTitle>}
                footer={<><CardText label="Updated" value={item.updated} />{state.connected.has(app.id)
                  ? <ColorCardTag><Icon icon={DoneIcon} size={13} />Installed</ColorCardTag>
                  : <ColorCardButton disabled={busy} aria-label={`Install ${item.title}`} onClick={() => state.toggle(app)}>{busy ? "Installing…" : "Install"}</ColorCardButton>}</>} />;
            })}
          </div>
        )} />
    </Page>
  );
}

/** What changed in Dojo lately – from the account menu's Changelog */
const releases: ChangelogEntry[] = [
  { id: "learner", month: "2026-10", date: "Oct 14", iso: "2026-10-14", version: "0.9.0", kind: "new", title: "Courses and Explore", summary: "The courses you study and the ones you write on one page, and every course to install.", details: ["Explore ranks the top courses and lets you search and filter the rest.", "Courses shows the chapter and lesson you're on.", "A course's card offers the update when a newer version is out."] },
  { id: "setup", month: "2026-10", date: "Oct 9", iso: "2026-10-09", version: "0.8.2", kind: "improved", title: "Set up with the agent you already use", summary: "Dojo finds Claude Code, Codex and others on your machine and teaches through them.", details: ["Pick your theme and code colors while you set up, with a live preview."] },
  { id: "cues", month: "2026-09", date: "Sep 30", iso: "2026-09-30", version: "0.8.0", kind: "new", title: "Video cues tell your Sensei what you watched", summary: "Markers, skipped ranges and a watched point before the end reach the chat as they happen.", details: ["Authors set cues per lesson; sponsor segments can be skipped."] },
  { id: "tabs", month: "2026-09", date: "Sep 22", iso: "2026-09-22", version: "0.7.4", kind: "fixed", title: "Editor tabs keep their unsaved dot", summary: "An edited file shows a dot where its close button sits, and the button on hover.", details: ["The dot uses your theme's brand color."] },
];
const releaseMonths: ChangelogMonth[] = [
  { key: "2026-10", label: "October 2026", short: "Oct" },
  { key: "2026-09", label: "September 2026", short: "Sep" },
];

/** The changelog as every page is set: its kicker, title and lead, then the feed (its own heading left out) */
function Changelog() {
  return (
    <Page kicker="What's new" title="Changelog" sub="Dojo 0.9 shipped on October 14, 2026.">
      <ChangelogFeed heading={false} entries={releases} months={releaseMonths} title="Changelog" endNote="That's everything since Dojo 0.7 in September." />
    </Page>
  );
}

function Certificates() {
  return (
    <Page kicker="Collection" title="Certificates" sub="What you finished – turn a card over for its details.">
      <div className="lj-squares">
        {certificates.map((item) => <CertificateCard key={item.id} certificate={item} />)}
      </div>
    </Page>
  );
}
