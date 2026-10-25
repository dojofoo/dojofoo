import { Icon } from "~/components/app-shell";
import { Tick02Icon, type IconGlyph } from "~/lib/icons";

/*
 * SetupChecklist – the checklist from the affectUI onboarding: a head with the count, a bar, then each step with its
 * mark (a ring, filled with a check once done, a dash when skipped), its name and a line under it; the open step lifted
 * on a card. An optional help row follows. Onboarding shows it beside its card; the learner's setup in the sidebar.
 *
 *   <SetupChecklist steps={[{ id: "agent", title: "Agent", sub: "In progress", state: "current" }, …]} onSelect={go}
 *     help={{ icon: BookOpen01Icon, title: "Need a hand?", text: "Go to the docs" }} />
 */
export type ChecklistStep = { id: string; title: string; /** The line under it: a summary once done, a time estimate before */ sub: string; state: "done" | "current" | "todo" | "skipped" };

export function SetupChecklist({ steps, onSelect, help, title = "Setup checklist" }: {
  steps: ChecklistStep[];
  onSelect?: (index: number) => void;
  help?: { icon: IconGlyph; title: string; text: string; onClick?: () => void };
  title?: string;
}) {
  const done = steps.filter((item) => item.state === "done").length;
  return (
    <>
      <style href="ui-setup-checklist" precedence="default">{css}</style>
      <div className="ui-check">
        <div className="ui-check__head">
          <b>{title}</b>
          <span className="ui-check__count"><span key={done}>{done}</span>/{steps.length}</span>
        </div>
        <span className="ui-check__bar" aria-hidden="true">
          <i style={{ transform: `scaleX(${done / steps.length})` }} />
        </span>
        <ol className="ui-check__list">
          {steps.map((item, index) => (
            <li key={item.id}>
              <button type="button" className="ui-check__item" data-state={item.state} aria-current={item.state === "current" ? "step" : undefined} onClick={() => onSelect?.(index)}>
                <span className="ui-check__mark" aria-hidden="true">
                  {item.state === "done" ? <Icon key="done" icon={Tick02Icon} size={11} stroke={2.6} /> : item.state === "skipped" ? <i className="ui-check__dash" /> : null}
                </span>
                <span className="ui-check__text">
                  <span className="ui-check__label">{item.title}</span>
                  <span className="ui-check__sub">{item.sub}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      {help && (
        <button type="button" className="ui-check-help" onClick={help.onClick}>
          <span className="ui-check-help__icon"><Icon icon={help.icon} size={15} /></span>
          <span>
            <b>{help.title}</b>
            <span>{help.text}</span>
          </span>
        </button>
      )}
    </>
  );
}

const css = /* css */ `
.ui-check {
  padding: 16px 8px 8px;
  border-radius: calc(14px * var(--squircle-factor, 1));
  background: var(--subtle);
}
.ui-check__head { display: flex; align-items: baseline; justify-content: space-between; padding: 0 8px; }
.ui-check__head b { font-size: 13.5px; font-weight: 600; color: var(--ink); }
.ui-check__count { font-size: 12.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
.ui-check__count span { display: inline-block; color: var(--ink); animation: ui-check-rise 360ms var(--ease); }
.ui-check__bar { display: block; height: 4px; margin: 12px 8px 8px; overflow: hidden; border-radius: 999px; corner-shape: round; background: var(--chip-hover); }
.ui-check__bar i { display: block; height: 100%; border-radius: inherit; background: var(--ink); transform-origin: left; transition: transform 620ms var(--ease); }
.ui-check__list { display: grid; gap: 1px; margin: 0; padding: 0; list-style: none; }
.ui-check__item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 8px;
  border-radius: calc(9px * var(--squircle-factor, 1));
  text-align: left;
  transition: background-color 140ms ease;
}
.ui-check__item:hover { background: var(--hover); }
.ui-check__item[aria-current] { background: var(--card); box-shadow: var(--shadow-3); }
.ui-check__mark {
  display: grid;
  place-items: center;
  flex: none;
  width: 16px;
  height: 16px;
  margin-top: 1px;
  border-radius: 50%; corner-shape: round;
  box-shadow: inset 0 0 0 1.5px var(--line-strong);
  color: var(--on-ink);
  transition: background-color 200ms ease, box-shadow 200ms ease;
}
.ui-check__mark svg { animation: ui-as-pop 260ms var(--ease); }
.ui-check__item[data-state="current"] .ui-check__mark { box-shadow: inset 0 0 0 1.5px var(--ink); }
.ui-check__item[data-state="done"] .ui-check__mark { background: var(--ink); box-shadow: none; }
.ui-check__item[data-state="skipped"] .ui-check__mark { box-shadow: inset 0 0 0 1.5px var(--line-strong); }
.ui-check__dash { display: block; width: 6px; height: 1.5px; border-radius: calc(1px * var(--squircle-factor, 1)); background: var(--faint); }
.ui-check__text { display: grid; gap: 1px; min-width: 0; }
.ui-check__label { font-size: 13px; line-height: 18px; font-weight: 500; color: var(--ink); }
.ui-check__item[data-state="todo"] .ui-check__label { color: var(--text); font-weight: 400; }
.ui-check__item[data-state="done"] .ui-check__label { color: var(--muted); }
.ui-check__sub { overflow: hidden; font-size: 12px; line-height: 16px; color: var(--muted); white-space: nowrap; text-overflow: ellipsis; }
.ui-check__item[data-state="todo"] .ui-check__sub { color: var(--faint); }

.ui-check-help {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: calc(12px * var(--squircle-factor, 1));
  text-align: left;
  transition: background-color 140ms ease;
}
.ui-check-help:hover { background: var(--hover); }
.ui-check-help__icon { display: grid; place-items: center; flex: none; width: 28px; height: 28px; border-radius: calc(8px * var(--squircle-factor, 1)); background: var(--chip); color: var(--text); }
.ui-check-help > span:last-child { display: grid; gap: 1px; }
.ui-check-help b { font-size: 13px; font-weight: 500; color: var(--ink); }
.ui-check-help > span:last-child > span { font-size: 12px; color: var(--muted); }
@keyframes ui-check-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
`;
