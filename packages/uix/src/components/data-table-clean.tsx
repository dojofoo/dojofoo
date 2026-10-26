"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode, type RefObject } from "react";

/*
 * Data Table (Clean) – a database-style table that works like a small spreadsheet, in a single self-contained file.
 * Clean style: no tray – one white card with hairline shadows; title, table and actions all sit inside it,
 * quiet gray type, hairline row dividers, tinted tags and a soft blue fill for selections.
 * Select a cell or a range, edit in place, copy and paste with Excel or Sheets, undo, sort, and check rows.
 * The styles are injected below, so no extra files are needed.
 */

export type DataColumn = {
  key: string;
  label: string;
  icon?: ReactNode;
  /** title: logo and name · tag: colored pill with a picker · link: underlined URL · number · text */
  type?: "title" | "tag" | "link" | "number" | "text";
  /** Column width, any CSS length */
  width?: string;
  /** false makes the column read only – edits, pastes and clears skip it */
  editable?: boolean;
  /** Choices for a tag column – defaults to the tags already in the column */
  options?: string[];
};

export type DataRow = {
  id: string;
  /** Small logo in front of the title cell */
  logo?: ReactNode;
  [key: string]: ReactNode;
};

export type TagTone = "blue" | "violet" | "pink" | "green" | "amber" | "gray";

export type DataTableProps = {
  title: string;
  /** Hide table chrome for embedded, read-only views such as test output. */
  header?: boolean;
  footer?: boolean;
  columnHeaders?: boolean;
  /** Replace row-selection checkboxes with domain-specific status marks. */
  rowControl?: (row: DataRow) => ReactNode;
  renderCell?: (row: DataRow, column: DataColumn) => ReactNode;
  /** Icon in front of the title */
  icon?: ReactNode;
  columns: DataColumn[];
  rows: DataRow[];
  /** Tag colors by tag text – falls back to blue */
  tagTones?: Record<string, TagTone>;
  /** false turns the table read only (selection and copy still work) */
  editable?: boolean;
  /** Called with all rows after every edit, paste, clear, delete, undo or redo */
  onRowsChange?: (rows: DataRow[]) => void;
  onSelectionChange?: (ids: string[]) => void;
  className?: string;
};

type Cell = { r: number; c: number };
type Sort = { key: string; dir: "asc" | "desc" } | null;

