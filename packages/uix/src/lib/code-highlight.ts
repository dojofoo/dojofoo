export type CodeHighlight = {
  from: number;
  to: number;
};

export const CODE_HIGHLIGHT_PATTERN = /(\[highlight:L(\d+)(?:-(?:L)?(\d+))?\])/giu;

export function codeHighlight(value: string): CodeHighlight | null {
  const match = /^\[highlight:L(\d+)(?:-(?:L)?(\d+))?\]$/iu.exec(value);
  if (!match) return null;
  const from = Number(match[1]);
  const to = Number(match[2] ?? match[1]);
  if (from < 1 || to < from) return null;
  return { from, to };
}

export function codeHighlights(value: string): CodeHighlight[] {
  return [...value.matchAll(new RegExp(CODE_HIGHLIGHT_PATTERN.source, "giu"))]
    .flatMap((match) => {
      const parsed = codeHighlight(match[1]);
      return parsed ? [parsed] : [];
    });
}
