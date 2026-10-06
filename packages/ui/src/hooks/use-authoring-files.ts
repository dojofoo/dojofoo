import { useEffect, useState } from "react";
import { updateTabs, type TabState } from "../lib/workspace-tabs";

type File = { path: string; content: string; label: string };

export function useAuthoringFiles(files: File[] | undefined) {
  const [tabs, setTabs] = useState<TabState>({ paths: [], active: null });
  const [initialized, setInitialized] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!files) return;
    if (!initialized) {
      const first = files.find((file) => /^(dojo.yaml|dojo.json)$/.test(file.path)) ?? files[0];
      setTabs({ paths: first ? [first.path] : [], active: first?.path ?? null });
      setInitialized(true);
    } else setTabs((current) => current.paths.reduce((state, path) => files.some((file) => file.path === path) ? state : updateTabs(state, { type: "close", path }, "authoring"), current));
  }, [files, initialized]);
  const dirty = (file: File) => drafts[file.path] !== undefined && drafts[file.path] !== file.content;
  const hasUnsaved = files?.some(dirty);
  useEffect(() => {
    if (!hasUnsaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsaved]);
  const activeFile = files?.find((file) => file.path === tabs.active) ?? null;
  return {
    tabs, activeFile, dirty,
    draft: activeFile ? drafts[activeFile.path] ?? activeFile.content : "",
    setDraft: (value: string) => { if (activeFile) setDrafts((current) => ({ ...current, [activeFile.path]: value })); },
    open: (path: string) => setTabs((current) => updateTabs(current, { type: "open", path }, "authoring")),
    close: (path: string) => setTabs((current) => updateTabs(current, { type: "close", path }, "authoring")),
    move: (path: string, index: number) => setTabs((current) => updateTabs(current, { type: "move", path, index }, "authoring")),
    saved: (path: string, value: string) => setDrafts((current) => {
      if (current[path] !== value) return current;
      const next = { ...current }; delete next[path]; return next;
    }),
  };
}
