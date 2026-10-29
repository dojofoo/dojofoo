import { followLink } from "../lib/link-event";
import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ArrowCallout } from "../components/arrow-callout";
import { Icon } from "../components/app-shell";
import { ButtonLink } from "../components/button";
import { TabOverload } from "../components/tab-overload";
import LogoCloud from "../components/logo-cloud-1";
import { Carousel } from "../components/arc/carousel/carousel";
import { ArrowRight01Icon } from "../lib/icons";
import type { WebCourse } from "./catalog";
import type { ReactNode } from "react";
import { AppPreview, CourseTile } from "./course-tile";
import { CommandCopy, SitePage, useSite } from "./site";
import { TopographyBackdrop } from "./topography-backdrop";

/*
 * The landing page: what dojo is, a lesson inside the app (the learner pages, live, in a window), the agents it works
 * with, its three modes, the one command that starts it and the courses learners install most. On the page itself –
 * no window around the sections.
 */

/** The command that starts dojo: the lesson workspace in the browser – agents and courses are installed from there */
const START = "npx dojofoo ui";

/** The three ways to use a dojo – interview first. */
const modes = [
  { title: "Interview Mode", short: "Interview", beta: "Closed beta", headline: "Make your next interview feel familiar.", text: "Step into a take-home challenge from the company you’re meeting. Pair with an agent, explore how the team works, and get a feel for a day on the job." },
  { title: "Course Mode", short: "Course", beta: undefined, headline: "Learn anything with a tutor next to you", text: "Find your pace with focused katas, interactive lessons, or slides paired with hands-on challenges. Your Sensei tracks how you’re doing and helps you build your skills." },
  { title: "Authoring Mode", short: "Authoring", beta: "Open beta", headline: "Create your own tutor-guided learning or interview", text: "Build a course with Kyoshi, your authoring agent. Shape lessons, exercises, and learning material, then try it as a learner before you share it." },
] as const;

export function LandingPage({ learning, courses, preview }: {
  /** Optional live count supplied by a host with real presence data. */
  learning?: number;
  courses: WebCourse[];
  featureCourse?: WebCourse;
  preview: ReactNode;
}) {
  const links = useSite();
  const top = [...courses].sort((a, b) => a.trendingRank - b.trendingRank).slice(0, 4);
  const [mode, setMode] = useState<1 | 2 | 3>(1);
  const app = useRef<HTMLDivElement>(null);
  const card = useInside(app, ".lj-course");
  const speaker = useInside(app, ".ui-as-chat__speaker");
  return (
    <SitePage current="home" window={false} full backdrop={<TopographyBackdrop />}>
      <style href="ui-web-landing" precedence="default">{css}</style>
      <section className="ui-land-hero">
        {learning !== undefined && <p className="ui-land-hero__live"><span className="ui-land-live" aria-hidden="true" />{learning === 1 ? "1 person" : `${learning} people`} learning right now</p>}
        <figure className="ui-land-hero__quote">
          <h1 className="ui-land-hero__title">You can only fight the way you practice</h1>
          <figcaption className="ui-land-hero__cite">Miyamoto Musashi</figcaption>
        </figure>
        {/* One sentence per line, each balanced, so neither starts at the end of the other's line; the second breaks between its phrases */}
        <p className="ui-land-hero__lead">
          <span>Deliberate practice, with a sensei at your side who can mentor you through every challenge.</span>{" "}
          <span><span>Every course brings its own sensei</span> <span>and its own way of teaching:</span> <span>take any course,</span> <span>rehearse for your next interview,</span> <span>or turn what you know into a dojo anyone can install.</span></span>
        </p>
        <div className="ui-land-hero__actions">
          {/* Getting started is the one command: down to it */}
          <ButtonLink href="#ui-land-start" onClick={event => followLink(event, () => {
            const heading = document.getElementById("ui-land-start");
            heading?.closest("section")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
            heading?.focus({ preventScroll: true });
          })}>Start learning</ButtonLink>
          <ButtonLink variant="secondary" href={links.sectionHref("courses")} onClick={event => followLink(event, () => links.navigate("courses"))}>Browse courses</ButtonLink>
        </div>
      </section>

      {/* A course from inside, as learners see it: a lesson in the learner app itself, in a window as wide as the page, cut
          short – its sidebar runs on past the bottom (there's more to it), the composer sits in view – and without its
          Getting started card */}
      <div className="ui-land-app" ref={app}>
        {/* What the window shows, called out instead of explained: notes above it, their arrows drawn into the app */}
        <ArrowCallout target={card} flip className="ui-land-note ui-land-note--card">Install any course</ArrowCallout>
        <ArrowCallout target={speaker} flip className="ui-land-note ui-land-note--sensei">Every course has its own sensei,<br />mentoring you through each kata</ArrowCallout>
        <AppPreview ratio={16 / 9} label="Inside a course: a lesson, its kata in the editor and the Sensei beside it">{preview}</AppPreview>
      </div>

      <section className="ui-land-agents" aria-labelledby="ui-land-agents">
        <h2 id="ui-land-agents" className="ui-land-eyebrow">Works with</h2>
        <LogoCloud />
      </section>

      <div className="ui-land-body">
        <section className="ui-land-section ui-land-modes">
          <div className="ui-land-modes__copy">
            <Carousel label="Learning modes" index={mode - 1} onIndexChange={index => setMode((index + 1) as 1 | 2 | 3)}
              slideSize="calc(100cqw - 32px)" slideLabel={index => modes[index].title} autoplay interval={8000} controls="indicators" pauseOnHover={false} edgeFade className="ui-land-modes__carousel">
              {modes.map(item => <article className="ui-land-modes__slide" key={item.title}>
                <p className="ui-land-modes__name">{item.title}{item.beta && <span className="ui-land-modes__beta">{item.beta}</span>}</p>
                <h2 className="ui-land-modes__headline">{item.headline}</h2>
                <p className="ui-land-modes__description">{item.text}</p>
              </article>)}
            </Carousel>
          </div>
          <TabOverload className="ui-land-modes__art" titles={[modes[0].short, modes[1].short, modes[2].short]} active={mode} onActiveChange={setMode}
            label={`Three windows, one per mode – ${modes[mode - 1].title} in front`} />
        </section>

        <section className="ui-land-section ui-land-start" aria-labelledby="ui-land-start">
          <p className="ui-land-eyebrow">Quickstart</p>
          <h2 id="ui-land-start" tabIndex={-1} className="ui-land-h2">One command to start</h2>
          <p className="ui-land-lead">It opens the dojo in your browser.<br />Pick your agent and install your first course from there.</p>
          <CommandCopy command={START} className="ui-land-start__cmd" />
          <ButtonLink variant="ghost" href="/docs/quickstart" iconRight={<Icon icon={ArrowRight01Icon} size={14} />} onClick={event => followLink(event, () => links.openDoc("/docs/quickstart"))}>Read the quickstart</ButtonLink>
        </section>

        <section className="ui-land-section">
          <div className="ui-land-row">
            <div>
              <p className="ui-land-eyebrow">Most installed right now</p>
              <h2 className="ui-land-h2">Top courses</h2>
            </div>
            <ButtonLink variant="secondary" size="sm" href={links.sectionHref("courses")} onClick={event => followLink(event, () => links.navigate("courses"))}>All courses</ButtonLink>
          </div>
          {top.length > 0 ? <div className="ui-land-courses">
            {top.map((course) => <CourseTile key={course.id} course={course} href={links.courseHref(course)} onOpen={links.openCourse} shader />)}
          </div> : <p className="ui-land-lead">No courses are available yet.</p>}
        </section>
      </div>
    </SitePage>
  );
}

