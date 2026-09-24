import { CourseLessonScreen, starterKataCourseScreen } from "@dojofoo/ui/course-lesson-demo";
import { ComputerUse } from "@dojofoo/ui/elements/computer-use";
import { useEffect, useRef, useState } from "react";

const APP_WIDTH = 1440;
const APP_HEIGHT = 900;

export function DojoHeroPreview() {
  const viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setScale(element.clientWidth / APP_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <ComputerUse
      activeIndex={0}
      className="h-full max-w-none translate-y-px rounded-t-sm rounded-b-none border border-border/60 bg-background shadow-3xl"
      steps={[]}
      url="dojo.localhost/session/starter-typescript"
      viewportClassName="min-h-0 flex-1"
    >
      <div className="relative h-full w-full overflow-hidden bg-background" ref={viewport}>
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ height: APP_HEIGHT, transform: `scale(${scale})`, width: APP_WIDTH }}
        >
          <CourseLessonScreen model={starterKataCourseScreen} showLogo={false} theme="dark" />
        </div>
      </div>
    </ComputerUse>
  );
}
