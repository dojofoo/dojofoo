'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../../../lib/utils';
import { ChevronIcon } from '../../../lib/creance/icons';

export interface FileNode {
  id: string;
  name: string;
  /** Explicit ordering for semantic rows, such as chapters and lessons. */
  marker?: string;
  icon?: ReactNode;
  muted?: boolean;
  adornment?: ReactNode;
  /** Present for folders, even when empty. */
  children?: FileNode[];
  /** A short change marker: M modified, A added, D deleted. */
  status?: 'M' | 'A' | 'D';
}

export interface FileTreeProps {
  nodes: FileNode[];
  /** Names the tree, such as "Changed files". */
  label: string;
  defaultExpanded?: string[];
  selected?: string | null;
  onSelect?: (node: FileNode) => void;
  className?: string;
  renderActions?: (node: FileNode, actions: { rename: () => void }) => ReactNode;
  canRename?: (node: FileNode) => boolean;
  onRename?: (node: FileNode, title: string) => void;
}

const statusWords = { M: 'modified', A: 'added', D: 'deleted' };

interface Row {
  node: FileNode;
  level: number;
  parent: string | null;
}

/**
 * Files and folders as an ARIA tree. Up and Down move, Right opens a folder or steps in, Left closes
 * it or steps out, Home and End jump, Enter selects. One stop in the tab order.
 */
