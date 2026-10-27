import type { CSSProperties, ReactNode } from "react";
import { AppDirectory, type App, type AppCategory } from "../components/app-directory";
import { Icon } from "../components/app-shell";
import { Button } from "../components/button";
import { CardFigure, CardMark, CardText, CardTitle, ColorCard, ColorCardButton, ColorCardTag } from "../components/color-card";
import { CourseArt, CourseCard, type CourseInfo } from "../components/course-card";
import { TestimonialHighlight, type Testimonial } from "../components/testimonial-highlight";
import { CommentsIcon, DoneIcon, LearnersIcon, LikesIcon } from "../lib/icons";

export type ExploreCourse = Pick<CourseInfo, "title" | "art"> & Partial<Omit<CourseInfo, "title" | "art">> & {
  id: string;
  blurb: string;
  categories?: string[];
  mark?: ReactNode;
  likes?: string;
  reviews?: number;
  learners?: string;
  testimonials?: Testimonial[];
};

/** The current Pages Explore presentation. Catalog contents and course actions belong to the host. */
export function CourseExplore({ courses, categories = [], installed = [], busy, onInstall, onOpen, featuredId,
  description = "Courses from Dojo and the community. Install one and it joins your courses, ready to start.",
}: {
  courses: ExploreCourse[];
  categories?: AppCategory[];
  installed?: readonly string[];
  busy?: string | null;
  onInstall?: (id: string) => void;
  onOpen?: (id: string) => void;
  featuredId?: string;
  description?: string;
}) {
  const top = featuredId ? courses.filter(item => item.id === featuredId) : [...courses].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 1);
  const open = (id: string) => (onOpen ?? onInstall)?.(id);
  const action = (item: ExploreCourse) => installed.includes(item.id) && !onOpen
    ? <span className="lj-installed rounded-lg"><Icon icon={DoneIcon} size={13} />Installed</span>
    : <Button size="sm" loading={busy === item.id} disabled={!onOpen && !onInstall} onClick={() => open(item.id)}>{onOpen ? "Open course" : "Install"}</Button>;
  return <div className="lj-page">
    <header className="lj-page__head">
      <span className="ui-ob-kicker">Explore</span>
      <h1 className="ui-ob-title">Find your next course</h1>
      <p className="ui-ob-sub">{description}</p>
    </header>
    <h2 className="ui-ob-step__title lj-heading">Featuring</h2>
    <ol className="lj-top" aria-label="Featuring">
      {top.map(item => <li key={item.id} className="lj-top__item">
        <CourseCard course={item} mark={item.mark} showVersion />
        <div className="lj-top__side">
          {(item.likes !== undefined || item.reviews !== undefined || item.learners !== undefined || item.rating !== undefined) && <div className="lj-top__line">
            <span className="lj-top__counts">
              {item.likes !== undefined && <span title="Likes"><Icon icon={LikesIcon} size={14} />{item.likes}<span className="sr-only"> likes</span></span>}
              {item.reviews !== undefined && <span title="Comments"><Icon icon={CommentsIcon} size={14} />{item.reviews.toLocaleString("en")}<span className="sr-only"> comments</span></span>}
              {item.learners !== undefined && <span title="Learners"><Icon icon={LearnersIcon} size={14} />{item.learners}<span className="sr-only"> learners</span></span>}
            </span>
            {item.rating !== undefined && <span className="lj-top__rating"><Stars value={item.rating} /><b>{item.rating.toFixed(1)}</b></span>}
          </div>}
          {item.testimonials?.length ? <TestimonialHighlight className="lj-top__voice w-full rounded-none bg-transparent p-0 shadow-none sm:p-0" testimonials={item.testimonials} controlsEnd={action(item)} />
            : <div className="lj-top__voice flex h-full flex-col items-start justify-between gap-6 py-4"><p className="text-lg leading-relaxed">{item.blurb}</p>{action(item)}</div>}
        </div>
      </li>)}
    </ol>
    <div className="lj-browse">
      <h2 className="ui-ob-step__title">Browse courses</h2>
      <p className="ui-ob-step__text">Search by name or topic, show only what you haven't installed, or pick a category on the left.</p>
    </div>
    <AppDirectory className="lj-directory" title="All courses" defaultCategory="all" categories={categories}
      labels={{ bar: "Courses", connectedCount: n => `${n} installed`, search: "Search courses", all: "All courses", connected: "Installed", available: "Not installed", empty: "No courses match." }}
      apps={courses.map((item): App => ({ id: item.id, name: item.title, vendor: item.author ?? "", description: `${item.blurb} ${item.repo ?? ""} ${item.language ?? ""}`,
        categories: item.categories ?? [], logo: <CourseArt art={item.art} size={24} />, essential: item.rating !== undefined && item.rating >= 4.7, connected: installed.includes(item.id) }))}
      renderApps={apps => <div className="lj-grid lj-grid--cards">{apps.map(app => {
        const item = courses.find(item => item.id === app.id)!;
        return <ColorCard key={item.id} color={`oklch(0.58 0.2 ${item.art.hue})`} aria-label={item.title}
          header={<><CardMark>{item.mark ?? item.author}</CardMark>{item.rating !== undefined ? <CardFigure>★ {item.rating.toFixed(1)}</CardFigure> : item.version && <CardFigure>{item.version}</CardFigure>}</>}
          main={<CardTitle>{item.title}</CardTitle>}
          footer={<><CardText label={item.updated ? "Updated" : undefined} value={item.updated} />{installed.includes(item.id) && !onOpen
            ? <ColorCardTag><Icon icon={DoneIcon} size={13} />Installed</ColorCardTag>
            : <ColorCardButton disabled={busy === item.id || (!onOpen && !onInstall)} aria-label={`${onOpen ? "Open" : "Install"} ${item.title}`} onClick={() => open(item.id)}>
              {onOpen ? "Open" : busy === item.id ? "Installing…" : "Install"}
            </ColorCardButton>}</>} />;
      })}</div>} />
  </div>;
}

function Stars({ value }: { value: number }) {
  return <span className="lj-stars" role="img" aria-label={`Rated ${value} out of 5`}><i style={{ "--rating": value } as CSSProperties} /></span>;
}
