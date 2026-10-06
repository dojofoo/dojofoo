import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, CheckCircle as CheckCircle2, XCircle } from "@mynaui/icons-react";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "@dojofoo/ui/button";
import { BrandLogo } from "@dojofoo/ui/brand-logo";
import { SiteNavigation } from "@dojofoo/ui/site-navigation";
import type { InteractiveSnapshot } from "@/server/interactive/service";
import { CourseContent } from "@/components/course-content";

export const Route = createFileRoute("/interactive")({ component: InteractiveCourse });

function InteractiveCourse() {
  const [lesson, setLesson] = useState<InteractiveSnapshot | null>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [workspaceId, setWorkspaceId] = useState("");

  useEffect(() => {
    setWorkspaceId(window.localStorage.getItem("dojofoo.workspace") ?? "");
    void request("", undefined);
  }, []);

  async function request(path: string, init?: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const workspaceId = window.localStorage.getItem("dojofoo.workspace") ?? "";
      const response = await fetch(`/api/interactive${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", ...(workspaceId ? { "x-dojofoo-workspace": workspaceId } : {}) },
      });
      const body = await response.json() as InteractiveSnapshot | { error: string };
      if (!response.ok || "error" in body) throw new Error("error" in body ? body.error : `Request failed (${response.status})`);
      setLesson(body);
      setAnswer("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!answer.trim()) return;
    void request("/answer", { method: "POST", body: JSON.stringify({ answer }) });
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNavigation
        brand={<Link aria-label="Dojofoo courses" className="flex items-center" to="/"><BrandLogo /></Link>}
        actions={<Link className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground" to="/"><ArrowLeft size={15} /> Courses</Link>}
      />
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl md:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="border-b border-dashed border-border bg-surface-1 p-6 md:border-b-0 md:border-r">
          <p className="font-display text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Interactive course</p>
          <h1 className="mt-3 text-xl font-semibold">{lesson?.lessonTitle ?? "Loading…"}</h1>
          {lesson && <p className="mt-5 text-sm text-muted-foreground">Step {Math.min(lesson.step + 1, lesson.totalSteps)} of {lesson.totalSteps}</p>}
          {lesson && <div className="mt-3 h-1 bg-border"><div className="h-full bg-primary transition-[width]" style={{ width: `${lesson.complete ? 100 : (lesson.step / lesson.totalSteps) * 100}%` }} /></div>}
        </aside>
        <div className="flex min-w-0 items-start justify-center px-5 py-12 lg:px-12">
          <article className="w-full max-w-2xl border border-border bg-surface-1 p-6 sm:p-9">
            {busy && !lesson && <p className="text-sm text-muted-foreground">Loading your lesson…</p>}
            {error && <p className="border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-300">{error}</p>}
            {lesson?.complete && (
              <div>
                <CheckCircle2 className="text-primary" size={28} />
                <h2 className="mt-5 text-2xl font-semibold">Lesson complete</h2>
                <p className="mt-3 font-prose text-muted-foreground">Your progress was saved. You can return to the course index or revisit this lesson later.</p>
              </div>
            )}
            {lesson?.current?.type === "present" && (
              <div>
                <p className="font-display text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Present</p>
                <h2 className="mt-4 text-2xl font-semibold">{lesson.current.title}</h2>
                <div className="mt-5"><CourseContent basePath={lesson.current.contentBase} workspaceId={workspaceId}>{lesson.current.content}</CourseContent></div>
                <Button className="mt-8" disabled={busy} onClick={() => void request("/advance", { method: "POST" })}>Continue <ArrowRight size={16} /></Button>
              </div>
            )}
            {lesson?.current?.type === "question" && (
              <div>
                <p className="font-display text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Question</p>
                <h2 className="mt-4 text-2xl font-semibold">{lesson.current.title}</h2>
                <div className="mt-5"><CourseContent basePath={lesson.current.promptBase} workspaceId={workspaceId}>{lesson.current.prompt}</CourseContent></div>
                {lesson.response ? (
                  <div className="mt-7">
                    <div className={`flex items-center gap-2 border p-4 text-sm ${lesson.response.correct ? "border-emerald-800 text-emerald-300" : "border-amber-800 text-amber-200"}`}>
                      {lesson.response.correct ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                      {lesson.response.correct ? "Correct" : "Not quite"}: {lesson.response.answer}
                    </div>
                    <div className="mt-5"><CourseContent basePath={lesson.current.explanationBase} workspaceId={workspaceId}>{lesson.current.explanation}</CourseContent></div>
                    <Button className="mt-8" disabled={busy} onClick={() => void request("/advance", { method: "POST" })}>Continue <ArrowRight size={16} /></Button>
                  </div>
                ) : (
                  <form className="mt-7" onSubmit={submit}>
                    <label className="font-display text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground" htmlFor="interactive-answer">Your answer</label>
                    <input autoComplete="off" className="mt-2 w-full border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary" id="interactive-answer" onChange={(event) => setAnswer(event.target.value)} value={answer} />
                    <Button className="mt-4" disabled={busy || !answer.trim()} type="submit">Check answer</Button>
                  </form>
                )}
              </div>
            )}
          </article>
        </div>
      </section>
    </main>
  );
}
