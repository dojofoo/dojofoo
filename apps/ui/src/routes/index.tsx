import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { InferResponseType } from "hono/client";
import { api } from "@/lib/api";
import type { ProjectKata } from "@/server/project/routes";

export const Route = createFileRoute("/")({
  component: Home,
});

type ProjectState = Extract<
  InferResponseType<typeof api.state.$get>,
  { katas: unknown }
>;

const STATE_MARKS: Record<ProjectKata["state"], string> = {
  done: "[x]",
  current: "[>]",
  available: "[ ]",
  locked: "[·]",
};

const STATE_COLORS: Record<ProjectKata["state"], string> = {
  done: "text-emerald-600",
  current: "text-blue-600",
  available: "text-neutral-400",
  locked: "text-neutral-400",
};

function Home() {
  const [state, setState] = useState<ProjectState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.state
      .$get()
      .then(async (res) => {
        const body = await res.json();
        if ("error" in body) throw new Error(String(body.error));
        setState(body);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold">dojo</h1>
        <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">
          Could not read project state: {error}
        </p>
        <p className="mt-2 text-neutral-500">
          Run <code className="rounded bg-neutral-100 px-1">dojo ui</code> from
          a project with a{" "}
          <code className="rounded bg-neutral-100 px-1">.dojorc</code>.
        </p>
      </Shell>
    );
  }

  if (!state) {
    return (
      <Shell>
        <p className="text-neutral-400">loading…</p>
      </Shell>
    );
  }

  if (!state.activeDojo) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold">dojo</h1>
        <p className="mt-4">No dojo is active in this project.</p>
        {state.dojos.length > 0 && (
          <>
            <p className="mt-2 text-neutral-500">Available dojos:</p>
            <ul className="mt-1 list-inside list-disc">
              {state.dojos.map((dojo) => (
                <li key={dojo}>{dojo}</li>
              ))}
            </ul>
            <p className="mt-2 text-neutral-500">
              Start one from your agent session:{" "}
              <code className="rounded bg-neutral-100 px-1">
                dojo kata --start
              </code>
            </p>
          </>
        )}
      </Shell>
    );
  }

  const { activeDojo, summary, katas } = state;
  const pct = summary.total
    ? Math.round((summary.completed / summary.total) * 100)
    : 0;

  return (
    <Shell>
      <h1 className="text-2xl font-bold">{activeDojo.name}</h1>
      {activeDojo.description && (
        <p className="mt-1 text-neutral-600">{activeDojo.description}</p>
      )}
      <p className="mt-3 text-sm text-neutral-500">
        progress: {summary.completed}/{summary.total} ({pct}%)
        {state.currentKata && (
          <>
            {" · current: "}
            <Link
              to="/kata/$name"
              params={{ name: state.currentKata }}
              className="text-blue-600 underline"
            >
              {state.currentKata}
            </Link>
          </>
        )}
      </p>
      <ul className="mt-4 space-y-0.5">
        {katas.map((kata) => (
          <li key={kata.name}>
            <span className={`mr-2 ${STATE_COLORS[kata.state]}`}>
              {STATE_MARKS[kata.state]}
            </span>
            {kata.state === "locked" ? (
              <span
                className="text-neutral-400"
                title={`requires: ${kata.prerequisites.join(", ")}`}
              >
                {kata.title}
              </span>
            ) : (
              <Link
                to="/kata/$name"
                params={{ name: kata.name }}
                className="text-neutral-900 underline decoration-neutral-300 hover:decoration-neutral-900"
              >
                {kata.title}
              </Link>
            )}
            {kata.difficulty && (
              <span className="ml-2 text-neutral-400">
                {"★".repeat(kata.difficulty)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-2xl p-6">{children}</main>;
}
