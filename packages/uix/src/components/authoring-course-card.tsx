import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { CourseCard, courseColor } from "./course-card";
import { ColorPicker } from "./arc/color-picker/color-picker";
import { cardViewTransition } from "../lib/view-transition";

/** The shared live course preview, with UIarc's picker on its corner. */
export function AuthoringCourseCard({ course, onColorChange, disabled, hint }: {
  course: ComponentProps<typeof CourseCard>["course"];
  onColorChange?: (color: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const [previewColor, setPreviewColor] = useState<string>();
  useEffect(() => setPreviewColor(undefined), [course.art.color, course.art.hue]);
  const target = { ...course, art: { ...course.art, ...(previewColor ? { color: previewColor } : {}) } };
  const signature = JSON.stringify(target);
  const latest = useRef(signature);
  const committed = useRef<string | undefined>(undefined);
  useEffect(() => { if (!disabled && committed.current !== undefined) setPreviewColor(undefined); }, [disabled]);
  const [displayed, setDisplayed] = useState(target);
  useLayoutEffect(() => {
    if (latest.current === signature) return;
    latest.current = signature;
    // Direct manipulation stays live; metadata changes from the agent use the card transition.
    if (previewColor) setDisplayed(target);
    else cardViewTransition(() => { if (latest.current === signature) setDisplayed(target); });
  }, [signature]);
  const commit = (color: string) => {
    if (disabled || color === committed.current) return;
    committed.current = color;
    onColorChange?.(color);
  };
  return <div className="grid gap-2">
    <div className="ui-authoring-card__preview relative" aria-label="Course card preview">
      <CourseCard course={displayed} showVersion />
      {onColorChange && <div className="absolute right-3 bottom-3 z-10" title={hint}>
        <ColorPicker compact portal label="Card color" value={courseColor(target.art)} disabled={disabled}
          onValueChange={color => { committed.current = undefined; setPreviewColor(color); }} onValueCommit={commit} />
      </div>}
    </div>
    {hint && <p className="m-0 px-1 text-xs leading-relaxed text-(--muted)">{hint}</p>}
  </div>;
}
