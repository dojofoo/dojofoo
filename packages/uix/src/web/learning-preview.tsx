import { useRef } from "react";
import { AgentChatWorkspace } from "../containers/agent-chat";
import { ChatStyles, Composer } from "../containers/assistant-home";
import { Icon, type ShellSection } from "../components/app-shell";
import { CourseCard, type CourseInfo } from "../components/course-card";
import { CodeEditor, Editor, EditorStatus, EditorTabs } from "../containers/editor";
import { LessonBrief } from "../components/lesson-brief";
import { BackIcon, ClaudeIcon } from "../lib/icons";
import samAltmanPhoto from "../assets/sam-altman.jpg?url";

type Progress = "done" | "active" | "locked";
type Lesson = { id: string; title: string; state: Progress; lead: string; goal: string };
type Chapter = { id: string; title: string; state: Progress; blurb: string; lessons: Lesson[] };
const lesson = (id: string, title: string, state: Progress, fn: string, lead: string, goal = `Write ${fn}() so the tests pass – without reaching for a library.`): Lesson => ({ id, title, state, lead, goal });

// An immutable marketing illustration, following Raschka's LLMs from Scratch.
// These sample people, model names and course state are never runtime defaults.
const metadata = {
    id: "llm", title: "Build your own LLM", author: "Sebastian Raschka", repo: "rasbt/LLMs-from-scratch",
    version: "v1.0.0", updated: "", language: "Python", hours: 12, rating: 4.9, learners: "",
    art: { hue: 350, glyph: "LLM" }, shader: "topography" as const, blurb: "Build a language model one small step at a time.",

};
const chapters: Chapter[] = [
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
    ];
const lessons = chapters.flatMap(chapter => chapter.lessons);
const course: CourseInfo = { ...metadata, chapters: chapters.length, lessons: lessons.length };
const chapter = chapters[1];
const selected = chapter.lessons[1];
const progress = Math.round(lessons.filter(lesson => lesson.state === "done").length / lessons.length * 100);
const code = `vocab = {"the": 0, "cat": 1, "sat": 2}

def encode(text, vocab):
    """Turn words into their vocabulary IDs."""
    tokens = text.split()
    # Look up each token in vocab.
    return []

# Try: encode("the cat the", vocab)
# Expected: [0, 1, 0]
`;

/** The approved landing illustration, composed from the real UIX presentation. */
export function LearningPreview() {
  const scroller = useRef<HTMLDivElement>(null);
  const navigation: ShellSection[] = [
    { id: "chapters", heading: "Chapters", layout: "chapters",
      before: <div className="lj-course"><CourseCard course={course} badge="Kata" enrolled={{ version: course.version, progress, label: `02 · ${chapter.title}`, value: selected.title }} /></div>,
      items: chapters.map((item, index) => ({ id: `chapter:${item.id}`, label: item.title, marker: String(index + 1).padStart(2, "0"), state: item.state })),
    },
    { id: "lessons", heading: "Lessons", layout: "lessons",
      items: chapter.lessons.map((item, index) => ({ id: `lesson:${item.id}`, label: item.title, marker: String(index + 1).padStart(2, "0"), state: item.state })),
    },
  ];
  return <div className="h-full" inert data-learning-illustration="">
    <ChatStyles />
    <AgentChatWorkspace workspace="Dojo" user={{ name: "Sam Altman", avatar: samAltmanPhoto }} sidebarWidth="18rem" showNews={false} setup={[]} showUser
      contentKind="code" navigation={navigation} navigationKey="llm" active={[`chapter:${chapter.id}`, `lesson:${selected.id}`]}
      crumbs={[{ label: "Dashboard", icon: <Icon icon={BackIcon} size={14} /> }, { label: chapter.title }, { label: selected.title }]}
      editor={<Editor flush
        tabs={<EditorTabs mode="learning" label="Lesson files" active="kata.ts" tabs={[{ path: "kata.ts", label: "kata.py" }, { path: "results", label: "Test results" }]} onSelect={() => {}} />}
        status={<EditorStatus passed={1} total={3} />}>
        <div className="h-full"><CodeEditor code={code} filePath="src/tokens/encode/kata.py" language="python" lessonApiBase="" readOnly coverage={false} onChange={() => {}} /></div>
      </Editor>}
      details={<LessonBrief title={selected.title} lead={selected.lead}><h3>Goal</h3><p>{selected.goal}</p></LessonBrief>}
      header={<span className="ui-as-chat__route ui-as-chat__speaker"><span className="ui-as-chat__dot" aria-hidden="true" /><b>Sensei</b><span className="ui-as-chat__speaker-note">Teaches this lesson</span></span>}
      composer={<Composer tray={false} placeholder="Ask your Sensei…" busy={false} onSend={() => {}} agent={{ name: "Claude", icon: ClaudeIcon }} models={[{ name: "Opus 5.5", effort: "medium", description: "Claude Opus 5.5 · medium effort", icon: ClaudeIcon }]} />}
      scroller={scroller}>
      <p className="ui-as-msg-user" aria-label="Learner">How do I turn words into numbers?</p>
      <div className="ui-as-msg" aria-label="Sensei"><p className="ui-as-msg__p">Start with a tiny vocabulary: give each word an ID. “the cat” could become [0, 1].</p></div>
      <p className="ui-as-msg-user" aria-label="Learner">What if a word appears twice?</p>
      <div className="ui-as-msg" aria-label="Sensei"><p className="ui-as-msg__p">Reuse its ID. Try “the cat the” → [0, 1, 0], then check your encode function.</p></div>
    </AgentChatWorkspace>
  </div>;
}
