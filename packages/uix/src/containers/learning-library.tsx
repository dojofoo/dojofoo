import type { ReactNode } from "react";
import { Dropdown, EmptyState, Icon } from "../components/app-shell";
import { Button } from "../components/button";
import { AddCard, CardFigure, CardMark, CardText, CardTitle, ColorCard } from "../components/color-card";
import { MoreHorizontalIcon, PlusSignIcon } from "../lib/icons";

export type LearningLibraryEntry = {
  id: string;
  title: string;
  mark?: ReactNode;
  caption?: ReactNode;
  detail?: ReactNode;
  status?: ReactNode;
  /** Omit when the host has no measured progress. */
  progress?: number;
  color?: string;
  href?: string;
  onOpen?: () => void;
  onPrepare?: () => void;
  onDelete?: () => void;
};

export type LearningLibraryProps = {
  courses: LearningLibraryEntry[];
  drafts?: LearningLibraryEntry[];
  controls?: ReactNode;
  loading?: boolean;
  error?: string;
  onExplore?: () => void;
  onNewCourse?: () => void;
  newCoursePending?: boolean;
  authoringError?: string;
};

/** The learner's library; discovery, progress and navigation belong to its host. */
export function LearningLibrary({ courses, drafts = [], controls, loading, error, onExplore, onNewCourse, newCoursePending, authoringError }: LearningLibraryProps) {
  const card = (entry: LearningLibraryEntry) => <div key={entry.id} className="relative"><ColorCard className={entry.onDelete ? "[&_.ui-card__head]:pr-8" : undefined} color={entry.color ?? "var(--brand)"} href={entry.href}
    aria-label={entry.progress === undefined ? entry.title : `${entry.title}, ${entry.progress}% done`}
    onPointerEnter={entry.onPrepare} onFocus={entry.onPrepare}
    onNavigate={entry.onOpen} onClick={!entry.href && entry.onOpen ? () => entry.onOpen?.() : undefined}
    header={entry.mark || entry.status ? <><CardMark>{entry.mark}</CardMark>{entry.status && <CardFigure>{entry.status}</CardFigure>}</> : undefined}
    main={<CardTitle>{entry.title}</CardTitle>}
    footer={entry.caption || entry.detail || entry.progress !== undefined ? <>
      <CardText label={entry.caption} value={entry.detail} />
      {entry.progress !== undefined && <CardFigure>{entry.progress}%</CardFigure>}
    </> : undefined} progress={entry.progress} />
    {entry.onDelete && <div className="absolute top-3 right-3" onClick={event => event.stopPropagation()}>
      <Dropdown align="end" items={[{ label: "Delete", onSelect: entry.onDelete }]}
        trigger={({ open, toggle }) => <button type="button" className="ui-as-icon-btn text-white!" aria-label={`Actions for ${entry.title}`} aria-expanded={open} onClick={toggle}><Icon icon={MoreHorizontalIcon} size={16} /></button>} />
    </div>}
  </div>;

  return <div className="lj-page" aria-busy={loading || undefined}>
    <header className="lj-page__head">
      <span className="ui-ob-kicker">Courses</span>
      <h1 className="ui-ob-title">Your courses</h1>
      <p className="ui-ob-sub">The ones you’re learning, with how far you are – and the ones you’re writing with Kyoshi.</p>
      {controls && <div className="mt-6 flex flex-wrap items-center gap-3">{controls}</div>}
    </header>
    {error && <div role="alert"><EmptyState title="Could not load courses" text={error} /></div>}
    {loading && <p role="status">Loading your courses…</p>}
    <section aria-label="Studying">
      <h2 className="lj-section">Studying</h2>
      {!loading && !error && courses.length === 0
        ? <EmptyState title="No courses yet" text="Add a course to a local workspace to start learning."
          action={onExplore ? <Button onClick={onExplore}>Explore courses</Button> : undefined} />
        : courses.length > 0 && <div className="lj-grid lj-grid--cards">
          {courses.map(card)}
          {onExplore && <AddCard icon={<Icon icon={PlusSignIcon} size={18} />} title="Add a course" label="Find your next course" onClick={onExplore} />}
        </div>}
    </section>
    {(drafts.length > 0 || onNewCourse) && <section className="lj-courses__next" aria-label="Authoring">
      <h2 className="lj-section">Authoring</h2>
      {authoringError && <p role="alert" className="mb-4 text-sm text-[var(--destructive)]">{authoringError}</p>}
      <div className="lj-grid lj-grid--cards">
        {drafts.map(card)}
        {onNewCourse && <AddCard icon={<Icon icon={PlusSignIcon} size={18} />} title={newCoursePending ? "Creating course…" : "New course"} label="Start from a template" disabled={newCoursePending} onClick={onNewCourse} />}
      </div>
    </section>}
  </div>;
}
