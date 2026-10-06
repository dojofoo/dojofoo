// Adapted from xevrion/ui-lab's Tree view (MIT, Yash Bavadiya).
// https://github.com/xevrion/ui-lab/blob/main/src/lab/components/tree-view.tsx
// License: ./tree-view.LICENSE
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { ChevronRight, File, Folder } from "@mynaui/icons-react";
import { cn } from "../../lib/utils";
import "./tree-view.css";

export type TreeViewItem = {
  id: string;
  label: string;
  children?: TreeViewItem[];
};
type VisibleItem = { item: TreeViewItem; parent: string | null };

export function visibleTreeItems(
  items: TreeViewItem[],
  expanded: ReadonlySet<string>,
  parent: string | null = null,
): VisibleItem[] {
  return items.flatMap((item) => [
    { item, parent },
    ...(item.children && expanded.has(item.id)
      ? visibleTreeItems(item.children, expanded, item.id)
      : []),
  ]);
}

export type TreeViewProps = {
  items: TreeViewItem[];
  label: string;
  selectedId?: string | null;
  defaultSelectedId?: string;
  expandedIds?: string[];
  defaultExpandedIds?: string[];
  onSelect?: (id: string) => void;
  onExpandedChange?: (ids: string[]) => void;
  renderIcon?: (item: TreeViewItem) => ReactNode;
  renderActions?: (item: TreeViewItem) => ReactNode;
  className?: string;
};

