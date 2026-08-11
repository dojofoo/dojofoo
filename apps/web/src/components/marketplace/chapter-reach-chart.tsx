"use client";

import { EChartsLineChart, type ChartConfig } from "@/components/evilcharts/charts/echarts-line-chart";
import type { KataProgressMetric } from "@/lib/courses";
import { cn } from "@/lib/utils";

const chartConfig = {
  reached: {
    label: "Dojo instances",
    colors: { light: ["#6B97FF"], dark: ["#6B97FF"] },
  },
} satisfies ChartConfig;

function chapterLabel(value: string) {
  return value.match(/^\d+/u)?.[0] ?? value;
}

export function ChapterReachChart({
  data,
  className,
}: {
  data: KataProgressMetric[];
  className?: string;
}) {
  const chartData: Record<string, unknown>[] = data.map(({ kata, started }) => ({
    chapter: kata,
    reached: started,
  }));

  return (
    <div
      role="img"
      aria-label="Dojo instances reaching each chapter"
      data-chapter-count={data.length}
      className={cn("h-32 min-h-0 w-full", className)}
    >
      <EChartsLineChart
        data={chartData}
        config={chartConfig}
        xDataKey="chapter"
        className="h-full w-full"
        curveType="linear"
      >
        <EChartsLineChart.Grid />
        <EChartsLineChart.XAxis dataKey="chapter" tickFormatter={chapterLabel} />
        <EChartsLineChart.Tooltip />
        <EChartsLineChart.Line dataKey="reached" strokeVariant="solid" strokeWidth={2}>
          <EChartsLineChart.ActiveDot />
        </EChartsLineChart.Line>
      </EChartsLineChart>
    </div>
  );
}
