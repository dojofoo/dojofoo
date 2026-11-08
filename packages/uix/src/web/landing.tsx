import { followLink } from "../lib/link-event";
import { lazy, Suspense, useState } from "react";
import { Icon } from "../components/icon";
import { ButtonLink } from "../components/button";
import { TabOverload } from "../components/tab-overload";
import LogoCloud from "../components/logo-cloud-1";
import { Carousel } from "../components/arc/carousel/carousel";
import { ArrowRight01Icon } from "../lib/icons";
import type { WebCourse } from "./catalog";
import type { ReactNode } from "react";
import { AppPreview } from "./app-preview";
import { CommandCopy, SitePage, useSite } from "./site";
import { SiteQuestions } from "./questions";

/*
 * The landing page: what dojo is, a static capture of the learner app in a window, the agents it works
 * with, its three modes, the one command that starts it, the courses learners install most and the questions people ask. On the page itself –
 * no window around the sections.
 */

/** The command that starts dojo: the lesson workspace in the browser – agents and courses are installed from there */
const START = "npx dojofoo";

const CourseTile = lazy(() => import("./course-tile").then(module => ({ default: module.CourseTile })));

/** The three ways to use a dojo – interview first. */
const modes = [
  { title: "Interview Mode", short: "Interview", beta: "Closed beta", headline: "Make your next interview feel familiar.", text: "Step into a take-home challenge from the company you’re meeting. Pair with an agent, explore how the team works, and get a feel for a day on the job." },
  { title: "Course Mode", short: "Course", beta: undefined, headline: "Learn anything with a tutor next to you", text: "Find your pace with focused katas, interactive lessons, or slides paired with hands-on challenges. Your Sensei tracks how you’re doing and helps you build your skills." },
  { title: "Authoring Mode", short: "Authoring", beta: "Open beta", headline: "Create your own tutor-guided learning or interview", text: "Build a course with Kyoshi, your authoring agent. Shape lessons, exercises, and learning material, then try it as a learner before you share it." },
] as const;