const text = (v: ReactNode) => (typeof v === "string" || typeof v === "number" ? String(v) : "");
const letter = (c: number) => String.fromCharCode(65 + (c % 26));
const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Reads typed or pasted text for a column: numbers accept commas, spaces and currency signs */
function parse(value: string, column: DataColumn): string | number {
  const v = value.trim();
  if (column.type !== "number") return v;
  if (v === "") return "";
  const n = Number(v.replace(/[^\d.,-]/g, "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : v;
}

export function DataTable({
  title,
  header = true,
  footer = true,
  columnHeaders = true,
  rowControl,
  renderCell,
  icon,
  columns,
  rows: initialRows,
  tagTones = {},
  editable = true,
  onRowsChange,
  onSelectionChange,
  className,
}: DataTableProps) {
  const [rows, setRowsState] = useState(initialRows);
  useEffect(() => { if (!editable) setRowsState(initialRows); }, [initialRows, editable]);
  const history = useRef<{ past: DataRow[][]; future: DataRow[][] }>({ past: [], future: [] });
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<Sort>(null);
  const [active, setActiveState] = useState<Cell | null>(null);
  const [anchor, setAnchorState] = useState<Cell | null>(null);
  // The latest selection, readable right away – key presses can arrive faster than React re-renders
  const sel = useRef<{ active: Cell | null; anchor: Cell | null }>({ active: null, anchor: null });
  const setActive = (cell: Cell | null) => {
    sel.current.active = cell;
    setActiveState(cell);
  };
  const setAnchor = (cell: Cell | null) => {
    sel.current.anchor = cell;
    setAnchorState(cell);
  };
  const [editing, setEditing] = useState<{ cell: Cell; value: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [, force] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const morphRef = useSmoothHeight(gridRef);
  const added = useRef(0);

  // Rows as shown: sorted copy of the data, positions refer to this order
  const view = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      if (text(x) === "") return 1;
      if (text(y) === "") return -1;
      if (col?.type === "number") return (Number(x) - Number(y)) * dir;
      return text(x).localeCompare(text(y), undefined, { numeric: true }) * dir;
    });
  }, [rows, sort, columns]);

  const canEdit = (c: number) => editable && columns[c]?.editable !== false;

  /** Every data change goes through here so it can be undone */
  const commitRows = (next: DataRow[]) => {
    history.current.past.push(rows);
    if (history.current.past.length > 100) history.current.past.shift();
    history.current.future = [];
    setRowsState(next);
    onRowsChange?.(next);
  };
  const undo = () => {
    const prev = history.current.past.pop();
    if (!prev) return;
    history.current.future.push(rows);
    setRowsState(prev);
    onRowsChange?.(prev);
  };
  const redo = () => {
    const next = history.current.future.pop();
    if (!next) return;
    history.current.past.push(rows);
    setRowsState(next);
    onRowsChange?.(next);
  };

  const range = useMemo(() => {
    if (!active) return null;
    const a = anchor ?? active;
    return {
      r1: Math.min(a.r, active.r),
      r2: Math.max(a.r, active.r),
      c1: Math.min(a.c, active.c),
      c2: Math.max(a.c, active.c),
    };
  }, [active, anchor]);
  const inRange = (r: number, c: number) => !!range && r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2;

  /** Write values into a block of cells, starting at a cell – used by edit, paste and clear */
  const writeBlock = (start: Cell, matrix: string[][]) => {
    const updates = new Map<string, Record<string, string | number>>();
    matrix.forEach((line, dr) =>
      line.forEach((value, dc) => {
        const row = view[start.r + dr];
        const c = start.c + dc;
        const col = columns[c];
        if (!row || !col || !canEdit(c)) return;
        updates.set(row.id, { ...updates.get(row.id), [col.key]: parse(value, col) });
      }),
    );
    if (updates.size) commitRows(rows.map((row) => (updates.has(row.id) ? { ...row, ...updates.get(row.id) } : row)));
  };

  const select = (cell: Cell, extend = false) => {
    const r = Math.max(0, Math.min(view.length - 1, cell.r));
    const c = Math.max(0, Math.min(columns.length - 1, cell.c));
    if (!extend) setAnchor(null);
    else if (!sel.current.anchor) setAnchor(sel.current.active ?? { r, c });
    setActive({ r, c });
  };

  const startEdit = (cell: Cell, initial?: string) => {
    if (!canEdit(cell.c) || !view[cell.r]) return;
    setEditing({ cell, value: initial ?? text(view[cell.r][columns[cell.c].key]) });
  };
  const finishEdit = (save: boolean, move?: Cell, picked?: string) => {
    if (editing && save) {
      const value = picked ?? editing.value;
      const current = text(view[editing.cell.r]?.[columns[editing.cell.c].key]);
      if (value !== current) writeBlock(editing.cell, [[value]]);
    }
    setEditing(null);
    if (move) select(move);
    requestAnimationFrame(() => gridRef.current?.focus({ preventScroll: true }));
  };

  // Keep the active cell in view while moving with the keyboard
  useEffect(() => {
    if (!active) return;
    gridRef.current
      ?.querySelector(`[data-cell="${active.r}-${active.c}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  // A drag selection ends wherever the pointer is released
  useEffect(() => {
    if (!dragging) return;
    const stop = () => setDragging(false);
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, [dragging]);

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("button, a")) return;
    if (editing) return;
    const mod = isMac() ? e.metaKey : e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      return e.shiftKey ? redo() : undo();
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      return redo();
    }
    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setAnchor({ r: 0, c: 0 });
      setActive({ r: view.length - 1, c: columns.length - 1 });
      return;
    }
    const current = sel.current.active;
    if (!current) {
      if (e.key.startsWith("Arrow") || e.key === "Enter") {
        e.preventDefault();
        select({ r: 0, c: 0 });
      }
      return;
    }
    const { r, c } = current;
    const jump = mod;
    const moves: Record<string, Cell> = {
      ArrowUp: { r: jump ? 0 : r - 1, c },
      ArrowDown: { r: jump ? view.length - 1 : r + 1, c },
      ArrowLeft: { r, c: jump ? 0 : c - 1 },
      ArrowRight: { r, c: jump ? columns.length - 1 : c + 1 },
      Home: { r: mod ? 0 : r, c: 0 },
      End: { r: mod ? view.length - 1 : r, c: columns.length - 1 },
    };
    if (moves[e.key]) {
      e.preventDefault();
      return select(moves[e.key], e.shiftKey);
    }
    if (e.key === "Tab") {
      e.preventDefault();
      return select({ r, c: c + (e.shiftKey ? -1 : 1) });
    }
    if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      return startEdit(current);
    }
    if (e.key === "Escape") return setAnchor(null);
    if ((e.key === "Delete" || e.key === "Backspace") && range) {
      e.preventDefault();
      const blank = Array.from({ length: range.r2 - range.r1 + 1 }, () =>
        Array.from({ length: range.c2 - range.c1 + 1 }, () => ""),
      );
      return writeBlock({ r: range.r1, c: range.c1 }, blank);
    }
    // Typing a character starts editing with it, like a spreadsheet
    if (e.key.length === 1 && !mod && !e.altKey && columns[c].type !== "tag") {
      e.preventDefault();
      startEdit(current, e.key);
    }
  };

  // Clipboard: tab separated values, the format Excel and Google Sheets use
  const rangeText = () => {
    if (!range) return "";
    return view
      .slice(range.r1, range.r2 + 1)
      .map((row) =>
        columns
          .slice(range.c1, range.c2 + 1)
          .map((col) => text(row[col.key]).replace(/[\t\n]/g, " "))
          .join("\t"),
      )
      .join("\n");
  };
  const onCopy = (e: ClipboardEvent) => {
    if (editing || !range) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", rangeText());
  };
  const onCut = (e: ClipboardEvent) => {
    if (editing || !range) return;
    onCopy(e);
    const blank = Array.from({ length: range.r2 - range.r1 + 1 }, () =>
      Array.from({ length: range.c2 - range.c1 + 1 }, () => ""),
    );
    writeBlock({ r: range.r1, c: range.c1 }, blank);
  };
  const onPaste = (e: ClipboardEvent) => {
    if (editing || !active) return;
    e.preventDefault();
    const raw = e.clipboardData.getData("text/plain").replace(/\r/g, "").replace(/\n$/, "");
    if (!raw) return;
    const matrix = raw.split("\n").map((line) => line.split("\t"));
    // One value pasted into a range fills the whole range
    if (matrix.length === 1 && matrix[0].length === 1 && range) {
      const fill = Array.from({ length: range.r2 - range.r1 + 1 }, () =>
        Array.from({ length: range.c2 - range.c1 + 1 }, () => matrix[0][0]),
      );
      return writeBlock({ r: range.r1, c: range.c1 }, fill);
    }
    writeBlock(range ? { r: range.r1, c: range.c1 } : active, matrix);
  };

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));

  const updateChecked = (next: Set<string>) => {
    setChecked(next);
    onSelectionChange?.(rows.filter((r) => next.has(r.id)).map((r) => r.id));
  };
  const all = view.length > 0 && checked.size === view.length;
  const some = checked.size > 0 && !all;

  const addRow = () => {
    added.current += 1;
    const key = columns.find((c) => c.type === "title")?.key ?? columns[0].key;
    const row: DataRow = { id: `new-${added.current}`, [key]: "" };
    commitRows([...rows, row]);
    setSort(null);
    const cell = { r: rows.length, c: Math.max(0, columns.findIndex((c) => c.key === key)) };
    setActive(cell);
    setAnchor(null);
    setEditing({ cell, value: "" });
  };

  const deleteChecked = () => {
    commitRows(rows.filter((r) => !checked.has(r.id)));
    updateChecked(new Set());
    setActive(null);
    setAnchor(null);
  };

  const tagOptions = (col: DataColumn) =>
    col.options ?? [...new Set(rows.map((r) => text(r[col.key])).filter(Boolean))];

  // Footer summary: the active cell, or count and sum for a range – like the status bar of a spreadsheet
  const summary = (() => {
    if (!range || !active) return null;
    const cells = (range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1);
    if (cells === 1) return `${letter(active.c)}${active.r + 1}`;
    let filled = 0;
    let sum = 0;
    let numeric = false;
    for (let r = range.r1; r <= range.r2; r++)
      for (let c = range.c1; c <= range.c2; c++) {
        const v = view[r]?.[columns[c].key];
        if (text(v) !== "") filled++;
        if (columns[c].type === "number" && typeof v === "number") {
          numeric = true;
          sum += v;
        }
      }
    return `${filled} ${filled === 1 ? "value" : "values"}${numeric ? ` · Sum ${sum.toLocaleString("en-US")}` : ""}`;
  })();

  const mod = isMac() ? "⌘" : "Ctrl";

  return (
    <>
      <style href="ui-data-table-clean" precedence="default">
        {css}
      </style>
      <section className={["ui-dtc", className].filter(Boolean).join(" ")} aria-label={title}>
        {header && <header className="ui-dtc__head">
          {icon && <span className="ui-dtc__title-icon">{icon}</span>}
          <h3 className="ui-dtc__title">{title}</h3>
          {editable && (
            <div className="ui-dtc__tools">
              <button
                type="button"
                className="ui-dtc__tool"
                aria-label={`Undo (${mod} Z)`}
                title={`Undo · ${mod} Z`}
                disabled={!history.current.past.length}
                onClick={() => {
                  undo();
                  force((n) => n + 1);
                }}
              >
                <UndoIcon />
              </button>
              <button
                type="button"
                className="ui-dtc__tool"
                aria-label={`Redo (${mod} Shift Z)`}
                title={`Redo · ${mod} ⇧ Z`}
                disabled={!history.current.future.length}
                onClick={() => {
                  redo();
                  force((n) => n + 1);
                }}
              >
                <RedoIcon />
              </button>
            </div>
          )}
        </header>}

        <div className="ui-dtc__body">
          <div className="ui-dtc__morph" ref={morphRef}>
          <div
            ref={gridRef}
            className="ui-dtc__scroll"
            role="grid"
            aria-label={title}
            aria-rowcount={view.length + (columnHeaders ? 1 : 0)}
            aria-multiselectable="true"
            tabIndex={0}
            onKeyDown={onKeyDown}
            onCopy={onCopy}
            onCut={onCut}
            onPaste={onPaste}
            data-dragging={dragging || undefined}
          >
            <table className="ui-dtc__table" role="presentation">
              <colgroup>
                <col style={{ width: 40 }} />
                {columns.map((c) => (
                  <col key={c.key} style={c.width ? { width: c.width } : undefined} />
                ))}
              </colgroup>
              {columnHeaders && <thead>
                <tr role="row">
                  <th className="ui-dtc__select" role="columnheader">
                    <Checkbox
                      checked={all}
                      mixed={some}
                      label="Select all rows"
                      onChange={() => updateChecked(all ? new Set() : new Set(view.map((r) => r.id)))}
                    />
                  </th>
                  {columns.map((col, c) => {
                    const dir = sort?.key === col.key ? sort.dir : null;
                    return (
                      <th
                        key={col.key}
                        role="columnheader"
                        aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}
                        data-type={col.type}
                        data-col-active={(range && c >= range.c1 && c <= range.c2) || undefined}
                      >
                        <button type="button" className="ui-dtc__th" onClick={() => toggleSort(col.key)}>
                          {col.icon && <span className="ui-dtc__col-icon">{col.icon}</span>}
                          <span className="ui-dtc__th-label">{col.label}</span>
                          <span className="ui-dtc__sort" data-dir={dir ?? undefined} aria-hidden="true">
                            <SortIcon />
                          </span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>}
              <tbody>
                {view.map((row, r) => {
                  const isChecked = checked.has(row.id);
                  return (
                    <tr key={row.id} role="row" data-selected={isChecked || undefined}>
                      <td className="ui-dtc__select" role="gridcell">
                        {rowControl ? rowControl(row) : <Checkbox
                          checked={isChecked}
                          label={`Select ${text(row[columns.find((x) => x.type === "title")?.key ?? columns[0].key]) || "row"}`}
                          onChange={() => {
                            const next = new Set(checked);
                            if (next.has(row.id)) next.delete(row.id);
                            else next.add(row.id);
                            updateChecked(next);
                          }}
                        />}
                      </td>
                      {columns.map((col, c) => {
                        const isActive = active?.r === r && active?.c === c;
                        const isEditing = editing?.cell.r === r && editing?.cell.c === c;
                        return (
                          <td
                            key={col.key}
                            role="gridcell"
                            data-cell={`${r}-${c}`}
                            data-type={col.type}
                            data-active={isActive || undefined}
                            data-in-range={(inRange(r, c) && !isActive) || undefined}
                            data-editing={isEditing || undefined}
                            aria-selected={inRange(r, c)}
                            aria-readonly={!canEdit(c) || undefined}
                            onPointerDown={(e) => {
                              if (isEditing || e.button !== 0) return;
                              if ((e.target as HTMLElement).closest("a, button, pre")) return;
                              e.preventDefault();
                              gridRef.current?.focus({ preventScroll: true });
                              if (editing) finishEdit(true);
                              select({ r, c }, e.shiftKey);
                              setDragging(true);
                            }}
                            onPointerEnter={() => {
                              if (!dragging) return;
                              if (!sel.current.anchor) setAnchor(sel.current.active);
                              setActive({ r, c });
                            }}
                            onDoubleClick={() => startEdit({ r, c })}
                          >
                            {isEditing && editing ? (
                              <Editor
                                column={col}
                                value={editing.value}
                                options={col.type === "tag" ? tagOptions(col) : undefined}
                                tones={tagTones}
                                onChange={(value) => setEditing({ cell: editing.cell, value })}
                                onDone={(save, move, picked) =>
                                  finishEdit(
                                    save,
                                    move ? { r: r + (move === "down" ? 1 : 0), c: c + (move === "right" ? 1 : 0) } : undefined,
                                    picked,
                                  )
                                }
                              />
                            ) : (
                              renderCell ? renderCell(row, col) : <Value column={col} row={row} tone={tagTones} />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {view.length === 0 && <p className="ui-dtc__empty">No rows yet</p>}
          </div>
          </div>
        </div>

        {footer && <footer className="ui-dtc__foot">
          {checked.size > 0 ? (
            <div className="ui-dtc__bulk" role="status">
              <span>{checked.size} selected</span>
              {editable && (
                <button type="button" className="ui-dtc__add ui-dtc__add--danger" onClick={deleteChecked}>
                  <TrashIcon />
                  Delete
                </button>
              )}
              <button type="button" className="ui-dtc__add" onClick={() => updateChecked(new Set())}>
                Clear
              </button>
            </div>
          ) : editable ? (
            <button type="button" className="ui-dtc__add" onClick={addRow}>
              <PlusIcon />
              Add row
            </button>
          ) : (
            <span />
          )}
          <span className="ui-dtc__summary" aria-live="polite">
            {summary ?? (editable ? "Double-click a cell to edit" : "")}
          </span>
        </footer>}
      </section>
    </>
  );
}

function Value({ column, row, tone }: { column: DataColumn; row: DataRow; tone: Record<string, TagTone> }) {
  const value = row[column.key];
  if (column.type === "title") {
    return (
      <span className="ui-dtc__name">
        {row.logo ? <span className="ui-dtc__logo">{row.logo}</span> : <span className="ui-dtc__logo ui-dtc__logo--empty" />}
        <span className="ui-dtc__name-text" data-empty={text(value) === "" || undefined}>
          {text(value) || "Untitled"}
        </span>
      </span>
    );
  }
  if (text(value) === "") return null;
  if (column.type === "tag") {
    return (
      <span className="ui-dtc__tag" data-tone={tone[text(value)] ?? "blue"}>
        {value}
      </span>
    );
  }
  if (column.type === "link") {
    const href = /^https?:\/\//.test(text(value)) ? text(value) : `https://${text(value)}`;
    return (
      <a className="ui-dtc__link" href={href} target="_blank" rel="noreferrer" tabIndex={-1}>
        {text(value).replace(/^https?:\/\//, "")}
      </a>
    );
  }
  if (column.type === "number" && typeof value === "number") {
    return <span className="ui-dtc__text">{value.toLocaleString("en-US")}</span>;
  }
  return <span className="ui-dtc__text">{value}</span>;
}

/** In-place editor: a text field, or a list of choices for tag columns */
function Editor({
  column,
  value,
  options,
  tones = {},
  onChange,
  onDone,
}: {
  column: DataColumn;
  value: string;
  options?: string[];
  tones?: Record<string, TagTone>;
  onChange: (value: string) => void;
  onDone: (save: boolean, move?: "down" | "right", picked?: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, []);

  if (options) return <TagPicker label={column.label} value={value} options={options} tones={tones} onChange={onChange} onDone={onDone} />;

  return (
    <input
      ref={ref}
      className="ui-dtc__input"
      value={value}
      inputMode={column.type === "number" ? "decimal" : undefined}
      aria-label={column.label}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onDone(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onDone(true, "down");
        } else if (e.key === "Tab") {
          e.preventDefault();
          onDone(true, "right");
        } else if (e.key === "Escape") {
          e.preventDefault();
          onDone(false);
        }
      }}
    />
  );
}

/**
 * Tag choices for a cell. Drawn in a fixed layer lined up with the cell, so neither the scrolling table nor the
 * rounded card can cut it off – it may overlap the last row of the card or anything below. Opens upwards when there's
 * no room below, follows the cell on scroll and resize.
 */
function TagPicker({
  label,
  value,
  options,
  tones,
  onChange,
  onDone,
}: {
  label: string;
  value: string;
  options: string[];
  tones: Record<string, TagTone>;
  onChange: (value: string) => void;
  onDone: (save: boolean, move?: "down" | "right", picked?: string) => void;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const originRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const cell = anchorRef.current?.closest("td");
      const menu = menuRef.current;
      if (!cell || !menu) return;
      const box = cell.getBoundingClientRect();
      const height = menu.offsetHeight;
      const below = window.innerHeight - box.top - 4;
      const top = below >= height + 8 ? box.top + 4 : Math.max(8, box.bottom - 4 - height);
      // A transformed or filtered ancestor moves where "fixed" starts – measure that origin and subtract it
      const origin = originRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
      setPos({ left: box.left + 6 - origin.left, top: top - origin.top, width: Math.max(box.width - 12, 160) });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, []);

  // A click anywhere else keeps the cell as it was
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onDone(false);
    };
    window.addEventListener("pointerdown", away, true);
    return () => window.removeEventListener("pointerdown", away, true);
  }, [onDone]);

  return (
    <span ref={anchorRef} className="ui-dtc__picker-anchor">
      <span ref={originRef} className="ui-dtc__picker-origin" aria-hidden="true" />
      <div
        ref={menuRef}
        className="ui-dtc__picker"
        role="listbox"
        aria-label={label}
        style={pos ? { left: pos.left, top: pos.top, minWidth: pos.width } : { visibility: "hidden" }}
      >
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="option"
            aria-selected={o === value}
            className="ui-dtc__option"
            autoFocus={o === value || (!value && o === options[0])}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              onChange(o);
              onDone(true, undefined, o);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onDone(false);
              const items = [...(e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
              const i = items.indexOf(e.currentTarget);
              if (e.key === "ArrowDown") items[Math.min(items.length - 1, i + 1)]?.focus();
              if (e.key === "ArrowUp") items[Math.max(0, i - 1)]?.focus();
              if (e.key.startsWith("Arrow")) e.preventDefault();
            }}
          >
            <span className="ui-dtc__tag" data-tone={tones[o] ?? "blue"}>
              {o}
            </span>
            <svg viewBox="0 0 16 16" className="ui-dtc__option-check" aria-hidden="true">
              <path d="m4 8.25 2.6 2.6L12 5.25" />
            </svg>
          </button>
        ))}
      </div>
    </span>
  );
}

