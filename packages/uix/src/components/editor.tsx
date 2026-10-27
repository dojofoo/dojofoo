import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { CloseRegular } from "@mingcute/react/core-regular";
import type { EditorAppearance } from "../lib/editor-appearance";

/* ---------- Frame ---------- */

export function EditorFrame({ tabs, actions, status, flush, children, className, appearance }: {
  /** The file tabs row, usually EditorTabs */
  tabs?: ReactNode;
  /** Lesson/file actions; moves below the tabs when the editor is narrow. */
  actions?: ReactNode;
  /** A quiet status line along the foot, e.g. EditorStatus for a lesson's tests */
  status?: ReactNode;
  /** Part of the surrounding UI instead of a card: no corners, edge or shadow */
  flush?: boolean;
  /** The code surface, usually CodeEditor */
  children: ReactNode;
  className?: string;
  appearance: EditorAppearance;
}) {
  // The tab bar belongs to the window, in the page's mode; the code, its status line and the open tab belong to the
  // color scheme – an island of its mode (dark on a light page, light on a dark one), painted with its background and
  // line highlight blended with the theme (see the styles)
  const scheme = appearance;
  return (
    <section className={["ui-ed", className].filter(Boolean).join(" ")} data-flush={flush || undefined} data-line={scheme.line ? "" : undefined} data-line-border={scheme.lineBorder ? "" : undefined} style={scheme.style}>
      {(tabs || actions) && <div className="ui-ed__tabs" data-actions={actions ? "" : undefined}>{tabs}{actions && <div className="ui-ed__actions">{actions}</div>}</div>}
      <div className={`ui-ed__body ui-ed__scheme ${scheme.type}`}>{children}</div>
      {status && <footer className={`ui-ed__status ui-ed__scheme ${scheme.type}`}>{status}</footer>}
    </section>
  );
}

/** How a file's tests stand: a dot (green all, yellow some, red none) and "passed/total tests passed" */
export function EditorStatus({ passed, total, label = "tests passed" }: { passed: number; total: number; label?: string }) {
  const state = total > 0 && passed === total ? "pass" : passed > 0 ? "partial" : "fail";
  return (
    <span className="ui-ed__tests" data-state={state} role="status">
      <span className="ui-ed__dot" aria-hidden="true" />
      <b>{passed}/{total}</b> {label}
    </span>
  );
}

/* ---------- Tabs ---------- */

type Tab = { path: string; label: ReactNode; dirty?: boolean; panelId?: string };
export type EditorTabsProps = {
  tabs: Tab[];
  active: string | null;
  label: string;
  onSelect: (path: string) => void;
} & ({ mode: "learning" } | { mode: "authoring"; onClose: (path: string) => void; onMove: (path: string, index: number) => void });

export function EditorTabs(props: EditorTabsProps & { scheme: { type: "light" | "dark" } }) {
  // The open tab is part of the code below it: the color scheme's island, like the editor's body
  const scheme = props.scheme;
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
  return <div ref={container} className="ui-ed__tablist scroll-fade-x" role="tablist" aria-label={props.label}
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
      return <div key={tab.path} data-file-tab={tab.path} className={active ? `ui-ed__tab ui-ed__scheme ${scheme.type}` : "ui-ed__tab"} data-active={active || undefined} data-dragging={dragging === tab.path || undefined}
        draggable={props.mode === "authoring"}
        onDragStart={(event) => { if (props.mode === "authoring") { dragged.current = tab.path; setDragging(tab.path); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", tab.path); } }}
        onDragEnd={clearDrag}>
        {insertion === index || (index === props.tabs.length - 1 && insertion === props.tabs.length)
          ? <span data-testid="tab-insertion-marker" aria-hidden className="ui-ed__marker" data-side={insertion === index ? "start" : "end"} />
          : null}
        <button type="button" role="tab" aria-selected={active} aria-controls={tab.panelId} title={tab.path}
          tabIndex={active ? 0 : -1} className="ui-ed__tab-label"
          onClick={() => props.onSelect(tab.path)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const next = Math.max(0, Math.min(index + (event.key === "ArrowLeft" ? -1 : 1), props.tabs.length - 1));
            if (event.altKey) { if (props.mode === "authoring") props.onMove(tab.path, next); }
            else { props.onSelect(props.tabs[next].path); (container.current?.querySelectorAll('[role="tab"]')[next] as HTMLButtonElement)?.focus(); }
          }}>
          {tab.label}{tab.dirty ? <span className="sr-only">, unsaved changes</span> : null}
        </button>
        {/* Unsaved changes show as a dot where the close button sits, VS Code's way – it turns back into the close
            button while the pointer is on the tab. Learning tabs have no close button, so the dot sits there alone */}
        {props.mode === "authoring"
          ? <button type="button" aria-label={`Close ${tab.path}`} title="Close tab (keeps unsaved edits)" className="ui-ed__close" data-dirty={tab.dirty || undefined} onClick={() => props.onClose(tab.path)}>
            <CloseRegular size={12} aria-hidden /><span className="ui-ed__dirty" aria-hidden />
          </button>
          : tab.dirty ? <span className="ui-ed__close" data-dirty data-static aria-hidden><span className="ui-ed__dirty" /></span> : null}
      </div>;
    })}
  </div>;
}
