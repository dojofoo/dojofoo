import type * as acp from "@agentclientprotocol/sdk";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { HarnessAdapter } from "./adapter";

export function opencodeRuntimeEnvironment(
  developerInstructions: string,
  baseEnvironment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  let configured: Record<string, unknown> = {};
  if (baseEnvironment.OPENCODE_CONFIG_CONTENT) {
    const parsed = JSON.parse(baseEnvironment.OPENCODE_CONFIG_CONTENT) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("OPENCODE_CONFIG_CONTENT must contain a JSON object");
    }
    configured = parsed as Record<string, unknown>;
  }
  const agents = configured.agent && typeof configured.agent === "object" && !Array.isArray(configured.agent)
    ? configured.agent as Record<string, unknown>
    : {};
  const teachingAgent = agents.dojofoo && typeof agents.dojofoo === "object" && !Array.isArray(agents.dojofoo)
    ? agents.dojofoo as Record<string, unknown> : {};
  const teachingPermissions = teachingAgent.permission && typeof teachingAgent.permission === "object" && !Array.isArray(teachingAgent.permission)
    ? teachingAgent.permission as Record<string, unknown> : {};
  const experimental = configured.experimental && typeof configured.experimental === "object" && !Array.isArray(configured.experimental)
    ? configured.experimental as Record<string, unknown>
    : {};
  return {
    ...baseEnvironment,
    OPENCODE_CONFIG_CONTENT: JSON.stringify({
      ...configured,
      experimental: {
        ...experimental,
        // Lesson tools may intentionally wait for learner input. OpenCode's
        // short default expires the MCP request before the UI can answer it.
        mcp_timeout: typeof experimental.mcp_timeout === "number" ? experimental.mcp_timeout : 600_000,
      },
      default_agent: "dojofoo",
      agent: {
        ...agents,
        dojofoo: {
          ...teachingAgent,
          mode: "primary",
          description: "Teach the active Dojofoo lesson.",
          prompt: developerInstructions,
          ...(typeof configured.model === "string" ? { model: configured.model } : {}),
          permission: {
            read: "allow",
            edit: "allow",
            glob: "allow",
            grep: "allow",
            list: "allow",
            bash: "allow",
            skill: "allow",
            question: "allow",
            external_directory: "allow",
            ...teachingPermissions,
          },
        },
      },
    }),
  };
}

function configuredModel(environment: NodeJS.ProcessEnv = process.env): string | undefined {
  if (!environment.OPENCODE_CONFIG_CONTENT) return undefined;
  const configured = JSON.parse(environment.OPENCODE_CONFIG_CONTENT) as unknown;
  if (!configured || typeof configured !== "object" || Array.isArray(configured)) return undefined;
  const model = (configured as Record<string, unknown>).model;
  return typeof model === "string" ? model : undefined;
}

export async function configureOpenCodeSessionModel(
  connection: acp.ClientSideConnection,
  sessionId: string,
  modelId: string,
): Promise<acp.SessionConfigOption[] | undefined> {
  try {
    const response = await connection.setSessionConfigOption({ sessionId, configId: "model", value: modelId });
    return response.configOptions;
  } catch (cause) {
    const error = cause as { code?: unknown; message?: unknown };
    if (error.code !== -32601 && !(typeof error.message === "string" && error.message.includes("Method not found"))) {
      throw cause;
    }
    const legacy = connection as unknown as { request(method: string, params: unknown): Promise<unknown> };
    try {
      await legacy.request("session/set_model", { sessionId, modelId });
      return undefined;
    } catch (legacyCause) {
      console.warn("OpenCode rejected both ACP model configuration methods", legacyCause);
      throw legacyCause;
    }
  }
}

export function opencodeExecutable(
  environment: NodeJS.ProcessEnv = process.env,
  userHome = homedir(),
): string {
  if (environment.OPENCODE_BIN) return environment.OPENCODE_BIN;
  const installed = resolve(userHome, ".opencode", "bin", "opencode");
  return existsSync(installed) ? installed : "opencode";
}

function encodePromptResource(resource: { uri: string; text: string }): string {
  return `<context ref="${resource.uri}">\n${resource.text}\n</context>`;
}

export function createOpenCodeHarnessAdapter(
  environment: NodeJS.ProcessEnv = process.env,
  userHome = homedir(),
  listModels: (command: string) => string[] = (command) => execFileSync(command, ["models"], {
    encoding: "utf8",
    env: environment,
    timeout: 10_000,
  }).split(/\r?\n/u).map((line) => line.trim()).filter(Boolean),
): HarnessAdapter {
  const legacyModelOptions = (currentValue?: string): acp.SessionConfigOption[] | undefined => {
    let models: string[];
    try {
      models = listModels(opencodeExecutable(environment, userHome));
    } catch {
      return undefined;
    }
    if (models.length === 0) return undefined;
    const selected = currentValue && models.includes(currentValue) ? currentValue : models[0];
    const groups = new Map<string, acp.SessionConfigSelectOption[]>();
    for (const value of models) {
      const separator = value.indexOf("/");
      const provider = separator > 0 ? value.slice(0, separator) : "Models";
      const name = separator > 0 ? value.slice(separator + 1) : value;
      const options = groups.get(provider) ?? [];
      options.push({ value, name });
      groups.set(provider, options);
    }
    return [{
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: selected,
      options: [...groups].map(([group, options]) => ({ group, name: group, options })),
    }];
  };
  return {
    kind: "opencode",
    configureSession: async (connection, sessionId, advertisedOptions) => {
      const model = configuredModel(environment);
      if (model) {
        const configured = await configureOpenCodeSessionModel(connection, sessionId, model);
        return configured ?? legacyModelOptions(model);
      }
      const advertisedModel = advertisedOptions?.some((option) => option.type === "select"
        && (option.category === "model" || option.id === "model"));
      return advertisedModel ? undefined : legacyModelOptions();
    },
    setModel: (connection, sessionId, modelId) => configureOpenCodeSessionModel(connection, sessionId, modelId),
    encodeResource: encodePromptResource,
    process: (runtime) => ({
      command: opencodeExecutable(environment, userHome),
      // The child cwd and ACP session/new/load already carry runtime.root.
      // OpenCode 2 exposes `acp` without the old CLI --cwd flag.
      args: ["acp"],
      environment: opencodeRuntimeEnvironment(runtime.developerInstructions, environment),
    }),
  };
}

export const opencodeHarnessAdapter = createOpenCodeHarnessAdapter();
