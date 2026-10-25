/** Lines to mark: covered by a passing run, or failing */
export function visualizedLines(lineCount: number, lineHits?: Record<string, number>, failedLines: number[] = []) {
  const failed = new Set(failedLines);
  return [...new Set([...Object.entries(lineHits ?? {}).filter(([, hits]) => hits > 0).map(([line]) => Number(line)), ...failedLines])]
    .filter((line) => Number.isInteger(line) && line > 0 && line <= lineCount)
    .sort((a, b) => a - b).map((line) => ({ line, status: failed.has(line) ? "failed" : "covered" }));
}
