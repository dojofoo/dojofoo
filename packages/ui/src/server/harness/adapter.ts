import type * as acp from "@agentclientprotocol/sdk";
import type { AcpAgentId } from "@dojofoo/protocol";

/** The registry rows today's ACP lesson runtime runs; step 7 deletes this runtime. */
export type HarnessKind = AcpAgentId;

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
    connection: acp.ClientSideConnection,
    sessionId: string,
    advertisedOptions?: acp.SessionConfigOption[] | null,
  ): Promise<acp.SessionConfigOption[] | undefined>;
  setModel(
    connection: acp.ClientSideConnection,
    sessionId: string,
    modelId: string,
  ): Promise<acp.SessionConfigOption[] | undefined>;
  encodeResource(resource: { uri: string; text: string }): string;
  process(runtime: HarnessRuntimeContext): HarnessProcess;
}
