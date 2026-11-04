import type { EvaluationFailureCode } from "@dojofoo/protocol";

/** A verified teaching failure, distinct from a broken provider or test fixture. */
export class TeachingFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeachingFailure";
  }
}

/** The draft's coding agent can't run course evaluations yet (they still teach on ACP until step 7); no attempt is spent. */
export class UnsupportedAgentError extends Error {
  readonly code = "agent_unsupported";
  readonly agent: string;
  constructor(agent: string, message: string) {
    super(message);
    this.name = "UnsupportedAgentError";
    this.agent = agent;
  }
}

/** The UI server will not run this evaluation; `code` survives the host-port hop to Kyoshi's tool. No attempt is spent. */
export class EvaluationRefused extends Error {
  readonly code: EvaluationFailureCode;
  constructor(code: EvaluationFailureCode, message: string) {
    super(message);
    this.name = "EvaluationRefused";
    this.code = code;
  }
}

/** Authored content must be corrected before an evaluation can run. */
export class MaterialFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaterialFailure";
  }
}
