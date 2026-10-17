export type RunQuestion = {
  title: string;
  options: Array<{ id: string; title: string; description?: string }>;
};

type QuestionHandler = (question: RunQuestion) => Promise<Record<string, string[]>>;
type ContextHandler = () => Promise<unknown> | unknown;
type ShowHandler = (fragmentId: string) => Promise<{ fragmentId: string }> | { fragmentId: string };

type RunHandlers = {
  ask: QuestionHandler;
  context: ContextHandler;
  show: ShowHandler;
  observe?: (input: unknown) => Promise<unknown> | unknown;
};

export class RunCoordinator {
  private readonly runs = new Map<string, RunHandlers>();

  attach(capability: string, handlers: RunHandlers): void {
    this.runs.set(capability, handlers);
  }

  detach(capability: string): void {
    this.runs.delete(capability);
  }

  ask(capability: string, question: RunQuestion): Promise<Record<string, string[]>> {
    const run = this.runs.get(capability);
    if (!run) return Promise.reject(new Error("The lesson run is no longer active"));
    return run.ask(question);
  }

  async context(capability: string): Promise<unknown> {
    const run = this.runs.get(capability);
    if (!run) throw new Error("The lesson run is no longer active");
    return run.context();
  }

  async show(capability: string, fragmentId: string): Promise<{ fragmentId: string }> {
    const run = this.runs.get(capability);
    if (!run) throw new Error("The lesson run is no longer active");
    return run.show(fragmentId);
  }

  async observe(capability: string, input: unknown): Promise<unknown> {
    const run = this.runs.get(capability);
    if (!run) throw new Error("The lesson run is no longer active");
    if (!run.observe) throw new Error("Learning notes are unavailable in this run");
    return run.observe(input);
  }
}

const coordinatorKey = Symbol.for("dojofoo.run-coordinator");
const globalCoordinator = globalThis as typeof globalThis & { [coordinatorKey]?: RunCoordinator };

export const runCoordinator = globalCoordinator[coordinatorKey] ??= new RunCoordinator();
