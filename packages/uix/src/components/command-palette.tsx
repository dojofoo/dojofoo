import { useEffect, useRef, useState } from "react";
import { CommandMenu, type CommandGroup, type CommandMenuProps } from "./command-menu";
import { exitFallbackMs, spring } from "../lib/springs";

/*
 * Command Palette – the Command Menu as a modal: a native dialog (focus trap, Esc, top layer) over a half-transparent
 * dark backdrop. ⌥K (Alt K) opens and closes it from anywhere. The dialog is the one surface – surface 5 with
 * shadow 5, a dialog's place on the elevation ladder – so the menu's own tray and card unwrap into it.
 * It enters on the slow spring and leaves one tier quicker; with reduced motion only the fades remain.
 */

export type CommandPaletteProps = Pick<CommandMenuProps, "query" | "onQueryChange" | "filter" | "assistant" | "header" | "searchLabel" | "emptyMessage" | "shortcut"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: CommandGroup[];
  /** Called with the command id; for the assistant fallback with "ask" and the typed text */
  onRun?: (id: string, query?: string) => void;
  placeholder?: string;
  className?: string;
};

const isOptionK = (e: KeyboardEvent) => e.altKey && !e.metaKey && !e.ctrlKey && e.code === "KeyK";

export function CommandPalette({ open, onOpenChange, groups, onRun, placeholder, className, ...menu }: CommandPaletteProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  // The menu stays mounted through the exit fade, then leaves – its own ⌘K listener shouldn't run while closed
  const [mounted, setMounted] = useState(open);
  const latest = useRef({ open, onOpenChange });
  latest.current = { open, onOpenChange };

  useEffect(() => {
    const box = dialog.current;
    if (!box) return;
    if (open) {
      setMounted(true);
      if (!box.open) box.showModal();
      return;
    }
    if (box.open) box.close();
    const t = window.setTimeout(() => setMounted(false), exitFallbackMs(spring.slow));
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isOptionK(e)) return;
      e.preventDefault();
      latest.current.onOpenChange(!latest.current.open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <dialog
      ref={dialog}
      className={["ui-as-palette", className].filter(Boolean).join(" ")}
      aria-label={menu.searchLabel ?? "Command menu"}
      // Esc belongs to the menu first (it clears the search); an empty search then closes through onClose
      onCancel={(e) => e.preventDefault()}
      onClose={() => latest.current.open && onOpenChange(false)}
      // A click on the backdrop lands on the dialog itself
      onClick={(e) => e.target === e.currentTarget && onOpenChange(false)}
    >
      <style href="ui-command-palette" precedence="default">
        {css}
      </style>
      {mounted && (
        <CommandMenu
          groups={groups}
          placeholder={placeholder}
          autoFocus
          shortcut={["⌥", "K"]}
          {...menu}
          onClose={() => onOpenChange(false)}
          onRun={(id, query) => {
            onOpenChange(false);
            onRun?.(id, query);
          }}
        />
      )}
    </dialog>
  );
}

const css = /* css */ `
.ui-as-palette {
  width: min(600px, calc(100vw - 32px));
  max-width: none;
  max-height: none;
  margin: 14vh auto auto;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: calc(12px * var(--squircle-factor, 1));
  background: var(--surface-5);
  box-shadow: var(--shadow-5);
  color: var(--fluid-foreground);
  opacity: 1;
  transform: none;
  transition:
    opacity var(--motion-slow-exit) var(--ease-exit),
    transform var(--motion-slow-exit) var(--ease-exit),
    overlay var(--motion-slow-exit) allow-discrete,
    display var(--motion-slow-exit) allow-discrete;
}
.ui-as-palette[open] {
  transition-duration: var(--motion-slow);
  transition-timing-function: var(--ease-slow);
}
.ui-as-palette:not([open]) { opacity: 0; transform: scale(0.97); }
@starting-style {
  .ui-as-palette[open] { opacity: 0; transform: scale(0.97); }
}
.ui-as-palette::backdrop {
  background: rgb(0 0 0 / 0.5);
  opacity: 1;
  transition:
    opacity var(--motion-slow-exit) var(--ease-exit),
    overlay var(--motion-slow-exit) allow-discrete,
    display var(--motion-slow-exit) allow-discrete;
}
.ui-as-palette[open]::backdrop { transition-duration: var(--motion-slow); transition-timing-function: var(--ease-slow); }
.ui-as-palette:not([open])::backdrop { opacity: 0; }
@starting-style {
  .ui-as-palette[open]::backdrop { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .ui-as-palette, .ui-as-palette:not([open]) { transform: none; }
}

/* One surface: the menu's tray and card unwrap into the dialog, its colors follow the two text colors and overlays */
.ui-as-palette .ui-cm {
  --ui-cm-ink: var(--fluid-foreground);
  --ui-cm-text: var(--fluid-foreground);
  --ui-cm-muted: var(--fluid-muted);
  --ui-cm-faint: var(--fluid-muted);
  --ui-cm-line: var(--fluid-hairline);
  --ui-cm-active: var(--fluid-hover);
  max-width: none;
  padding: 0;
  border-radius: 0;
  background: none;
}
.ui-as-palette .ui-cm__card { border-radius: 0; background: none; box-shadow: none; }
.ui-as-palette .ui-cm__foot { border-top: 1px solid var(--fluid-hairline); }
/* Type roles and motion tiers: body text, a subtitle-sized field, no uppercase or tracking; the highlight travels on
   the fast spring like every hover, the list's height settles on the moderate one */
.ui-as-palette .ui-cm { font-size: var(--fs-body); line-height: var(--lh-body); }
.ui-as-palette .ui-cm__search input { font-size: var(--fs-subtitle); }
.ui-as-palette .ui-cm__label, .ui-as-palette .ui-cm__foot { font-size: var(--fs-caption); }
.ui-as-palette .ui-cm__enter { font-size: var(--fs-caption); font-weight: 400; letter-spacing: 0; text-transform: none; }
.ui-as-palette .ui-cm__pill { transition: transform var(--motion-fast) var(--ease-fast), height var(--motion-fast) var(--ease-fast); }
.ui-as-palette .ui-cm__list { transition: height var(--motion-moderate) var(--ease-moderate); }
`;
