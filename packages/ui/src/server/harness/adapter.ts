import * as acp from "@agentclientprotocol/sdk";
import type { AcpAgentId } from "@dojofoo/protocol";

/** The registry rows today's ACP lesson runtime runs; step 7 deletes this runtime. */
export type HarnessKind = AcpAgentId;

/** The agent calls the lesson runtime makes. SDK 2 removed the named-method
 * `ClientSideConnection`; these keep its names over the request API. */
export function acpAgentConnection(agent: acp.ClientContext) {
  const { initialize, session } = acp.methods.agent;
  return {
    initialize: (params: acp.InitializeRequest) => agent.request(initialize, params),
    newSession: (params: acp.NewSessionRequest) => agent.request(session.new, params),
    loadSession: (params: acp.LoadSessionRequest) => agent.request(session.load, params),
    listSessions: (params: acp.ListSessionsRequest) => agent.request(session.list, params),
    setSessionMode: (params: acp.SetSessionModeRequest) => agent.request(session.setMode, params),
    setSessionConfigOption: (params: acp.SetSessionConfigOptionRequest) => agent.request(session.setConfigOption, params),
    prompt: (params: acp.PromptRequest) => agent.request(session.prompt, params),
    cancel: (params: acp.CancelNotification) => agent.notify(session.cancel, params),
    request: (method: string, params?: unknown) => agent.request(method, params),
  };
}

export type AcpAgentConnection = ReturnType<typeof acpAgentConnection>;

export type HarnessProcess = {
  command: string;
  args: string[];
  environment: NodeJS.ProcessEnv;
};

export type HarnessRuntimeContext = {
  root: string;
  developerInstructions: string;
};

export interface HarnessAdapter {
  kind: HarnessKind;
  clientCapabilities?: acp.ClientCapabilities;
  validatePromptResponse?(response: acp.PromptResponse): void;
  contextualInstructions?: boolean;
  supportsVirtualResourceUris?: boolean;
  configureSession(
    connection: AcpAgentConnection,
    sessionId: string,
    advertisedOptions?: acp.SessionConfigOption[] | null,
  ): Promise<acp.SessionConfigOption[] | undefined>;
  setModel(
    connection: AcpAgentConnection,
    sessionId: string,
    modelId: string,
  ): Promise<acp.SessionConfigOption[] | undefined>;
  encodeResource(resource: { uri: string; text: string }): string;
  process(runtime: HarnessRuntimeContext): HarnessProcess;
}
