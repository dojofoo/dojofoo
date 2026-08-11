import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  InputCopy,
} from "@dojocho/ui";
import type { MarketplaceCourse } from "@/lib/courses";
import { WeeklyActivityChart } from "@/components/evilcharts/blocks/shipments-echarts-line-chart";

export function CourseCard({ course }: { course: MarketplaceCourse }) {
  return (
    <Card
      href={`/courses/${course.source}/${course.slug}`}
      label={`Open ${course.name}`}
      data-testid={`course-${course.slug}`}
      size="compact"
      className="group/course min-h-[19rem] overflow-hidden border border-border/60 bg-surface-1 transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-1 hover:border-[#6B97FF]/40 hover:shadow-surface-5"
    >
      <CardHeader>
        <CardTitle className="text-[15px]">{course.name}</CardTitle>
        <CardDescription>{course.description}</CardDescription>
        <CardAction>
          <span className="font-mono text-[11px] text-muted-foreground">v{course.version}</span>
        </CardAction>
      </CardHeader>
      <CardContent className="mt-auto px-0 pt-3">
        <WeeklyActivityChart
          data={course.metrics.weeklyActivity}
          className="transition-transform duration-300 ease-out group-hover/course:scale-[1.02]"
        />
      </CardContent>
      <CardFooter className="block border-t border-dashed border-border px-3 pb-3 pt-3">
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
