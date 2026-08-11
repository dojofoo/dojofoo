export type RegistrationResult =
  | { ok: true; handle: string }
  | { ok: false; reason: "empty" | "too-short" };

/** Validate a display name and return a typed registration result. */
export function validateRegistration(input: string): RegistrationResult {
  throw new Error("Not implemented");
}
