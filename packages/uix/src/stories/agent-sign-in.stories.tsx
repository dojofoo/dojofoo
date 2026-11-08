import type { AccessProvider, AuthType, LoginState } from "@dojofoo/protocol";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { AgentSignIn } from "../components/agent-sign-in";
import { CodexIcon, OpenCodeIcon, PiIcon } from "../components/harness-icons";
import { Composer } from "../containers/assistant-home";
import { codexProviders, openCodeProviders, piProviders } from "./agent-providers";

const pi = { name: "Pi", icon: <PiIcon size={22} color="currentColor" /> };
const codex = { name: "Codex", icon: <CodexIcon size={22} color="currentColor" /> };
const opencode = { name: "OpenCode", icon: <OpenCodeIcon size={22} color="currentColor" /> };
const running = (login: Partial<LoginState>): LoginState =>
  ({ id: "login-1", agent: "pi", provider: "github-copilot", type: "oauth", status: "running", events: [], ...login });

/** The sign-in as the server runs it: a browser sign-in shows its page and finishes after a moment, a key is asked for, then saved */
function SignInFlow({ agent, providers: initial }: { agent: { name: string; icon: ReactNode }; providers: AccessProvider[] }) {
  const [open, setOpen] = useState(true);
  const [providers, setProviders] = useState(initial);
  const [login, setLogin] = useState<LoginState>();
  const finish = (provider: string) => {
    setLogin(current => current && { ...current, status: "succeeded" });
    setProviders(list => list.map(item => item.id === provider ? { ...item, status: { configured: true, source: "stored" } } : item));
  };
  const start = (provider: string, type: AuthType) => {
    const id = `login-${Date.now()}`;
    if (type === "api_key") {
      const name = providers.find(item => item.id === provider)?.auth.apiKey?.name ?? "API key";
      setLogin({ id, agent: "pi", provider, type, status: "running", events: [], prompt: { id: "key", type: "secret", message: `Enter your ${name}` } });
      return;
    }
    setLogin({ id, agent: "pi", provider, type, status: "running",
      events: [{ type: "auth_url", url: "https://example.com/oauth/authorize", instructions: "Sign in in the page that opens; this finishes when the page is done." }] });
    setTimeout(() => finish(provider), 2500);
  };
  return <div style={{ minHeight: "100dvh" }}>
    {!open && <button type="button" onClick={() => setOpen(true)} style={{ margin: 24 }}>Sign in…</button>}
    <AgentSignIn open={open} onOpenChange={setOpen} agent={agent} providers={providers} {...(login ? { login } : {})}
      onStart={start}
      onAnswer={() => { setLogin(current => current && { ...current, events: [{ type: "progress", message: "Saving the key…" }] }); setTimeout(() => login && finish(login.provider), 600); }}
      onCancel={() => setLogin(current => current && { ...current, status: "cancelled" })} />
  </div>;
}

const meta = {
  title: "Components/Molecules/Agent sign-in",
  component: AgentSignIn,
  parameters: { layout: "fullscreen" },
  args: { open: true, onOpenChange: () => {}, agent: pi, providers: piProviders, onStart: () => {}, onAnswer: () => {}, onCancel: () => {} },
  decorators: [Story => <div style={{ minHeight: "100dvh" }}><Story /></div>],
} satisfies Meta<typeof AgentSignIn>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Pi's 42 providers: signed-in ones first, a search field, a browser sign-in where the provider has one and an API key */
export const PiProviders: Story = { render: () => <SignInFlow agent={pi} providers={piProviders} /> };
/** Codex signs in to OpenAI only: with ChatGPT or an API key */
export const CodexProviders: Story = { render: () => <SignInFlow agent={codex} providers={codexProviders} /> };
/** OpenCode's 225 providers: any takes an API key, seven sign in in the browser, and a key that needs more is left to its own CLI */
export const OpenCodeProviders: Story = { render: () => <SignInFlow agent={opencode} providers={openCodeProviders} /> };
export const Loading: Story = { args: { providers: [], loading: true } };
export const ProvidersUnavailable: Story = { args: { providers: [], error: "Codex exited before reading the Codex sign-in completed" } };
export const WaitingForTheBrowser: Story = { args: { login: running({ events: [
  { type: "auth_url", url: "https://github.com/login/device", instructions: "Sign in to GitHub in the page that opens." },
  { type: "progress", message: "Waiting for GitHub…" },
] }) } };
export const DeviceCode: Story = { args: { login: running({ events: [
  { type: "device_code", userCode: "WDJB-MJHT", verificationUri: "https://github.com/login/device", expiresInSeconds: 900 },
] }) } };
export const ApiKeyQuestion: Story = { args: { login: running({ provider: "mistral", type: "api_key", prompt: { id: "key", type: "secret", message: "Enter Mistral API key" } }) } };
export const ChoiceQuestion: Story = { args: { login: running({ provider: "github-copilot", prompt: { id: "domain", type: "select", message: "Where is your GitHub account?",
  options: [{ id: "github.com", label: "GitHub.com" }, { id: "enterprise", label: "GitHub Enterprise", description: "your company's own GitHub" }] } }) } };
export const PastedCode: Story = { args: { login: running({ provider: "anthropic", events: [
  { type: "auth_url", url: "https://claude.ai/oauth/authorize", instructions: "Sign in, then paste the code the page shows." },
], prompt: { id: "code", type: "manual_code", message: "Paste the code from the page", placeholder: "code#state" } }) } };
export const SignedIn: Story = { args: { login: running({ status: "succeeded", events: [{ type: "auth_url", url: "https://github.com/login/device" }] }) } };
export const Failed: Story = { args: { agent: codex, providers: codexProviders, login: running({ agent: "codex", provider: "openai", status: "failed",
  events: [{ type: "auth_url", url: "https://auth.openai.com/oauth/authorize" }], error: "Access denied" }) } };

/** An agent signed in to nothing lists no models: the composer offers its sign-in where the model menu would be */
export const ComposerSignInNeeded: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return <div className="mx-auto w-full max-w-xl p-6">
      <Composer tray={false} attachments="unavailable" dictation={false} plugins={false} models={[]} placeholder="Ask your Sensei…"
        agent={{ value: "codex", name: "Codex", icon: CodexIcon }} signInNeeded onSignIn={() => setOpen(true)} />
      <AgentSignIn open={open} onOpenChange={setOpen} agent={codex} providers={codexProviders} onStart={() => {}} onAnswer={() => {}} onCancel={() => {}} />
    </div>;
  },
};
