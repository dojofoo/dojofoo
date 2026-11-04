import { describe, expect, it } from "vitest";
import { AgentApiError } from "./runtime";
import { LAUNCH_TOKEN_HEADER, launchGuard } from "./launch";

const guard = launchGuard({ token: () => "current-token", origin: request => new URL(request.url).origin });
const request = (headers: Record<string, string>) => new Request("http://127.0.0.1:4567/api/v1/workspaces/ws/agents/codex/select", { method: "POST", headers });
const refusal = (headers: Record<string, string>) => {
  try { guard(request(headers)); }
  catch (error) { return error instanceof AgentApiError ? { status: error.status, code: error.code } : error; }
  return undefined;
};

describe("launch guard", () => {
  it("accepts the launch token from the same origin", () => {
    expect(refusal({ [LAUNCH_TOKEN_HEADER]: "current-token", origin: "http://127.0.0.1:4567" })).toBeUndefined();
  });

  it("accepts a matching token without an Origin header", () => {
    expect(refusal({ [LAUNCH_TOKEN_HEADER]: "current-token" })).toBeUndefined();
  });

  it("refuses a missing or wrong token with 403 launch_token_invalid", () => {
    for (const headers of [{}, { [LAUNCH_TOKEN_HEADER]: "" }, { [LAUNCH_TOKEN_HEADER]: "earlier-token" }, { [LAUNCH_TOKEN_HEADER]: "current-token-but-longer" }] as Array<Record<string, string>>) {
      expect(refusal(headers)).toEqual({ status: 403, code: "launch_token_invalid" });
    }
  });

  it("refuses a foreign Origin with 403 origin_forbidden", () => {
    expect(refusal({ [LAUNCH_TOKEN_HEADER]: "current-token", origin: "https://attacker.example" })).toEqual({ status: 403, code: "origin_forbidden" });
  });
});
