import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  InputCopy,
} from "@dojocho/ui";
import type { MarketplaceCourse } from "@/lib/courses";

export function CourseCard({ course }: { course: MarketplaceCourse }) {
  return (
    <Card
      href={`/courses/${course.source}/${course.slug}`}
      label={`Open ${course.name}`}
      data-testid={`course-${course.slug}`}
      size="compact"
      className="group/course min-h-[10.5rem] overflow-hidden border border-border/60 bg-surface-1 pb-0 transition-colors duration-80 hover:border-primary"
    >
      <CardHeader className="px-4 pt-4">
        <CardTitle className="text-[15px]">{course.name}</CardTitle>
        <CardDescription>{course.description}</CardDescription>
        <CardAction>
          <span className="font-mono text-[11px] text-muted-foreground">v{course.version}</span>
        </CardAction>
      </CardHeader>
      <CardFooter className="mt-auto block border-t border-dashed border-border px-4 py-3">
        <InputCopy
          value={`dojo add ${course.installUrl}`}
          variant="icon"
          size="compact"
          className="w-full"
        />
      </CardFooter>
    </Card>
  );
}
