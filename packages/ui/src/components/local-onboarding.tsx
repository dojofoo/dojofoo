import type { AgentInstallation } from "@dojofoo/config/agents";
import { useEffect, useState, type ReactNode } from "react";
import { AppShell, ShellStyles } from "@dojofoo/uix/components/app-shell";
import { Button } from "@dojofoo/uix/components/button";
import { BrandLogo } from "@dojofoo/uix/components/brand-logo";
import { AgentSetup, setupSteps, type SetupCourse, type SetupValues } from "@dojofoo/uix/containers/agent-setup";
import { useNavigate } from "@tanstack/react-router";
import { useAccountMenu } from "@/hooks/use-account-menu";
import { dashboardNavigation, dashboardNavigationKey } from "@/lib/dashboard-navigation";
import { DashboardPalette } from "@/components/dashboard-palette";
import { fadeViewTransition } from "@dojofoo/uix/lib/view-transition";

export type LocalSetup = { completed: boolean; workspace: string; agents?: string[]; agent?: string; user: { name: string; email?: string; avatar?: string } };
// Keep the local setup while navigating; refresh it without replacing the page.
let resolvedSetup: LocalSetup | null = null;
async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json();
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return response.json();
}

export function LocalDashboard({ children }: { children: (setup: LocalSetup) => ReactNode }) {
  const [setup, setSetup] = useState<LocalSetup | null>(() => resolvedSetup);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const updateSetup = (next: LocalSetup) => {
    resolvedSetup = next;
    if (setup && setup.completed === next.completed) setSetup(next);
    else fadeViewTransition(() => setSetup(next));
  };
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    json<LocalSetup>("/api/local/setup", { signal: controller.signal })
      .then(next => { if (!disposed) updateSetup(next); })
      .catch(() => { if (!disposed) setError("Couldn’t load your local setup. Try again."); })
      .finally(() => window.clearTimeout(timeout));
    return () => { disposed = true; window.clearTimeout(timeout); controller.abort(); };
  }, [attempt]);
  if (!setup) return <main className="ui-as grid min-h-dvh place-items-center bg-(--panel) text-(--ink)" role={error ? "alert" : "status"} aria-label={error ? "Unable to start Dojo" : "Starting Dojo"} aria-busy={!error}>
    <ShellStyles />
    <div className="flex flex-col items-center gap-6 px-6 text-center">
      <BrandLogo alt="Dojo.foo" className="aspect-[2567/1211] h-8 w-auto" />
      {error && <><p className="m-0 text-sm text-(--muted)">{error}</p><Button onClick={() => { setError(""); setAttempt(value => value + 1); }}>Try again</Button></>}
    </div>
  </main>;
  return setup.completed ? children(setup) : <LocalOnboarding setup={setup} onFinish={updateSetup} />;
}

function LocalOnboarding({ setup, onFinish }: { setup: LocalSetup; onFinish: (setup: LocalSetup) => void }) {
  const { account } = useAccountMenu();
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<number[]>([]);
  const [agents, setAgents] = useState<AgentInstallation[] | null>(null);
  const [courses, setCourses] = useState<SetupCourse[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let disposed = false;
    const refreshAgents = () => {
      json<AgentInstallation[]>("/api/local/agents").then(value => { if (!disposed) setAgents(value); })
        .catch(error => { if (!disposed) setError(error.message); });
    };
    refreshAgents();
    const timer = window.setInterval(refreshAgents, 5000);
    window.addEventListener("focus", refreshAgents);
    json<SetupCourse[]>("/api/local/courses").then(setCourses).catch(error => setError(error.message));
    return () => { disposed = true; window.clearInterval(timer); window.removeEventListener("focus", refreshAgents); };
  }, []);
  const next = () => {
    setDone(previous => [...new Set([...previous, step])]);
    setStep(previous => Math.min(previous + 1, setupSteps.length - 1));
  };
  async function finish(values: SetupValues) {
    setBusy(true);
    setError("");
    try {
      onFinish(await json<LocalSetup>("/api/local/setup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agents: values.agents, courses: values.courses }),
      }));
    } catch (error) { setError(error instanceof Error ? error.message : "Setup failed."); }
    finally { setBusy(false); }
  }
  return <div style={{ height: "100dvh" }}>
    <AppShell {...account} workspace="Dojo" brand={<a href="/" className="flex items-center" aria-label="Dojofoo courses"><BrandLogo className="aspect-[2567/1211] h-6 w-auto" /></a>} user={setup.user} showNews={false}
      sidebarWidth="18rem" setupPinned navigationKey={dashboardNavigationKey} active={[]}
      setup={[{ id: "setup", title: "Set up Dojo", tasks: setupSteps.map((item, index) => ({ id: item.id, label: item.title, done: done.includes(index) })) }]}
      navigation={dashboardNavigation()} onSearch={() => setPaletteOpen(true)}
      onNavigate={id => { if (id === "explore") void navigate({ to: "/explore" }); else if (id === "courses") void navigate({ to: "/" }); }}>
      {error && <p role="alert">{error}</p>}
      <AgentSetup step={step} done={done} courses={courses} onNext={next}
        onBack={() => setStep(previous => Math.max(0, previous - 1))}
        onSkip={() => setStep(previous => Math.min(previous + 1, setupSteps.length - 1))} onFinish={finish}
        local={{ workspace: setup.workspace, agents: agents ?? [], user: setup.user, busy, loadingAgents: agents === null }} />
    </AppShell>
    <DashboardPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
  </div>;
}
