import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { KataBriefing } from "@/server/project/routes";

export const Route = createFileRoute("/kata/$name")({
  component: KataPage,
});

function KataPage() {
  const { name } = Route.useParams();
  const [briefing, setBriefing] = useState<KataBriefing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBriefing(null);
    setError(null);
    fetch(`/api/project/katas/${encodeURIComponent(name)}/briefing`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setBriefing(body as KataBriefing);
      })
      .catch((err: Error) => setError(err.message));
  }, [name]);

  return (
    <main style={{ padding: "1.5rem", maxWidth: 720, margin: "0 auto" }}>
      <p>
        <Link to="/">← back to dojo</Link>
      </p>
      <h1>{name}</h1>
      {error && <p style={{ color: "#b00" }}>{error}</p>}
      {!error && !briefing && <p>loading…</p>}
      {briefing &&
        (briefing.markdown ? (
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              lineHeight: 1.5,
              fontFamily: "inherit",
            }}
          >
            {briefing.markdown}
          </pre>
        ) : (
          <p style={{ color: "#999" }}>No briefing (SENSEI.md) for this kata.</p>
        ))}
    </main>
  );
}