export function LandingPage({ learning, courses, preview, backdrop, artwork = false }: {
  /** Optional live count supplied by a host with real presence data. */
  learning?: number;
  courses: WebCourse[];
  featureCourse?: WebCourse;
  preview: ReactNode;
  backdrop: ReactNode;
  artwork?: boolean;
}) {
  const links = useSite();
  const top = [...courses].sort((a, b) => a.trendingRank - b.trendingRank).slice(0, 4);
  const [mode, setMode] = useState<1 | 2 | 3>(1);
  return (
    <SitePage current="home" window={false} full backdrop={backdrop}>
      {artwork && <style href="ui-web-artwork" precedence="default">{artworkCss}</style>}
      <section className="mx-auto grid max-w-[760px] justify-items-center px-5 pt-[72px] pb-10 text-center">
        {learning !== undefined && <p className="mb-[22px] inline-flex items-center gap-2 rounded-full bg-(--surface-3) py-[5px] pr-3 pl-[9px] text-[length:var(--fs-caption)] font-[550] text-(--muted) shadow-(--shadow-1) [corner-shape:round]"><span className="grid size-3.5 place-items-center rounded-full border-[1.5px] border-[color-mix(in_oklab,var(--live)_45%,transparent)] [--live:var(--ev-pass,#16a34a)] dark:[--live:#4ade80] [corner-shape:round] after:size-1.5 after:rounded-full after:bg-(--live) after:[corner-shape:round]" aria-hidden="true" />{learning === 1 ? "1 person" : `${learning} people`} learning right now</p>}
        <figure className="m-0">
          <h1 className="m-0 text-[clamp(34px,5.2vw,56px)] leading-[1.05] font-[650] tracking-[-0.035em] text-balance">You can only fight the way you practice</h1>
          <figcaption className="mt-3.5 text-[15px] font-[550] tracking-[0.01em] text-(--muted) before:content-['—_']">Miyamoto Musashi</figcaption>
        </figure>
        {/* One sentence per line, breaking between phrases, never inside one */}
        <p className="mt-[18px] max-w-[34rem] text-base leading-[1.6] text-pretty text-(--muted) [&>span]:block [&>span]:text-balance [&>span+span]:mt-2 [&>span>span]:inline-block">
          <span><span>Take any course,</span> <span>rehearse for your next interview,</span> <span>or build a dojo of your own.</span></span>{" "}
          <span>Any dojo you can install, you can master.</span>
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2.5">
          {/* Getting started is the one command: down to it */}
          <ButtonLink href="#ui-land-start" onClick={event => followLink(event, () => {
            const heading = document.getElementById("ui-land-start");
            heading?.closest("section")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
            heading?.focus({ preventScroll: true });
          })}>Start learning</ButtonLink>
          <ButtonLink variant="secondary" href={links.sectionHref("courses")} onNavigate={() => links.navigate("courses")}>Browse dojos</ButtonLink>
        </div>
      </section>

      {/* A course from inside, as learners see it: a lesson in the learner app itself, in a window as wide as the page, cut
          short – its sidebar runs on past the bottom (there's more to it), the composer sits in view – and without its
          Getting started card */}
      <div data-learning-artwork={artwork || undefined} className="mx-auto max-w-[1380px] px-2 max-[1304px]:px-5 min-[1200px]:pt-16"><AppPreview artwork={artwork} ratio={16 / 9} label="Inside a course: a lesson, its kata in the editor and the Sensei beside it">{preview}</AppPreview></div>

      <section className="grid justify-items-center gap-[22px] px-5 pt-14 pb-6" aria-labelledby="ui-land-agents">
        <h2 id="ui-land-agents" className="m-0 text-[length:var(--fs-caption)] font-semibold tracking-[0.05em] text-(--muted) uppercase">Works with</h2>
        <LogoCloud />
      </section>

      <div className="mx-auto max-w-[1280px] px-2 max-[1304px]:px-5">
        <section data-learning-modes="" className="py-16 max-[721px]:py-11 [&+section]:[background:var(--ui-web-rule)_left_top/var(--ui-web-rule-size)_repeat-x] grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-center gap-10 max-[861px]:grid-cols-[minmax(0,1fr)] max-[721px]:gap-0">
          <div className="min-w-0 max-[721px]:relative max-[721px]:z-1">
            <Carousel label="Learning modes" index={mode - 1} onIndexChange={index => setMode((index + 1) as 1 | 2 | 3)}
              slideSize="calc(100cqw - 32px)" slideLabel={index => modes[index].title} autoplay interval={8000} controls="indicators" pauseOnHover={false} edgeFade className="[--space-4:24px] [--space-2:8px] [--space-1:4px] [--control-height-sm:32px] [--border-strong:var(--fluid-hairline)] [--radius-panel:0] [--duration-fast:var(--motion-fast)] [--duration-spring:var(--motion-slow)] [--ease-spring:var(--ease-slow)] max-[721px]:[--space-4:8px]">
              {modes.map(item => <article className="py-1" key={item.title}>
                <p className="mb-[18px] flex flex-wrap items-center gap-2.5 text-sm font-[550] text-(--ink)">{item.title}{item.beta && <span className="rounded-[calc(5px*var(--squircle-factor,1))] bg-(--chip) px-[7px] py-0.5 text-[length:var(--fs-caption)] leading-[1.4] font-medium text-(--muted)">{item.beta}</span>}</p>
                <h2 className="m-0 max-w-[18ch] text-[clamp(32px,3.4vw,44px)] leading-[1.12] font-semibold tracking-[-0.03em] text-balance">{item.headline}</h2>
                <p className="mt-5 max-w-[42ch] text-base leading-[1.65] text-pretty text-(--muted)">{item.text}</p>
              </article>)}
            </Carousel>
          </div>
          <TabOverload className="rounded-[calc(14px*var(--squircle-factor,1))] max-[721px]:-mt-7" titles={[modes[0].short, modes[1].short, modes[2].short]} active={mode} onActiveChange={setMode}
            label={`Three windows, one per mode – ${modes[mode - 1].title} in front`} />
        </section>

        <section className="py-16 max-[721px]:py-11 [&+section]:[background:var(--ui-web-rule)_left_top/var(--ui-web-rule-size)_repeat-x] grid justify-items-center text-center [&_h2]:outline-none [&_.ui-button]:mt-3" aria-labelledby="ui-land-start">
          <p className="m-0 text-[length:var(--fs-caption)] font-semibold tracking-[0.05em] text-(--muted) uppercase">Quickstart</p>
          <h2 id="ui-land-start" tabIndex={-1} className="mt-2 text-[26px] leading-[1.2] font-semibold tracking-[-0.02em]">One command to start</h2>
          <p className="mt-2.5 max-w-[36rem] text-[14.5px] leading-[1.6] text-pretty text-(--muted)">It opens the dojo in your browser.<br />Pick your agent and install your first course from there.</p>
          <CommandCopy command={START} className="mt-6 w-[min(100%,320px)]" />
          <ButtonLink variant="ghost" href="/docs/quickstart" iconRight={<Icon icon={ArrowRight01Icon} size={14} />} onNavigate={() => links.openDoc("/docs/quickstart")}>Read the quickstart</ButtonLink>
        </section>

        <section className="py-16 max-[721px]:py-11 [&+section]:[background:var(--ui-web-rule)_left_top/var(--ui-web-rule-size)_repeat-x]">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="m-0 text-[length:var(--fs-caption)] font-semibold tracking-[0.05em] text-(--muted) uppercase">Most installed right now</p>
              <h2 className="mt-2 text-[26px] leading-[1.2] font-semibold tracking-[-0.02em]">Top courses</h2>
            </div>
            <ButtonLink variant="secondary" size="sm" href={links.sectionHref("courses")} onNavigate={() => links.navigate("courses")}>All courses</ButtonLink>
          </div>
          {top.length > 0 ? <div className="mt-7 grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-x-4 gap-y-5">
            <Suspense>{top.map((course) => <CourseTile key={course.id} course={course} href={links.courseHref(course)} onOpen={links.openCourse} shader />)}</Suspense>
          </div> : <p className="mt-2.5 max-w-[36rem] text-[14.5px] leading-[1.6] text-pretty text-(--muted) max-[721px]:m-0 max-[721px]:max-w-none max-[721px]:pt-10 max-[721px]:pb-4 max-[721px]:text-center">No courses are available yet.</p>}
        </section>

        <SiteQuestions className="py-16 max-[721px]:py-11 [&+section]:[background:var(--ui-web-rule)_left_top/var(--ui-web-rule-size)_repeat-x]" intro="What people ask about Dojo.foo, answered from its docs." />
      </div>
    </SitePage>
  );
}