function Checkbox({
  checked,
  mixed,
  label,
  onChange,
}: {
  checked: boolean;
  mixed?: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={mixed ? "mixed" : checked}
      aria-label={label}
      className="ui-dtc__check"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onChange}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        {mixed ? <path d="M5 8h6" /> : <path d="m4.5 8.25 2.25 2.25L11.5 5.75" />}
      </svg>
    </button>
  );
}

/* ---------- Icons: 16px, thin 1.1px lines with round caps ---------- */

const line = (d: string, size = 16) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const PlusIcon = () => line("M8 3.5v9M3.5 8h9");
const TrashIcon = () => line("M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5");
const UndoIcon = () => line("M5.5 3.5 2.5 6.5l3 3M2.5 6.5h7a3.5 3.5 0 0 1 0 7H7");
const RedoIcon = () => line("m10.5 3.5 3 3-3 3M13.5 6.5h-7a3.5 3.5 0 0 0 0 7H9");
const SortIcon = () => line("M8 3.5v9M5 9.5l3 3 3-3", 12);

const col = (d: string) => line(d, 14);
export const TextColumnIcon = () => col("M3 4h10M3 7h10M3 10h10M3 13h6");
export const TagColumnIcon = () => col("M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z");
export const LinkColumnIcon = () => col("M6.5 9.5l3-3M7.25 4.75l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M8.75 11.25l-1 1a2.5 2.5 0 0 1-3.5-3.5l1-1");
export const NumberColumnIcon = () => col("M6 2.5 4.5 13.5M11.5 2.5 10 13.5M2.5 6h11M2 10.5h11");
export const DateColumnIcon = () => col("M3 4.5h10v9H3zM3 7.5h10M6 2.5v3M10 2.5v3");

