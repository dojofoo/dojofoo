import { defineEvalConfig } from "@dojofoo/harness/evals";

export default defineEvalConfig({
  maxConcurrency: 1,
  timeoutMs: 300_000,
  ...(process.env.DOJOFOO_EVAL_JUDGE ? { judge: { model: process.env.DOJOFOO_EVAL_JUDGE } } : {}),
});
