import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardEyebrow,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@dojocho/ui";
import type { MarketplaceCourse } from "@/lib/courses";
import { StartsFinishesProgress, StuckChart } from "./course-progress";

export function CourseCard({ course }: { course: MarketplaceCourse }) {
  return (
    <Card
      href={`/courses/${course.source}/${course.slug}`}
      label={`Open ${course.name}`}
      data-testid={`course-${course.slug}`}
      className="min-h-[25rem] bg-surface-1"
    >
      <CardHeader>
        <CardEyebrow>{course.source}</CardEyebrow>
        <CardTitle>{course.name}</CardTitle>
        <CardDescription>{course.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        <div className="flex flex-wrap gap-1.5">
          {course.categories.map((category) => (
            <Badge key={category} color="gray" size="sm">{category}</Badge>
          ))}
        </div>
        <dl className="grid grid-cols-3 border-y border-dashed border-border py-3 text-xs">
          <div><dt className="text-muted-foreground">Installs</dt><dd className="mt-1 text-sm text-foreground">{course.metrics.installs}</dd></div>
          <div><dt className="text-muted-foreground">Progressing</dt><dd className="mt-1 text-sm text-foreground">{course.metrics.progressing}</dd></div>
          <div><dt className="text-muted-foreground">Finished</dt><dd className="mt-1 text-sm text-foreground">{course.metrics.finished}</dd></div>
        </dl>
        <div className="mt-auto">
          <StuckChart points={course.metrics.kataProgress} />
        </div>
      </CardContent>
      <CardFooter className="block">
        <StartsFinishesProgress
          started={course.metrics.started}
          finished={course.metrics.finished}
        />
      </CardFooter>
    </Card>
  );
}
