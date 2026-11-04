import { afterEach, describe, expect, it, vi } from "vitest";
import { switchWorkspaceAgent } from "./use-workspace-agent";

afterEach(() => { vi.unstubAllGlobals(); });

/** The page's launch token and the select route, as the UI server answers them */
function serve(select: () => Response) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url === "/api/control/launch-token") return Response.json({ token: "token" });
    return select();
  }));
  return calls;
}

describe("switching the workspace's agent", () => {
  it("a pick is handed to onSwitched with the switch, once", async () => {
    const calls = serve(() => Response.json({ id: "pi", name: "Pi", selected: true, status: "stopped" }));
    const onSwitched = vi.fn();
    await switchWorkspaceAgent("ws-1", "pi", { id: "pi-conversation", readOnly: false }, onSwitched);
    expect(onSwitched).toHaveBeenCalledTimes(1);
    expect(onSwitched).toHaveBeenCalledWith("pi", { id: "pi-conversation", readOnly: false });
    expect(calls.filter(call => call.startsWith("POST "))).toEqual(["POST /api/v1/workspaces/ws-1/agents/pi/select"]);
  });

  it("a refused switch hands nothing to the page", async () => {
    serve(() => Response.json({ error: "agent_not_offered", message: "Cursor isn't available yet. Choose another coding agent." }, { status: 409 }));
    const onSwitched = vi.fn();
    await expect(switchWorkspaceAgent("ws-1", "cursor", { id: "old", readOnly: true }, onSwitched)).rejects.toThrow("Cursor isn't available yet.");
    expect(onSwitched).not.toHaveBeenCalled();
  });
});