/** Stable IDs are independent of labels, so renaming never changes file identity. */
export function TreeView({
  items,
  label,
  selectedId,
  defaultSelectedId,
  expandedIds,
  defaultExpandedIds = [],
  onSelect,
  onExpandedChange,
  renderIcon,
  renderActions,
  className,
}: TreeViewProps) {
  const groupId = useId();
  const reducedMotion = useReducedMotion();
  const [internalExpanded, setInternalExpanded] = useState(defaultExpandedIds);
  const [internalSelected, setInternalSelected] = useState<string | null>(
    defaultSelectedId ?? null,
  );
  const selected = selectedId === undefined ? internalSelected : selectedId;
  const expanded = useMemo(
    () => new Set(expandedIds ?? internalExpanded),
    [expandedIds, internalExpanded],
  );
  const visible = useMemo(
    () => visibleTreeItems(items, expanded),
    [items, expanded],
  );
  const all = useMemo(() => {
    const result = new Map<string, VisibleItem>();
    const visit = (nodes: TreeViewItem[], parent: string | null) => {
      for (const item of nodes) {
        result.set(item.id, { item, parent });
        if (item.children) visit(item.children, item.id);
      }
    };
    visit(items, null);
    return result;
  }, [items]);
  const [focused, setFocused] = useState<string | null>(
    selected ?? visible[0]?.item.id ?? null,
  );
  const visibleIds = new Set(visible.map(({ item }) => item.id));
  let focusTarget = focused;
  while (focusTarget && !visibleIds.has(focusTarget))
    focusTarget = all.get(focusTarget)?.parent ?? null;
  focusTarget ??= visible[0]?.item.id ?? null;
  const rows = useRef(new Map<string, HTMLLIElement>());
  const typed = useRef("");
  const typeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(typeTimer.current), []);
  useEffect(() => {
    if (
      focused !== focusTarget &&
      document.activeElement === rows.current.get(focused ?? "")
    ) {
      rows.current.get(focusTarget ?? "")?.focus({ preventScroll: true });
    }
  }, [focused, focusTarget]);

  const focus = (id: string, scroll = true) => {
    setFocused(id);
    const row = rows.current.get(id);
    row?.focus({ preventScroll: true });
    if (scroll) row?.firstElementChild?.scrollIntoView({ block: "nearest" });
  };
  const toggle = (id: string, open = !expanded.has(id)) => {
    const next = new Set(expanded);
    if (open) next.add(id);
    else next.delete(id);
    if (expandedIds === undefined) setInternalExpanded([...next]);
    onExpandedChange?.([...next]);
  };
  const activate = (item: TreeViewItem) => {
    if (item.children) toggle(item.id);
    else {
      if (selectedId === undefined) setInternalSelected(item.id);
      onSelect?.(item.id);
    }
  };
  const onKeyDown = (
    event: KeyboardEvent,
    item: TreeViewItem,
    parent: string | null,
  ) => {
    if (event.target !== event.currentTarget) return;
    const index = visible.findIndex((entry) => entry.item.id === item.id);
    const go = (index: number) => {
      const next = visible[index];
      if (next) focus(next.item.id);
    };
    switch (event.key) {
      case "ArrowDown":
        go(index + 1);
        break;
      case "ArrowUp":
        go(index - 1);
        break;
      case "Home":
        go(0);
        break;
      case "End":
        go(visible.length - 1);
        break;
      case "ArrowRight":
        if (item.children) {
          if (!expanded.has(item.id)) toggle(item.id, true);
          else if (item.children.length) go(index + 1);
        }
        break;
      case "ArrowLeft":
        if (item.children && expanded.has(item.id)) toggle(item.id, false);
        else if (parent) focus(parent);
        break;
      case "Enter":
      case " ":
        activate(item);
        break;
      default: {
        if (
          event.key.length !== 1 ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey
        )
          return;
        clearTimeout(typeTimer.current);
        const next = typed.current + event.key.toLowerCase();
        const repeat = [...next].every((letter) => letter === next[0]);
        typed.current = repeat ? next[0] : next;
        typeTimer.current = setTimeout(() => {
          typed.current = "";
        }, 500);
        for (let offset = 0; offset < visible.length; offset++) {
          const candidate =
            visible[(index + (repeat ? 1 : 0) + offset) % visible.length].item;
          if (candidate.label.toLowerCase().startsWith(typed.current)) {
            focus(candidate.id);
            break;
          }
        }
      }
    }
    event.preventDefault();
    event.stopPropagation();
  };
  const render = (
    nodes: TreeViewItem[],
    depth: number,
    parent: string | null,
  ): ReactNode =>
    nodes.map((item) => {
      const open = expanded.has(item.id);
      const folder = item.children !== undefined;
      const isSelected = selected === item.id;
      const labelId = `${groupId}-${item.id}`;
      return (
        <li
          key={item.id}
          role="treeitem"
          aria-labelledby={labelId}
          aria-level={depth + 1}
          aria-expanded={folder ? open : undefined}
          aria-selected={folder ? undefined : isSelected}
          tabIndex={focusTarget === item.id ? 0 : -1}
          ref={(node) => {
            if (node) rows.current.set(item.id, node);
            else rows.current.delete(item.id);
          }}
          onFocus={(event) => {
            if (event.target === event.currentTarget) setFocused(item.id);
          }}
          onKeyDown={(event) => onKeyDown(event, item, parent)}
          className="dojo-tree-item"
        >
          <div
            className={cn(
              "dojo-tree-row group/tree-row",
              isSelected && "text-foreground",
            )}
            style={{ paddingLeft: 16 + depth * 16 }}
          >
            {isSelected && visibleIds.has(item.id) && (
              <motion.span
                aria-hidden="true"
                layoutId="selection"
                initial={false}
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { type: "spring", duration: 0.25, bounce: 0 }
                }
                className="dojo-tree-selection"
              />
            )}
            <button
              type="button"
              tabIndex={-1}
              aria-labelledby={labelId}
              className="dojo-tree-activate"
              onClick={() => {
                focus(item.id, false);
                activate(item);
              }}
            >
              <span className="relative flex size-4 shrink-0 items-center justify-center">
                {folder && (
                  <ChevronRight
                    aria-hidden="true"
                    className={cn(
                      "dojo-tree-chevron size-3.5",
                      open && "rotate-90",
                    )}
                  />
                )}
              </span>
              <span className="relative flex size-4 shrink-0 items-center justify-center text-muted-foreground">
                {renderIcon?.(item) ??
                  (folder ? (
                    <Folder aria-hidden="true" className="size-4" />
                  ) : (
                    <File aria-hidden="true" className="size-4" />
                  ))}
              </span>
              <span
                id={labelId}
                className="relative min-w-0 truncate"
                title={item.label}
              >
                {item.label}
              </span>
            </button>
            {renderActions && (
              <div className="relative shrink-0">{renderActions(item)}</div>
            )}
          </div>
          {item.children && (
            <TreeCollapse open={open} reducedMotion={Boolean(reducedMotion)}>
              <ul role="group" className="relative">
                {render(item.children, depth + 1, item.id)}
                <span
                  aria-hidden="true"
                  className={cn(
                    "dojo-tree-guide",
                    all.get(selected ?? "")?.parent === item.id &&
                      "dojo-tree-guide-active",
                  )}
                  style={{ left: 23.5 + depth * 16 }}
                />
              </ul>
            </TreeCollapse>
          )}
        </li>
      );
    });
  return (
    <LayoutGroup id={groupId}>
      <ul role="tree" aria-label={label} className={cn("dojo-tree", className)}>
        {render(items, 0, null)}
      </ul>
    </LayoutGroup>
  );
}

function TreeCollapse({
  open,
  reducedMotion,
  children,
}: {
  open: boolean;
  reducedMotion: boolean;
  children: ReactNode;
}) {
  const [settled, setSettled] = useState(open);
  return (
    <div
      className="dojo-tree-collapse"
      data-open={open}
      inert={!open}
      aria-hidden={!open}
      onTransitionRun={(event) => {
        if (
          event.target === event.currentTarget &&
          event.propertyName === "grid-template-rows"
        )
          setSettled(false);
      }}
      onTransitionEnd={(event) => {
        if (
          event.target === event.currentTarget &&
          event.propertyName === "grid-template-rows"
        )
          setSettled(open);
      }}
    >
      <div
        className="dojo-tree-children"
        data-settled={open && (settled || reducedMotion)}
      >
        {children}
      </div>
    </div>
  );
}
