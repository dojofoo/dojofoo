const key = (workspaceId: string) => `dojofoo.authoring.session.${workspaceId}`;

/** A browser bookmark of an Eve-owned session, never a second conversation store. */
export function rememberAuthoringSession(workspaceId: string, sessionId: string): void {
  try { window.localStorage.setItem(key(workspaceId), sessionId); }
  catch { /* The accepted session URL remains usable without browser storage. */ }
}

export function authoringSessionSearch(workspaceId: string): { workspace: string; session?: string } {
  try {
    const sessionId = window.localStorage.getItem(key(workspaceId));
    if (sessionId) return { workspace: workspaceId, session: sessionId };
  } catch { /* Server rendering and private storage retain the workspace route. */ }
  return { workspace: workspaceId };
}

export function authoringSessionLink(workspaceId: string): string {
  const saved = authoringSessionSearch(workspaceId);
  const search = new URLSearchParams({ workspace: saved.workspace });
  if (saved.session) search.set("session", saved.session);
  return `/authoring?${search}`;
}
