import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Icon } from "./app-shell";
import { ArrowUp02Icon, Cancel01Icon } from "../lib/icons";
import { composerCss } from "../lib/composer-styles";

/** Shared presentation; the caller owns the draft, requests and supported controls. */
export function ComposerSurface({ value, onValueChange, onSend, busy = false, disabled = false, onStop,
  history = [], placeholder = "Message…", label = "Message", id, leading, controls, attachments, tray, className, fieldRef,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onSend: (value: string) => void;
  busy?: boolean;
  disabled?: boolean;
  onStop?: () => void;
  history?: string[];
  placeholder?: string;
  label?: string;
  id?: string;
  leading?: ReactNode;
  controls?: ReactNode;
  attachments?: ReactNode;
  tray?: ReactNode;
  className?: string;
  fieldRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const ownField = useRef<HTMLTextAreaElement>(null);
  const field = fieldRef ?? ownField;
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const draft = useRef("");
  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 6 * 20)}px`;
  }, [field, value]);
  const caretEnd = () => requestAnimationFrame(() => {
    const node = field.current;
    if (node) node.setSelectionRange(node.value.length, node.value.length);
  });
  const submit = () => {
    if (disabled || busy || !value.trim()) return;
    setHistoryIndex(null);
    onSend(value.trim());
  };
  return <form className={["ui-as-composer", className].filter(Boolean).join(" ")} data-bare={!tray || undefined}
    onSubmit={event => { event.preventDefault(); submit(); }}>
    <style href="ui-screen-composer" precedence="default">{composerCss}</style>
    <div className="ui-as-composer__card">
      {attachments}
      <textarea ref={field} id={id} className="ui-as-composer__field" rows={1} value={value} disabled={disabled}
        placeholder={placeholder} aria-label={label}
        onChange={event => { setHistoryIndex(null); onValueChange(event.target.value); }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (history.length && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
            const node = event.currentTarget;
            const caret = node.selectionStart;
            if (event.key === "ArrowUp" && !value.slice(0, caret).includes("\n")) {
              const from = historyIndex ?? history.length;
              if (from > 0) {
                event.preventDefault();
                if (historyIndex === null) draft.current = value;
                setHistoryIndex(from - 1);
                onValueChange(history[from - 1]);
                caretEnd();
              }
              return;
            }
            if (event.key === "ArrowDown" && historyIndex !== null && !value.slice(node.selectionEnd).includes("\n")) {
              event.preventDefault();
              const next = historyIndex + 1;
              setHistoryIndex(next < history.length ? next : null);
              onValueChange(next < history.length ? history[next] : draft.current);
              caretEnd();
              return;
            }
          }
          if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); }
        }} />
      <div className="ui-as-composer__bar">
        {leading}
        <span className="ui-as-composer__end">
          {controls}
          {busy && onStop
            ? <button type="button" className="ui-as-send" aria-label="Stop" onClick={onStop}><Icon icon={Cancel01Icon} size={15} /></button>
            : <button type="submit" className="ui-as-send" aria-label="Send" disabled={disabled || busy || !value.trim()}><Icon icon={ArrowUp02Icon} size={15} /></button>}
        </span>
      </div>
    </div>
    {tray}
  </form>;
}
