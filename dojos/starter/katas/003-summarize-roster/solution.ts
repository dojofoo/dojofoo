export interface Registration {
  readonly handle: string;
  readonly active: boolean;
}

export interface RosterSummary {
  readonly total: number;
  readonly active: number;
  readonly handles: readonly string[];
}

/** Build a summary without mutating the registrations or their order. */
export function summarizeRoster(
  registrations: readonly Registration[],
): RosterSummary {
  throw new Error("Not implemented");
}
