import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrandLogo } from "../components/brand-logo";
import { CardFigure, CardKicker, CardMark, CardText, CardTitle, ColorCard, ColorCardTag } from "../components/color-card";
import { courseColor } from "../components/course-card";
import { compactNumber, teachingModes, type WebCourse } from "./catalog";

/** A course in a grid, as Explore's results draw them: the course's color card, opening its page */
export function CourseTile({ course, href, onOpen, shader = false }: { course: WebCourse; href?: string; onOpen?: (course: WebCourse) => void; /** Its contour map, waves, network or rings drifting over it */ shader?: boolean }) {
  const mode = teachingModes.find((item) => item.value === course.mode)?.label;
  return (
    <ColorCard color={courseColor(course.art)} shader={shader ? course.shader : false} seed={course.repository} aria-label={`${course.name} – ${course.description}. ${course.rating === undefined ? "" : `Rated ${course.rating.toFixed(1)}, `}${compactNumber(course.metrics.installs)} installs, ${course.language}${mode ? `, ${mode}` : ""}`} href={href} onClick={onOpen ? event => {
      if (href && (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)) return;
      if (href) event.preventDefault();
      onOpen(course);
    } : undefined}
      header={<><CardMark>{course.author === "Dojo.foo" ? <BrandLogo mono /> : course.author}</CardMark>{course.rating !== undefined && <CardFigure aria-label={`Rated ${course.rating} out of 5`}>★ {course.rating.toFixed(1)}</CardFigure>}</>}
      main={<><CardKicker code>{course.repository}</CardKicker><CardTitle>{course.name}</CardTitle></>}
      footer={<><CardText label={course.language} value={`${compactNumber(course.metrics.installs)} installs`} />{mode && <ColorCardTag>{mode}</ColorCardTag>}</>} />
  );
}

/** The learner app, live and `height` tall (800px by default): drawn at the frame's width (1280px at least, scaled down
    to fit a narrower one), so on a wide screen it shows at its real size. The app fills it, whatever its own height */
const PHONE = 600;

export function AppPreview({ children, label, height = 800, ratio, controls }: { children: ReactNode; label: string; height?: number; /** Width over height (16 / 9): the window keeps it at every width, instead of a fixed height */ ratio?: number;
  /** On a phone, what stays live (a selector, e.g. the drawers' buttons and scrims); all else is still, as wide */ controls?: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1280);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width || 1280));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // On a phone a 1200-wide screen would be too small to read: the app at the phone's own width instead, unscaled, in its
  // narrow layout (the sidebar and the Sensei as drawers), its `controls` live, so their buttons open them
  const phone = Boolean(ratio) && width < PHONE;
  // At a ratio it's a 1200-wide screen at any width (scaled, so the sidebar runs past its bottom edge), so what it shows doesn't change with the page
  const base = phone ? width : ratio ? 1200 : Math.max(1280, width);
  const scale = width / base;
  const tall = phone ? Math.round(Math.min(width * 1.6, 680)) : ratio ? Math.round(base / ratio) : height;
  // Live only through its controls: every other control in it inert (out of reach of taps and the keyboard), also those
  // the app draws later (the editor loads after it)
  useEffect(() => {
    const el = frame.current;
    if (!phone || !el) return;
    const still = () => el.querySelectorAll<HTMLElement>("a[href], button, input, textarea, select, [tabindex], [contenteditable], [role=button]").forEach((item) => {
      if (!controls || !item.matches(controls)) item.inert = true;
    });
    still();
    const observer = new MutationObserver(still);
    observer.observe(el, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [phone, controls]);
  return (
    <figure className="ui-web-app" aria-label={label} data-phone={phone || undefined}>
      <div ref={frame} className="ui-web-app__frame" style={{ height: tall * scale }} inert={!phone} data-controls={phone && controls ? "" : undefined}>
        <div className="ui-web-app__scale" style={{ width: base, height: tall, transform: `scale(${scale})` }}>{children}</div>
      </div>
    </figure>
  );
}