/**
 * Lets a box glide to the height of its content instead of jumping: the outer box follows the inner one
 * with a height transition whenever the content grows or shrinks.
 */
function useSmoothHeight(inner: RefObject<HTMLElement | null>) {
  const outer = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const sync = () => {
      o.style.height = `${i.offsetHeight}px`;
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(i);
    // Transitions switch on after the first measurement, so the first render doesn't animate
    const frame = requestAnimationFrame(() => o.setAttribute("data-smooth", ""));
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [inner]);
  return outer;
}

/* ---------- Styles ---------- */

const css = /* css */ `
/* Colors and motion as variables – override them on .ui-dtc */
.ui-dtc {
  --ui-dtc-card: #ffffff;
  --ui-dtc-ink: rgba(0, 0, 0, 0.88);
  --ui-dtc-strong: #000000;
  --ui-dtc-text: rgba(0, 0, 0, 0.61);
  --ui-dtc-muted: rgba(0, 0, 0, 0.45);
  --ui-dtc-faint: rgba(0, 0, 0, 0.27);
  --ui-dtc-icon: rgba(0, 0, 0, 0.447);
  --ui-dtc-line: rgba(0, 0, 0, 0.06);
  --ui-dtc-fill: rgba(0, 0, 0, 0.06);
  --ui-dtc-wash: rgba(0, 0, 0, 0.03);
  --ui-dtc-row-hover: rgba(0, 0, 0, 0.015);
  --ui-dtc-accent: rgba(0, 96, 226, 0.765);
  --ui-dtc-selected: rgba(0, 96, 226, 0.05);
  --ui-dtc-active-blur: rgba(0, 96, 226, 0.35);
  --ui-dtc-check-ring: rgba(0, 0, 0, 0.22);
  --ui-dtc-check-ring-hover: rgba(0, 0, 0, 0.4);
  --ui-dtc-check-on: rgba(0, 0, 0, 0.88);
  --ui-dtc-check-mark: #fcfcfc;
  --ui-dtc-underline: rgba(0, 0, 0, 0.16);
  --ui-dtc-danger: #e5484d;
  --ui-dtc-danger-wash: rgba(229, 72, 77, 0.08);
  /* Strokes are shadows: a 0.5px hairline plus a soft lift */
  --ui-dtc-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.06), 0 1px 1px -1px rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --ui-dtc-shadow-pop: 0 0 0 0.5px rgba(0, 0, 0, 0.08), 0 12px 28px -10px rgba(0, 0, 0, 0.16), 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --ui-dtc-focus: rgba(0, 96, 226, 0.35);
  --ui-dtc-ease: cubic-bezier(0.22, 1, 0.36, 1);
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  /* One white card – the edge is a shadow, not a border */
  overflow: hidden;
  border-radius: 10px;
  background: var(--ui-dtc-card);
  box-shadow: var(--ui-dtc-shadow);
  font-family: "Inter", "InterVariable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  line-height: 20px;
  font-weight: 400;
  color: var(--ui-dtc-ink);
  -webkit-font-smoothing: antialiased;
}
.ui-dtc *, .ui-dtc *::before, .ui-dtc *::after { box-sizing: border-box; }
:where(.ui-dtc) button { margin: 0; padding: 0; border: 0; background: none; font: inherit; color: inherit; cursor: pointer; }
:where(.ui-dtc) svg { display: block; flex: none; }
.ui-dtc button:focus-visible, .ui-dtc a:focus-visible { outline: 2px solid var(--ui-dtc-focus); outline-offset: 1px; }

/* Title row: icon, name, undo and redo */
.ui-dtc__head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  padding: 12px 12px 12px 16px;
}
.ui-dtc__title {
  margin: 0;
  overflow: hidden;
  font-size: 15px;
  font-weight: 500;
  line-height: 24px;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--ui-dtc-strong);
}
.ui-dtc__title-icon { display: grid; flex: none; }
.ui-dtc__title-icon svg { width: 18px; height: 18px; }
.ui-dtc__tools { display: flex; gap: 2px; margin-left: auto; }
.ui-dtc__tool {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: var(--ui-dtc-icon);
  transition: background-color 140ms ease, color 140ms ease, opacity 140ms ease;
}
.ui-dtc__tool:hover:not(:disabled) { background: var(--ui-dtc-wash); color: var(--ui-dtc-ink); }
.ui-dtc__tool:disabled { opacity: 0.4; cursor: default; }

.ui-dtc__scroll { overflow-x: auto; outline: none; }
.ui-dtc__scroll[data-dragging] { cursor: cell; user-select: none; }

.ui-dtc__table {
  width: 100%;
  min-width: 600px;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 13px;
  line-height: 20px;
}
/* Rows are 40px high, divided by hairlines only – no vertical grid lines */
.ui-dtc__table th,
.ui-dtc__table td {
  position: relative;
  height: 40px;
  padding: 0 12px;
  border-top: 0.5px solid var(--ui-dtc-line);
  text-align: left;
  vertical-align: middle;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Header row: 12px gray labels under a hairline */
.ui-dtc__table th {
  height: 36px;
  padding: 0 6px;
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  color: var(--ui-dtc-text);
  transition: color 140ms ease;
}
.ui-dtc__table th[data-col-active] { color: var(--ui-dtc-ink); }
.ui-dtc__th {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 28px;
  padding: 0 6px;
  border-radius: 6px;
  text-align: left;
  transition: background-color 140ms ease, color 140ms ease;
}
.ui-dtc__th:hover { background: var(--ui-dtc-wash); color: var(--ui-dtc-ink); }
.ui-dtc__th:focus-visible { outline-offset: -2px; }
.ui-dtc__th-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ui-dtc__col-icon { display: grid; color: var(--ui-dtc-icon); }
.ui-dtc__sort {
  display: grid;
  margin-left: auto;
  color: var(--ui-dtc-icon);
  opacity: 0;
  transition: opacity 140ms ease, transform 220ms var(--ui-dtc-ease);
}
.ui-dtc__th:hover .ui-dtc__sort { opacity: 1; }
.ui-dtc__sort[data-dir] { opacity: 1; color: var(--ui-dtc-accent); }
.ui-dtc__sort[data-dir="asc"] { transform: rotate(180deg); }

/* Selection column: one checkbox per row, centered */
.ui-dtc__table .ui-dtc__select { padding: 0; text-align: center; }
.ui-dtc__select .ui-dtc__check { margin: 0 auto; }

.ui-dtc__table tbody tr { transition: background-color 120ms ease; }
.ui-dtc__table tbody tr:hover { background: var(--ui-dtc-row-hover); }
/* Checked rows and selected ranges: a minimal blue fill, no frame */
.ui-dtc__table tbody tr[data-selected] { background: var(--ui-dtc-selected); }

/* Cell selection: a thin blue frame on the active cell, the soft blue fill on the rest of the range */
.ui-dtc__table td[data-cell] { cursor: cell; }
.ui-dtc__table td[data-in-range] { background: var(--ui-dtc-selected); }
.ui-dtc__table td[data-active]::after {
  content: "";
  position: absolute;
  inset: 1px;
  border-radius: 4px;
  box-shadow: inset 0 0 0 1.5px var(--ui-dtc-accent);
  pointer-events: none;
}
.ui-dtc__scroll:not(:focus-within) td[data-active]::after { box-shadow: inset 0 0 0 1px var(--ui-dtc-active-blur); }
.ui-dtc__table td[data-editing] { padding: 0; overflow: visible; background: var(--ui-dtc-card); }

.ui-dtc__input {
  width: 100%;
  height: 100%;
  padding: 0 12px;
  border: 0;
  outline: none;
  background: transparent;
  font: inherit;
  color: var(--ui-dtc-ink);
  caret-color: var(--ui-dtc-accent);
}
.ui-dtc__table td[data-type="number"] .ui-dtc__input { font-variant-numeric: tabular-nums; }

/* Tag picker: a fixed white popover lined up with the cell, above the card */
.ui-dtc__picker-anchor { display: block; }
.ui-dtc__picker-origin { position: fixed; left: 0; top: 0; width: 0; height: 0; pointer-events: none; }
.ui-dtc__picker {
  position: fixed;
  z-index: 50;
  display: grid;
  gap: 2px;
  padding: 4px;
  border-radius: 10px;
  background: var(--ui-dtc-card);
  box-shadow: var(--ui-dtc-shadow-pop);
  animation: ui-dtc-drop 180ms var(--ui-dtc-ease);
}
.ui-dtc__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 32px;
  padding: 0 6px;
  border-radius: 6px;
  text-align: left;
}
.ui-dtc__option:hover,
.ui-dtc__option:focus-visible { background: var(--ui-dtc-fill); outline: none; }
.ui-dtc__option-check {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: var(--ui-dtc-accent);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0;
}
.ui-dtc__option[aria-selected="true"] .ui-dtc__option-check { opacity: 1; }

/* Title cell: logo and name */
.ui-dtc__name { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ui-dtc__name-text { overflow: hidden; text-overflow: ellipsis; font-weight: 500; color: var(--ui-dtc-ink); }
.ui-dtc__name-text[data-empty] { font-weight: 400; color: var(--ui-dtc-faint); }
.ui-dtc__logo { display: grid; place-items: center; flex: none; width: 16px; height: 16px; }
.ui-dtc__logo svg { width: 100%; height: 100%; }
.ui-dtc__logo--empty { border-radius: 4px; background: var(--ui-dtc-fill); }

/* Checkboxes: 14px with a hairline, a dark chip when checked */
.ui-dtc__check {
  display: grid;
  place-items: center;
  flex: none;
  width: 14px;
  height: 14px;
  border-radius: 4px;
  background: var(--ui-dtc-card);
  box-shadow: inset 0 0 0 0.5px var(--ui-dtc-check-ring), 0 1px 1px 0 rgba(0, 0, 0, 0.04);
  transition: background-color 140ms ease, box-shadow 140ms ease;
}
.ui-dtc__check:hover { box-shadow: inset 0 0 0 0.5px var(--ui-dtc-check-ring-hover), 0 1px 1px 0 rgba(0, 0, 0, 0.04); }
.ui-dtc__check:focus-visible { outline-offset: 2px; }
.ui-dtc__check svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: var(--ui-dtc-check-mark);
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0;
  transform: scale(0.6);
  transition: opacity 140ms ease, transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.ui-dtc__check[aria-checked="true"],
.ui-dtc__check[aria-checked="mixed"] { background: var(--ui-dtc-check-on); box-shadow: none; }
.ui-dtc__check[aria-checked="true"] svg,
.ui-dtc__check[aria-checked="mixed"] svg { opacity: 1; transform: none; }

/* Tags: a tinted fill of their color, no stroke */
.ui-dtc__tag {
  display: inline-block;
  max-width: 100%;
  height: 20px;
  padding: 0 6px;
  border-radius: 5px;
  overflow: hidden;
  font-size: 12px;
  font-weight: 500;
  line-height: 20px;
  white-space: nowrap;
  text-overflow: ellipsis;
  vertical-align: middle;
}
.ui-dtc__tag[data-tone="blue"] { background: rgba(0, 96, 226, 0.08); color: #1f63d6; }
.ui-dtc__tag[data-tone="violet"] { background: rgba(124, 77, 255, 0.09); color: #6c45e0; }
.ui-dtc__tag[data-tone="pink"] { background: rgba(219, 39, 119, 0.08); color: #c22a6e; }
.ui-dtc__tag[data-tone="green"] { background: rgba(26, 154, 82, 0.09); color: #157a43; }
.ui-dtc__tag[data-tone="amber"] { background: rgba(232, 162, 12, 0.12); color: #9a6200; }
.ui-dtc__tag[data-tone="gray"] { background: rgba(0, 0, 0, 0.05); color: var(--ui-dtc-text); }

.ui-dtc__link {
  color: var(--ui-dtc-text);
  text-decoration: underline;
  text-decoration-color: var(--ui-dtc-underline);
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  transition: text-decoration-color 140ms ease, color 140ms ease;
}
.ui-dtc__link:hover { color: var(--ui-dtc-ink); text-decoration-color: currentColor; }
.ui-dtc__text { color: var(--ui-dtc-text); font-variant-numeric: tabular-nums; }
.ui-dtc__empty { margin: 0; padding: 24px; border-top: 0.5px solid var(--ui-dtc-line); text-align: center; color: var(--ui-dtc-muted); }

/* The last row inside the card: add row or bulk actions on the left, the selection summary on the right */
.ui-dtc__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  padding: 8px 16px 8px 8px;
  border-top: 0.5px solid var(--ui-dtc-line);
}
.ui-dtc__bulk { display: flex; align-items: center; gap: 2px; min-width: 0; padding-left: 8px; }
.ui-dtc__bulk > span { margin-right: 8px; font-weight: 500; white-space: nowrap; color: var(--ui-dtc-ink); }
.ui-dtc__add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px 0 8px;
  border-radius: 6px;
  font-weight: 500;
  white-space: nowrap;
  color: var(--ui-dtc-text);
  transition: background-color 140ms ease, color 140ms ease;
}
.ui-dtc__add svg { color: var(--ui-dtc-icon); transition: color 140ms ease; }
.ui-dtc__add:not(:has(svg)) { padding: 0 10px; }
.ui-dtc__add:hover { background: var(--ui-dtc-wash); color: var(--ui-dtc-ink); }
.ui-dtc__add:hover svg { color: var(--ui-dtc-ink); }
.ui-dtc__add--danger,
.ui-dtc__add--danger svg,
.ui-dtc__add--danger:hover svg { color: var(--ui-dtc-danger); }
.ui-dtc__add--danger:hover { background: var(--ui-dtc-danger-wash); color: var(--ui-dtc-danger); }
.ui-dtc__summary {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--ui-dtc-muted);
}

@keyframes ui-dtc-drop { from { opacity: 0; transform: translateY(-4px) scale(0.98); } }

/* Height changes glide instead of jumping – only the table area, the last row never gets clipped */
.ui-dtc__morph { overflow: hidden; }
.ui-dtc__morph[data-smooth] { transition: height 380ms var(--ui-dtc-ease); }

/* Narrow screens: tighter sides, the hint in the last row gives way first */
@media (max-width: 480px) {
  .ui-dtc__head { padding-left: 14px; }
  .ui-dtc__foot { padding-right: 14px; }
}
/* Touch screens: bigger tap targets */
@media (hover: none) and (pointer: coarse) {
  .ui-dtc__tool { width: 36px; height: 36px; }
  .ui-dtc__add { height: 36px; }
  .ui-dtc__table td { height: 44px; }
  .ui-dtc__option { height: 40px; }
  .ui-dtc__check { position: relative; }
  .ui-dtc__check::after { content: ""; position: absolute; inset: -12px; }
}
@media (prefers-reduced-motion: reduce) {
  .ui-dtc *, .ui-dtc *::before, .ui-dtc *::after { animation: none !important; transition: none !important; }
}

/* Text fields: no focus box while typing – also against global :focus-visible rules of the host page */
.ui-dtc input:not([type="checkbox"]):not([type="radio"]):focus-visible,
.ui-dtc textarea:focus-visible,
.ui-dtc [contenteditable]:focus-visible { outline: none; }

/* Dark mode: follows a .dark class or data-theme="dark" on any ancestor, e.g. <html>.
   The fixed tag picker stays inside .ui-dtc in the DOM, so it inherits these values too. */
:where(.dark, [data-theme="dark"]) .ui-dtc {
  --ui-dtc-card: #1c1c1e;
  --ui-dtc-ink: rgba(255, 255, 255, 0.9);
  --ui-dtc-strong: #ffffff;
  --ui-dtc-text: rgba(255, 255, 255, 0.62);
  --ui-dtc-muted: rgba(255, 255, 255, 0.46);
  --ui-dtc-faint: rgba(255, 255, 255, 0.3);
  --ui-dtc-icon: rgba(255, 255, 255, 0.5);
  --ui-dtc-line: rgba(255, 255, 255, 0.08);
  --ui-dtc-fill: rgba(255, 255, 255, 0.08);
  --ui-dtc-wash: rgba(255, 255, 255, 0.05);
  --ui-dtc-row-hover: rgba(255, 255, 255, 0.025);
  --ui-dtc-accent: #4d8dff;
  --ui-dtc-selected: rgba(77, 141, 255, 0.14);
  --ui-dtc-active-blur: rgba(77, 141, 255, 0.5);
  --ui-dtc-check-ring: rgba(255, 255, 255, 0.28);
  --ui-dtc-check-ring-hover: rgba(255, 255, 255, 0.45);
  --ui-dtc-check-on: rgba(255, 255, 255, 0.9);
  --ui-dtc-check-mark: #1c1c1e;
  --ui-dtc-underline: rgba(255, 255, 255, 0.22);
  --ui-dtc-danger: #ff6369;
  --ui-dtc-danger-wash: rgba(229, 72, 77, 0.14);
  --ui-dtc-shadow: 0 0 0 0.5px rgba(255, 255, 255, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.4);
  --ui-dtc-shadow-pop: 0 0 0 0.5px rgba(255, 255, 255, 0.12), 0 12px 28px -10px rgba(0, 0, 0, 0.6);
  --ui-dtc-focus: rgba(77, 141, 255, 0.5);
}
:where(.dark, [data-theme="dark"]) .ui-dtc__check { box-shadow: inset 0 0 0 0.5px var(--ui-dtc-check-ring); }
:where(.dark, [data-theme="dark"]) .ui-dtc__check[aria-checked="true"],
:where(.dark, [data-theme="dark"]) .ui-dtc__check[aria-checked="mixed"] { box-shadow: none; }
:where(.dark, [data-theme="dark"]) .ui-dtc__tag[data-tone="blue"] { background: rgba(77, 141, 255, 0.16); color: #8ab4ff; }
:where(.dark, [data-theme="dark"]) .ui-dtc__tag[data-tone="violet"] { background: rgba(124, 77, 255, 0.18); color: #b49cff; }
:where(.dark, [data-theme="dark"]) .ui-dtc__tag[data-tone="pink"] { background: rgba(236, 72, 153, 0.16); color: #f48cc4; }
:where(.dark, [data-theme="dark"]) .ui-dtc__tag[data-tone="green"] { background: rgba(62, 194, 122, 0.15); color: #6fd69b; }
:where(.dark, [data-theme="dark"]) .ui-dtc__tag[data-tone="amber"] { background: rgba(245, 158, 11, 0.15); color: #f5c04a; }
:where(.dark, [data-theme="dark"]) .ui-dtc__tag[data-tone="gray"] { background: rgba(255, 255, 255, 0.08); color: var(--ui-dtc-text); }
`;
