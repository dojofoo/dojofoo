import type { AgentId } from "./agents.js";

// Pi's sign-in types (@earendil-works/pi-ai, auth/types) in their JSON form (plain arrays for Pi's read-only ones), copied so this
// package stays a leaf without Pi's provider SDKs. packages/harness/src/access.ts fails the build when they stop matching Pi's own.

export type AuthType = "api_key" | "oauth";

/** What a sign-in asks the user, as Pi's `AuthPrompt` without its `signal` */
export type AuthPrompt = {
  type: "text";
  message: string;
  placeholder?: string;
} | {
  type: "secret";
  message: string;
  placeholder?: string;
} | {
  type: "select";
  message: string;
  options: {
    id: string;
    label: string;
    description?: string;
  }[];
} | {
  type: "manual_code";
  message: string;
  placeholder?: string;
};

export interface AuthInfoLink {
  url: string;
  label?: string;
}

/** What a sign-in shows the user, as Pi's `AuthEvent` */
export type AuthEvent = {
  type: "info";
  message: string;
  links?: AuthInfoLink[];
} | {
  type: "auth_url";
  url: string;
  instructions?: string;
} | {
  type: "device_code";
  userCode: string;
  verificationUri: string;
  intervalSeconds?: number;
  expiresInSeconds?: number;
} | {
  type: "progress";
  message: string;
};

/** Whether a provider is signed in, as Pi's `ModelRuntime.getProviderAuthStatus` reports it */
export type AuthStatus = {
  configured: boolean;
  source?: "stored" | "runtime" | "environment" | "fallback" | "models_json_key" | "models_json_command";
  label?: string;
};

/** One way in to a coding agent: Pi's `Provider` with its `auth` described, without functions or secrets */
export interface AccessProvider {
  id: string;
  name: string;
  auth: {
    /** Pi's `ApiKeyAuth`: `login` is whether a key can be entered here (absent for ambient-only providers) */
    apiKey?: { name: string; login: boolean };
    /** Pi's `OAuthAuth`: a browser or device-code sign-in */
    oauth?: { name: string; loginLabel?: string; isSubscription?: boolean };
  };
  status: AuthStatus;
}

/** A sign-in in progress or finished: what it showed, what it asks now, and how it ended */
export interface LoginState {
  id: string;
  agent: AgentId;
  provider: string;
  type: AuthType;
  status: "running" | "succeeded" | "failed" | "cancelled";
  events: AuthEvent[];
  /** The question waiting for an answer; its `id` names it in the answer */
  prompt?: AuthPrompt & { id: string };
  error?: string;
}