export function FileTree({ nodes, label, defaultExpanded = [], selected, onSelect, className, renderActions, canRename, onRename }: FileTreeProps) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [expanded, setExpanded] = useState(() => new Set(defaultExpanded));
  const [ownSelected, setOwnSelected] = useState<string | null>(null);
  const current = selected === undefined ? ownSelected : selected;
  const [focused, setFocused] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLLIElement>());
  const pendingToggle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (pendingToggle.current) clearTimeout(pendingToggle.current); }, []);

  // The rows a person can see, in order: what the arrow keys walk.
  const rows = useMemo(() => {
    const out: Row[] = [];
    const walk = (list: FileNode[], level: number, parent: string | null) =>
      list.forEach((node) => {
        out.push({ node, level, parent });
        if (node.children && expanded.has(node.id)) walk(node.children, level + 1, node.id);
      });
    walk(nodes, 1, null);
    return out;
  }, [nodes, expanded]);

  // Reveal a newly opened file without replacing the reader’s other expansion choices.
  useEffect(() => {
    if (!current) return;
    const ancestors = (list: FileNode[], path: string[] = []): string[] | undefined => {
      for (const node of list) {
        if (node.id === current) return path;
        const found = node.children && ancestors(node.children, [...path, node.id]);
        if (found) return found;
      }
    };
    const path = ancestors(nodes);
    if (path?.length) setExpanded(previous => path.every(id => previous.has(id)) ? previous : new Set([...previous, ...path]));
  }, [current]);

  const active = focused ?? current ?? rows[0]?.node.id ?? null;
  const focus = (id: string, reveal = false) => {
    setFocused(id);
    const element = refs.current.get(id);
    element?.focus({ preventScroll: true });
    if (reveal) element?.firstElementChild?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const toggle = (id: string, open?: boolean) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });
  const select = (node: FileNode) => {
    if (selected === undefined) setOwnSelected(node.id);
    onSelect?.(node);
  };

  const rename = (node: FileNode) => {
    if (!onRename || !canRename?.(node)) return;
    setDraftName(node.name); setRenaming(node.id);
  };
  const commitRename = (node: FileNode) => {
    const title = draftName.trim();
    if (title && title !== node.name) onRename?.(node, title);
    setRenaming(null);
  };

  const onKeyDown = (e: KeyboardEvent, row: Row, index: number) => {
    const { node } = row;
    const folder = !!node.children;
    const open = expanded.has(node.id);
    const revealFocus = (id: string) => focus(id, true);
    const go: Record<string, () => void> = {
      ArrowDown: () => rows[index + 1] && revealFocus(rows[index + 1]!.node.id),
      ArrowUp: () => rows[index - 1] && revealFocus(rows[index - 1]!.node.id),
      Home: () => revealFocus(rows[0]!.node.id),
      End: () => revealFocus(rows[rows.length - 1]!.node.id),
      ArrowRight: () => (folder && !open ? toggle(node.id, true) : folder && node.children!.length ? revealFocus(node.children![0]!.id) : undefined),
      ArrowLeft: () => (folder && open ? toggle(node.id, false) : row.parent ? revealFocus(row.parent) : undefined),
      Enter: () => (folder ? toggle(node.id) : select(node)),
      ' ': () => (folder ? toggle(node.id) : select(node)),
    };
    if (go[e.key]) {
      e.preventDefault();
      e.stopPropagation();
      go[e.key]!();
    }
  };

  const render = (list: FileNode[]): ReactNode =>
    list.map((node) => {
      const index = rows.findIndex((r) => r.node.id === node.id);
      const row = rows[index]!;
      const folder = !!node.children;
      const open = expanded.has(node.id);
      return (
        <li
          key={node.id}
          ref={(el) => {
            if (el) refs.current.set(node.id, el);
            else refs.current.delete(node.id);
          }}
          role="treeitem"
          aria-label={node.name}
          aria-level={row.level}
          aria-expanded={folder ? open : undefined}
          aria-selected={folder ? undefined : node.id === current}
          tabIndex={node.id === active ? 0 : -1}
          className="rounded-md outline-none! [&:focus-visible>div:first-child]:outline [&:focus-visible>div:first-child]:outline-(--focus-ring) [&:focus-visible>div:first-child]:outline-offset-[-1px]"
          onKeyDown={(e) => onKeyDown(e, row, index)}
          onFocus={(e) => e.target === e.currentTarget && setFocused(node.id)}
        >
          {/* The row is drawn by this div; the li carries the tree semantics and focus. */}
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div
            className={cn("group/tree-row flex h-8 cursor-pointer items-center gap-2 rounded-md pr-0 text-(--fluid-muted) hover:bg-(--fluid-hover) hover:text-(--fluid-foreground)", !folder && node.id === current && "bg-(--fluid-active) text-(--fluid-foreground)", node.muted && "opacity-50 grayscale")}
            style={{ paddingInlineStart: `${(row.level - 1) * 20 + 10}px` }}
            onDoubleClick={event => {
              event.stopPropagation();
              if (pendingToggle.current) clearTimeout(pendingToggle.current);
              rename(node);
            }}
            onClick={event => {
              if (renaming === node.id) return;
              focus(node.id);
              if (folder) {
                // A collapse can move the row under the pointer. Keep it in place until
                // a possible second click has had time to start inline renaming.
                if (canRename?.(node)) {
                  if (pendingToggle.current) clearTimeout(pendingToggle.current);
                  if (event.detail < 2) pendingToggle.current = setTimeout(() => toggle(node.id), 300);
                } else toggle(node.id);
              } else select(node);
            }}
          >
            <span className="flex w-3 shrink-0 text-xs text-(--fluid-muted) [&_svg]:block" aria-hidden="true">
              {folder && <ChevronIcon className={cn("transition-transform duration-80 motion-reduce:transition-none", open && "rotate-90")} />}
            </span>
            <span className="w-4 shrink-0 text-center text-[11px] tabular-nums text-(--fluid-muted)" aria-hidden="true">{node.marker ?? node.icon}</span>
            {renaming === node.id ? <input aria-label={`Rename ${node.name}`} value={draftName}
              className="h-6 min-w-0 flex-1 rounded-sm border border-(--focus-ring) bg-(--surface-3) px-1 text-(length:--fs-body) text-(--fluid-foreground) outline-none"
              ref={element => { if (element && document.activeElement !== element) { element.focus({ preventScroll: true }); element.select(); } }}
              onChange={event => setDraftName(event.target.value)} onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
              onBlur={() => commitRename(node)} onKeyDown={event => {
                event.stopPropagation();
                if (event.key === 'Enter') { event.preventDefault(); commitRename(node); }
                if (event.key === 'Escape') { event.preventDefault(); setRenaming(null); }
              }} /> : <span className="min-w-0 flex-1 truncate text-(length:--fs-body)">{node.name}</span>}
            {node.adornment}
            {node.status && (
              <>
                <span className={cn("text-(length:--fs-caption) font-medium", node.status === 'D' && "text-(--danger)")} aria-hidden="true" data-status={node.status}>
                  {node.status}
                </span>
                <span className="sr-only">, {statusWords[node.status]}</span>
              </>
            )}
            {renderActions && <span className="shrink-0 opacity-0 group-hover/tree-row:opacity-100 group-focus-within/tree-row:opacity-100 has-[button[aria-expanded=true]]:opacity-100" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>{renderActions(node, { rename: () => rename(node) })}</span>}
          </div>
          {folder && open && node.children!.length > 0 && <ul role="group">{render(node.children!)}</ul>}
        </li>
      );
    });

  return (
    <ul role="tree" aria-label={label} className={cn("m-0 list-none p-0 [overflow-anchor:none] font-(family-name:--font) text-(length:--fs-body) text-(--fluid-foreground) [&_ul]:m-0 [&_ul]:list-none [&_ul]:p-0", className)}>
      {render(nodes)}
    </ul>
  );
}