/** An element inside the host's preview, for a callout to point at. The preview is the host's and fills in after the
    first render, so it's found by class once it's there; a new ref then has the callout lay its arrow out. */
function useInside(root: RefObject<HTMLElement | null>, selector: string): RefObject<HTMLElement | null> {
  const [element, setElement] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const container = root.current;
    if (!container) return;
    const find = () => {
      const match = container.querySelector<HTMLElement>(selector);
      if (match) { setElement(match); observer.disconnect(); }
    };
    const observer = new MutationObserver(find);
    observer.observe(container, { childList: true, subtree: true });
    find();
    return () => observer.disconnect();
  }, [root, selector]);
  return useMemo(() => ({ current: element }), [element]);
}

const css = /* css */ `
/* Hero: on the page, centered, the live count as a pill above the title */
.ui-land-hero { display: grid; justify-items: center; max-width: 760px; margin: 0 auto; padding: 72px 20px 40px; text-align: center; }
/* Round shapes stay round (the global squircle is for corners, not circles and pills) */
.ui-land-hero__live { display: inline-flex; align-items: center; gap: 8px; margin: 0 0 22px; padding: 5px 12px 5px 9px; border-radius: 999px; corner-shape: round; background: var(--surface-3); box-shadow: var(--shadow-1); color: var(--muted); font-size: var(--fs-caption); font-weight: 550; }
/* Live: a green dot in a circle, the onboarding's "Installed" green (agent-setup) */
.ui-land-live { --live: var(--ev-pass, #16a34a); display: grid; place-items: center; width: 14px; height: 14px; border: 1.5px solid color-mix(in oklab, var(--live) 45%, transparent); border-radius: 50%; corner-shape: round; }
:where(.dark, [data-theme="dark"]) .ui-land-live { --live: #4ade80; }
.ui-land-live::after { width: 6px; height: 6px; border-radius: 50%; corner-shape: round; background: var(--live); content: ""; }
.ui-land-hero__title { margin: 0; font-size: clamp(34px, 5.2vw, 56px); line-height: 1.05; font-weight: 650; letter-spacing: -0.035em; text-wrap: balance; }
.ui-land-hero__quote { margin: 0; }
.ui-land-hero__cite { margin-top: 14px; color: var(--muted); font-size: 15px; font-weight: 550; letter-spacing: 0.01em; }
.ui-land-hero__cite::before { content: "— "; }
.ui-land-hero__lead { max-width: 34rem; margin: 18px 0 0; color: var(--muted); font-size: 16px; line-height: 1.6; text-wrap: pretty; }
.ui-land-hero__lead > span { display: block; text-wrap: balance; }
.ui-land-hero__lead > span + span { margin-top: 8px; }
/* A phrase wraps as a unit, so lines break after its comma, never inside "your next interview" */
.ui-land-hero__lead > span > span { display: inline-block; }
.ui-land-hero__actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 28px; }

/* The lesson in a window slightly wider than the page's content; no Getting started card in it (the
   composer shows). Pared down to the lesson: no logo, search or sidebar toggle above the course card, no settings or
   close on the chat, and its sidebar cut off by the window's edge rather than scrolling */
.ui-land-app, .ui-land-body { max-width: 1280px; margin: 0 auto; padding: 0 8px; }
.ui-land-app { max-width: 1380px; }
/* The notes sit in a band above the window; where the window is too small to point into, they go */
.ui-land-app { position: relative; }
.ui-land-note { display: none; }
@media (min-width: 1100px) {
  .ui-land-app { padding-top: 64px; }
  .ui-land-note { display: inline-block; position: absolute; top: 4px; z-index: 1; }
  .ui-land-note--card { left: 40px; }
  .ui-land-note--sensei { right: 40px; top: -14px; text-align: right; }
  /* The note on a slanted brand plate, like the logo's FOO: white type on a marker stroke leaning with the italics */
  .ui-land-note > span:first-child { position: relative; isolation: isolate; padding: 3px 10px; color: #fff; }
  .ui-land-note > span:first-child::before { content: ""; position: absolute; inset: 0; z-index: -1; background: var(--brand); transform: skewX(-14deg); border-radius: 2px; }
}
/* Match the main-to-composer gap: its 12px inset plus the 1px pane divider. */
.ui-land-app .ui-as-app { --frame-gap: 13px; }
@media (max-width: 1303px) { .ui-land-app, .ui-land-body { padding: 0 20px; } }
.ui-land-app :is(.ui-as-guide-slot, .ui-as-side__head, .ui-as-side-open, .ui-as-chat__tools, .ui-as-chat__close) { display: none; }
.ui-land-app .ui-as-side__nav { overflow: hidden; margin-top: var(--frame-gap); }
.ui-land-app .ui-as-side__before { margin-top: 0; }

/* The agents: the logo cloud, its groups taking turns */
.ui-land-agents { display: grid; justify-items: center; gap: 22px; padding: 56px 20px 24px; }

/* The sections, on the page, dotted rules between them */
.ui-land-section { padding: 64px 0; }
.ui-land-section + .ui-land-section { background: var(--ui-web-rule) left top / var(--ui-web-rule-size) repeat-x; }
@media (max-width: 720px) { .ui-land-section { padding: 44px 0; } }
.ui-land-eyebrow { margin: 0; color: var(--muted); font-size: var(--fs-caption); font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
.ui-land-h2 { margin: 8px 0 0; font-size: 26px; line-height: 1.2; font-weight: 600; letter-spacing: -0.02em; }
.ui-land-lead { max-width: 36rem; margin: 10px 0 0; color: var(--muted); font-size: 14.5px; line-height: 1.6; text-wrap: pretty; }
.ui-land-row { display: flex; align-items: end; justify-content: space-between; gap: 16px; }

/* A mode's headline and story rotate with its highlighted window. */
.ui-land-modes { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 40px; align-items: center; }
@media (max-width: 860px) { .ui-land-modes { grid-template-columns: minmax(0, 1fr); } }
.ui-land-modes__copy { min-width: 0; }
.ui-land-modes__carousel { --space-4: 24px; --space-2: 8px; --space-1: 4px; --control-height-sm: 32px; --border-strong: var(--fluid-hairline); --radius-panel: 0; --duration-fast: var(--motion-fast); --duration-spring: var(--motion-slow); --ease-spring: var(--ease-slow); }
.ui-land-modes__slide { padding-block: 4px; }
.ui-land-modes__name { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 0 0 18px; color: var(--ink); font-size: 14px; font-weight: 550; }
.ui-land-modes__headline { max-width: 18ch; margin: 0; font-size: clamp(32px, 3.4vw, 44px); line-height: 1.12; font-weight: 600; letter-spacing: -0.03em; text-wrap: balance; }
.ui-land-modes__description { max-width: 42ch; margin: 20px 0 0; color: var(--muted); font-size: 16px; line-height: 1.65; text-wrap: pretty; }
.ui-land-modes__beta { padding: 2px 7px; border-radius: calc(5px * var(--squircle-factor, 1)); background: var(--chip); color: var(--muted); font-size: var(--fs-caption); font-weight: 500; line-height: 1.4; }
.ui-land-modes__art { border-radius: calc(14px * var(--squircle-factor, 1)); }

/* Quickstart: one command, centered */
.ui-land-start { display: grid; justify-items: center; text-align: center; }
.ui-land-start .ui-land-h2 { outline: none; }
.ui-land-start__cmd { width: min(100%, 320px); margin-top: 24px; }
.ui-land-start .ui-button { margin-top: 12px; }

.ui-land-courses { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr)); gap: 20px 16px; margin-top: 28px; }
`;
