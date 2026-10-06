import type { KeyedTokensInfo } from "@shikijs/magic-move/types";

export type TeachingBlock =
  | { type: "html"; html: string }
  | { type: "diagram"; source: string }
  | { type: "code-steps"; steps: KeyedTokensInfo[] };
