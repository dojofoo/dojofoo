import { createServerFn } from "@tanstack/react-start";

// Closed unless the deployment opts in (DOJO_SOCIAL_SIGN_IN=true, DOJO_REGISTRATION=true): production without them
// offers neither social sign-in nor new accounts
const enabled = (value: string | undefined) => value === "true" || value === "1";

export const loadAuthFlags = createServerFn({ method: "GET" }).handler(() => ({
  socialSignIn: enabled(process.env.DOJO_SOCIAL_SIGN_IN),
  registration: enabled(process.env.DOJO_REGISTRATION),
}));

// While accounts are closed the auth pages stay out of search results, as /pricing does
export const authRobots = (flags?: { registration: boolean }) =>
  flags?.registration ? [] : [{ name: "robots", content: "noindex, nofollow" }];
