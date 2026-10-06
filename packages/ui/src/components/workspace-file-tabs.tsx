import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { X } from "@mynaui/icons-react";
import { vercelCursorColors } from "../lib/code-editor-theme";

type Tab = { path: string; label: ReactNode; dirty?: boolean; panelId?: string };
type Props = {
  tabs: Tab[];
  active: string | null;
  label: string;
  surface?: "editor" | "preview";
  onSelect: (path: string) => void;
} & ({ mode: "learning" } | { mode: "authoring"; onClose: (path: string) => void; onMove: (path: string, index: number) => void });

export function WorkspaceFileTabs(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const dragged = useRef<string | null>(null);
  const [insertion, setInsertion] = useState<number | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const clearDrag = () => { dragged.current = null; setDragging(null); setInsertion(null); };
  // Hit-test the gaps, not the tab index: either half of a tab is a drop target.
  const insertionAt = (clientX: number) => {
    const nodes = container.current?.querySelectorAll<HTMLElement>("[data-file-tab]");
    if (!nodes) return 0;
    for (let index = 0; index < nodes.length; index++) {
      const bounds = nodes[index].getBoundingClientRect();
      if (clientX < bounds.left + bounds.width / 2) return index;
    }
    return nodes.length;
  };
  const dragOver = (event: DragEvent<HTMLDivElement>) => {
    if (props.mode !== "authoring" || !dragged.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setInsertion(insertionAt(event.clientX));
  };
  useEffect(() => {
    container.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [props.active, props.tabs.map((tab) => tab.path).join("\0")]);
  return <div ref={container} className="flex min-w-0 flex-1 items-stretch overflow-x-auto" role="tablist" aria-label={props.label}
    onDragOver={dragOver}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setInsertion(null); }}
    onDrop={(event) => {
      if (props.mode !== "authoring" || !dragged.current) return;
      event.preventDefault();
      const source = props.tabs.findIndex((tab) => tab.path === dragged.current);
      const gap = insertionAt(event.clientX);
      // Removing the source shifts every gap to its right one place left.
      if (source >= 0) props.onMove(dragged.current, gap > source ? gap - 1 : gap);
      clearDrag();
    }}>
    {props.tabs.map((tab, index) => {
      const active = props.active === tab.path;
      return <div key={tab.path} data-file-tab={tab.path} className={`group relative flex shrink-0 border-r border-t-2 border-[#242424] text-xs ${active ? "z-10 border-t-[#ededed]" : "border-t-transparent hover:bg-[#ffffff1a]"}`}
        style={{ opacity: dragging === tab.path ? 0.4 : 1, ...(active ? { background: props.surface === "preview" ? "var(--background)" : vercelCursorColors.background } : {}) }}
        draggable={props.mode === "authoring"}
        onDragStart={(event) => { if (props.mode === "authoring") { dragged.current = tab.path; setDragging(tab.path); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", tab.path); } }}
        onDragEnd={clearDrag}>
        {insertion === index || (index === props.tabs.length - 1 && insertion === props.tabs.length)
          ? <span data-testid="tab-insertion-marker" aria-hidden className={`pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-primary ${insertion === index ? "left-0" : "right-0"}`} />
          : null}
        <button type="button" role="tab" aria-selected={active} aria-controls={tab.panelId} title={tab.path}
          tabIndex={active ? 0 : -1} className="flex items-center gap-2 px-4 text-[#a1a1a1] hover:text-[#ededed]"
          onClick={() => props.onSelect(tab.path)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const next = Math.max(0, Math.min(index + (event.key === "ArrowLeft" ? -1 : 1), props.tabs.length - 1));
            if (event.altKey) { if (props.mode === "authoring") props.onMove(tab.path, next); }
            else { props.onSelect(props.tabs[next].path); (container.current?.querySelectorAll('[role="tab"]')[next] as HTMLButtonElement)?.focus(); }
          }}>
          {tab.label}{tab.dirty ? <span aria-label="Unsaved changes" className="size-2 rounded-full bg-[#14cbb7]" /> : null}
        </button>
        {props.mode === "authoring" ? <button type="button" aria-label={`Close ${tab.path}`} title="Close tab (keeps unsaved edits)" className="mr-2 self-center p-1 text-muted-foreground hover:text-foreground" onClick={() => props.onClose(tab.path)}><X aria-hidden className="size-3" /></button> : null}
      </div>;
    })}
  </div>;
}
