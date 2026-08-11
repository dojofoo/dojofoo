"use client";

import { EChartsLineChart, type ChartConfig } from "@/components/evilcharts/charts/echarts-line-chart";
import type { WeeklyActivityMetric } from "@/lib/courses";
import { cn } from "@/lib/utils";

const chartConfig = {
  started: {
    label: "Started",
    colors: { light: ["#171717"], dark: ["#fafafa"] },
  },
  finished: {
    label: "Completed",
    colors: { light: ["#6B97FF"], dark: ["#6B97FF"] },
  },
} satisfies ChartConfig;

function weekLabel(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

function normalizedActivity(data: WeeklyActivityMetric[]) {
  const byWeek = new Map(data.map((point) => [point.week, point]));
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    const day = date.getUTCDay();
    date.setUTCDate(date.getUTCDate() - ((day + 6) % 7) - (5 - index) * 7);
    const week = date.toISOString().slice(0, 10);
    const recorded = byWeek.get(week);
    return {
      week,
      installs: recorded?.installs ?? 0,
      started: recorded?.started ?? 0,
      finished: recorded?.finished ?? 0,
    };
  });
}

export function WeeklyActivityChart({
  data,
  className,
}: {
  data: WeeklyActivityMetric[];
  className?: string;
}) {
  const chartData: Record<string, unknown>[] = normalizedActivity(data).map((point) => ({
    ...point,
  }));

  return (
    <div
      role="img"
      aria-label="Weekly starts and completions"
      className={cn("h-32 min-h-0 w-full", className)}
    >
      <EChartsLineChart
        data={chartData}
        config={chartConfig}
        xDataKey="week"
        className="h-full w-full"
        curveType="linear"
      >
        <EChartsLineChart.Grid />
        <EChartsLineChart.XAxis dataKey="week" tickFormatter={weekLabel} />
        <EChartsLineChart.Tooltip />
        <EChartsLineChart.Line dataKey="started" strokeVariant="solid" strokeWidth={1.5}>
          <EChartsLineChart.ActiveDot />
        </EChartsLineChart.Line>
        <EChartsLineChart.Line dataKey="finished" strokeVariant="dashed" strokeWidth={1.5}>
          <EChartsLineChart.ActiveDot />
        </EChartsLineChart.Line>
      </EChartsLineChart>
    </div>
  );
}
