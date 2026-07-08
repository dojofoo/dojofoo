import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
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
    api.katas[":name"].briefing
      .$get({ param: { name } })
      .then(async (res) => {
        const body = await res.json();
        if ("error" in body) throw new Error(body.error);
        setBriefing(body);
      })
      .catch((err: Error) => setError(err.message));
  }, [name]);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <p>
        <Link to="/" className="text-blue-600 underline">
          ← back to dojo
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold">{name}</h1>
      {error && (
        <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">
          {error}
        </p>
      )}
      {!error && !briefing && <p className="mt-4 text-neutral-400">loading…</p>}
      {briefing &&
        (briefing.markdown ? (
          <pre className="mt-4 whitespace-pre-wrap break-words font-mono leading-relaxed">
            {briefing.markdown}
          </pre>
        ) : (
          <p className="mt-4 text-neutral-400">No briefing for this kata.</p>
        ))}
    </main>
  );
}
