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
          className="h-full bg-primary transition-[width] duration-160 ease-out"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