const artworkCss = /* css */ `
/* Match the main-to-composer gap: its 12px inset plus the 1px pane divider. */
[data-learning-artwork] .ui-as-app { --frame-gap: 13px; }
/* Room between the hero and the window on wide screens (after the rule above, which resets the padding) */
[data-learning-artwork] :is(.ui-as-guide-slot, .ui-as-side__head) { display: none; }
[data-learning-artwork] .ui-web-app:not([data-phone]) :is(.ui-as-side-open, .ui-as-chat__tools, .ui-as-chat__close) { display: none; }
/* On a phone the app is live in its narrow layout: its buttons open and close the sidebar and the Sensei (not settings) */
[data-learning-artwork] .ui-web-app[data-phone] .ui-as-chat__tools > :not(.ui-as-chat__narrow) { display: none; }
/* Taps too reach only those (PREVIEW_CONTROLS): the editor, composer and sidebar rows stay still */
[data-learning-artwork] .ui-web-app[data-phone] .ui-web-app__scale { pointer-events: none; }
[data-learning-artwork] .ui-web-app[data-phone] :is(.ui-as-side-open, .ui-as-chat__narrow, .ui-as-chat__close, .ui-as-scrim, .ui-as-aside-scrim) { pointer-events: auto; }
[data-learning-artwork] .ui-as-side__nav { overflow: hidden; margin-top: var(--frame-gap); }
[data-learning-artwork] .ui-as-side__before { margin-top: 0; }

`;
