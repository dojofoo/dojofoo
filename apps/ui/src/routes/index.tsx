import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { ProjectKata, ProjectState } from "@/server/project/routes";

export const Route = createFileRoute("/")({
  component: Home,
});

const STATE_MARKS: Record<ProjectKata["state"], string> = {
  done: "[x]",
  current: "[>]",
  available: "[ ]",
  locked: "[·]",
};

function Home() {
  const [state, setState] = useState<ProjectState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/project/state")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setState(body as ProjectState);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) {
    return (
      <main style={{ padding: "1.5rem", maxWidth: 720, margin: "0 auto" }}>
        <h1>dojo</h1>
        <p style={{ color: "#b00" }}>Could not read project state: {error}</p>
        <p>
          Run <code>dojo ui</code> from a project with a <code>.dojorc</code>.
        </p>
      </main>
    );
  }

  if (!state) {
    return (
      <main style={{ padding: "1.5rem", maxWidth: 720, margin: "0 auto" }}>
        <p>loading…</p>
      </main>
    );
  }

  if (!state.activeDojo) {
    return (
      <main style={{ padding: "1.5rem", maxWidth: 720, margin: "0 auto" }}>
        <h1>dojo</h1>
        <p>No dojo is active in this project.</p>
        {state.dojos.length > 0 && (
          <>
            <p>Available dojos:</p>
            <ul>
              {state.dojos.map((dojo) => (
                <li key={dojo}>{dojo}</li>
              ))}
            </ul>
            <p>
              Start one from your agent session: <code>dojo kata --start</code>
            </p>
          </>
        )}
      </main>
    );
  }

  const { activeDojo, summary, katas } = state;
  const pct = summary.total ? Math.round((summary.completed / summary.total) * 100) : 0;

  return (
    <main style={{ padding: "1.5rem", maxWidth: 720, margin: "0 auto" }}>
      <h1>{activeDojo.name}</h1>
      {activeDojo.description && <p>{activeDojo.description}</p>}
      <p>
        progress: {summary.completed}/{summary.total} ({pct}%)
        {state.currentKata && (
          <>
            {" · current: "}
            <Link to="/kata/$name" params={{ name: state.currentKata }}>
              {state.currentKata}
            </Link>
          </>
        )}
      </p>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {katas.map((kata) => (
          <li key={kata.name} style={{ padding: "0.15rem 0" }}>
            <span
              style={{
                marginRight: "0.5rem",
                color: kata.state === "done" ? "#2a7" : kata.state === "current" ? "#06c" : "#999",
              }}
            >
              {STATE_MARKS[kata.state]}
            </span>
            {kata.state === "locked" ? (
              <span style={{ color: "#999" }} title={`requires: ${kata.prerequisites.join(", ")}`}>
                {kata.title}
              </span>
            ) : (
              <Link to="/kata/$name" params={{ name: kata.name }}>
                {kata.title}
              </Link>
            )}
            {kata.difficulty && (
              <span style={{ color: "#999", marginLeft: "0.5rem" }}>
                {"★".repeat(kata.difficulty)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
