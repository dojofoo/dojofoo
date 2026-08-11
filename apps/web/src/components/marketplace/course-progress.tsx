import type { KataProgressMetric } from "@/lib/courses";

export function StartsFinishesProgress({ started, finished }: { started: number; finished: number }) {
  const value = started === 0 ? 0 : Math.round((finished / started) * 100);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{started} started</span>
        <span>{finished} finished</span>
      </div>
      <div
        role="progressbar"
        aria-label="Starts versus finishes"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="h-1.5 overflow-hidden bg-muted"
      >
        <div
          className="h-full bg-[#6B97FF] transition-[width] duration-160 ease-out"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export function StuckChart({ points }: { points: KataProgressMetric[] }) {
  const values = points.length > 0 ? points.map((point) => point.active) : [0, 0];
  const maximum = Math.max(1, ...values);
  const coordinates = values.map((value, index) => {
    const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
    const y = 34 - (value / maximum) * 28;
    return `${x},${y}`;
  });

  return (
    <svg
      viewBox="0 0 100 36"
      role="img"
      aria-label="Active senpais by kata"
      className="h-16 w-full overflow-visible"
      preserveAspectRatio="none"
    >
      <path d="M0 34H100" stroke="currentColor" className="text-border" strokeDasharray="2 2" />
      <polyline
        points={coordinates.join(" ")}
        fill="none"
        stroke="#6B97FF"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
      {coordinates.map((coordinate, index) => {
        const [cx, cy] = coordinate.split(",");
        return <circle key={`${cx}-${cy}-${index}`} cx={cx} cy={cy} r="1.4" fill="#6B97FF" />;
      })}
    </svg>
  );
}
