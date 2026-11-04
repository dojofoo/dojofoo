/** An evaluation trial's Sensei stops at this spend (design, "Evaluation"); an estimate, about ten times a trial's eleven Sensei turns
 *  at Sensei's 32 000-token compaction budget (step-7 plan, decision 7). */
export const trialUsageCeiling = { newInputTokens: 3_000_000, outputTokens: 300_000 };
/** A whole trial, as the worker allowed it */
export const trialTimeLimitMs = 2_100_000;
/** Each role's one-shot */
export const oneShotTimeLimitMs = { fixtures: 120_000, learner: 120_000, judge: 180_000 };
/** The simulated learner's replies to Sensei's teaching questions */
export const maxTeachingQuestionReplies = 4;

/** Live-eval pacing: synthetic learners otherwise send turns faster than a human can read. */
export function turnIntervalMs(environment: NodeJS.ProcessEnv = process.env): number {
  const value = Number(environment.DOJOFOO_EVAL_TURN_INTERVAL_MS ?? 15_000);
  if (!Number.isSafeInteger(value) || value < 0 || value > 60_000) {
    throw new Error("Evaluation turn interval must be between 0 and 60000 milliseconds");
  }
  return value;
}
