import { BrandLogo } from "../components/brand-logo";
import { CardFigure, CardKicker, CardMark, CardText, CardTitle, ColorCard, ColorCardTag } from "../components/color-card";
import { courseColor } from "../components/course-card";
import { compactNumber, teachingModes, type WebCourse } from "./catalog";

/** A course in a grid, as Explore's results draw them: the course's color card, opening its page */
export function CourseTile({ course, href, onOpen, shader = false }: { course: WebCourse; href?: string; onOpen?: (course: WebCourse) => void; /** Its contour map, waves, network or rings drifting over it */ shader?: boolean }) {
  const mode = teachingModes.find((item) => item.value === course.mode)?.label;
  return (
    <ColorCard color={courseColor(course.art)} shader={shader ? course.shader : false} seed={course.repository} aria-label={`${course.name} – ${course.description}. ${course.rating === undefined ? "" : `Rated ${course.rating.toFixed(1)}, `}${compactNumber(course.metrics.installs)} installs, ${course.language}${mode ? `, ${mode}` : ""}`} href={href} onNavigate={onOpen ? () => onOpen(course) : undefined} onClick={!href && onOpen ? () => onOpen(course) : undefined}
      header={<><CardMark>{course.author === "Dojo.foo" ? <BrandLogo mono /> : course.author}</CardMark>{course.rating !== undefined && <CardFigure aria-label={`Rated ${course.rating} out of 5`}>★ {course.rating.toFixed(1)}</CardFigure>}</>}
      main={<><CardKicker code>{course.repository}</CardKicker><CardTitle>{course.name}</CardTitle></>}
      footer={<><CardText label={course.language} value={`${compactNumber(course.metrics.installs)} installs`} />{mode && <ColorCardTag>{mode}</ColorCardTag>}</>} />
  );
}

export { AppPreview } from "./app-preview";
