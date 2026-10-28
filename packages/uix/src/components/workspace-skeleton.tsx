/** A neutral loading surface; file names and contents only appear once the host has read them. */
export function WorkspaceSkeleton({ label = "Loading files", rows = 7 }: { label?: string; rows?: number }) {
  return <div role="status" aria-label={label} aria-busy="true" className="flex h-full min-h-32 flex-col gap-3 p-5 motion-safe:animate-pulse">
    {Array.from({ length: rows }, (_, index) => <span key={index} aria-hidden="true" className="h-3 shrink-0 rounded"
      style={{ width: `${[64, 86, 48, 72, 39, 80, 55][index % 7]}%`, background: "color-mix(in oklch, var(--fluid-foreground) 8%, transparent)" }} />)}
  </div>;
}
