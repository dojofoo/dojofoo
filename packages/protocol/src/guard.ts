/** A guard verify that found the lesson's solution changed while Sensei's model was working (D8, D21) */
export interface GuardViolation {
  sessionId: string;
  turnId?: string;
  courseId: string;
  lessonId: string;
  /** Workspace-relative paths the verify acted on (only the solution file in this design) */
  paths: string[];
  action: "restored" | "recreated" | "removed";
  /** Where the overwritten version is kept (one per path, until the next violation on that path); absent when there was none */
  quarantined?: string;
  at: string;
}

/** A check card's state (D16): held for an idle session, sent, seen by Sensei, or dropped. */
export type CheckReportState = "held" | "sent" | "seen" | "dropped";
