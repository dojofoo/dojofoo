export const learningWorkspaceCss = /* css */ `
/* Agent chat: thread and composer on the left, the brief as a panel on the right */
.ui-as-chat { position: relative; display: flex; height: 100%; min-height: 0; }
/* The window's shadow, drawn again over everything in it: its inner parts on the window itself would sit under the
   editor, the settings and their footer, which paint their own surfaces (the outer parts are clipped here) */
.ui-as-chat::after { content: ""; position: absolute; z-index: 20; inset: 0; border-radius: var(--radius-panel); box-shadow: var(--shadow-3); pointer-events: none; }
.ui-as-main:has(> .ui-as-main__scroll > .ui-as-chat) { box-shadow: var(--shadow-3-outer); }
.ui-as-chat__main { display: flex; flex: 1; flex-direction: column; min-width: 0; }

.ui-as-chat__bar {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  height: 52px;
  padding: 0 12px 0 20px;
  border-bottom: 1px solid var(--line-soft);
  color: var(--muted);
}
.ui-as-chat__crumbs { display: flex; align-items: center; gap: 8px; font-size: var(--fs-body); }
.ui-as-chat__crumbs i { font-style: normal; color: var(--faint); }
.ui-as-chat__crumbs b { font-weight: 550; font-variation-settings: "opsz" 18; color: var(--ink); }
.ui-as-chat__crumbs .ui-as-icon-btn { width: 24px; height: 24px; margin-left: -2px; }
/* The trail takes what the tools leave, short of a clear gap before them, and shortens from the left to fit */
.ui-as-chat__ide .ui-as-chat__crumbs { flex: 1; min-width: 0; margin-right: 16px; }
.ui-as-chat__tools { display: flex; gap: 2px; }
.ui-as-chat__tools .ui-as-icon-btn[aria-pressed="true"] { background: var(--chip); color: var(--ink); }

.ui-as-chat__thread { flex: 1; min-height: 0; overflow-y: auto; padding: 40px 32px 16px; }
.ui-as-chat__column { display: flex; flex-direction: column; gap: 22px; max-width: 680px; margin: 0 auto; }
.ui-as-chat__user {
  align-self: flex-end;
  margin: 0;
  padding: 8px 14px;
  border-radius: calc(14px * var(--squircle-factor, 1));
  background: var(--chip);
  font-size: var(--fs-subtitle);
  color: var(--ink);
}
.ui-as-chat__answer {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
  font-size: var(--fs-subtitle);
  line-height: 1.6;
  color: var(--ink);
}
.ui-as-chat__answer p { margin: 0; }
.ui-as-chat__who, .ui-as-chat__route { display: flex; align-items: center; gap: 8px; font-weight: 550; font-variation-settings: "opsz" 18; }
.ui-as-chat__avatar {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%; corner-shape: round;
  background: var(--chip);
  color: var(--ink);
}
.ui-as-chat__worked { display: flex; align-items: center; gap: 6px; font-size: var(--fs-body); color: var(--muted); }
.ui-as-chat__label { padding-top: 4px; font-size: var(--fs-caption); color: var(--muted); }
.ui-as-chat__agents { display: flex; flex-wrap: wrap; gap: 6px; margin-top: -6px; }
.ui-as-chat__agent {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 12px 0 10px;
  border-radius: 999px; corner-shape: round;
  box-shadow: var(--shadow-2);
  font-size: var(--fs-body);
  color: var(--text);
}
.ui-as-chat__agent svg { color: var(--muted); }
.ui-as-chat__agent[data-active] { background: var(--chip); box-shadow: none; color: var(--ink); }
.ui-as-chat__agent[data-active] svg { color: var(--ink); }

.ui-as-chat__composer { display: flex; flex-direction: column; gap: 8px; width: 100%; max-width: 744px; margin: 0 auto; padding: 8px 32px 24px; }
.ui-as-chat__route { font-size: var(--fs-body); font-weight: 400; color: var(--muted); }

/* Settings use the conversation's resizable pane; the window's inner edge stays square at their join. */
.ui-as-app[data-aside-covered] .ui-as-chat::after { border-top-right-radius: 0; border-bottom-right-radius: 0; }
/* The IDE column answers the window's container queries itself, so what's in it (the evals) lays out the same with
   the settings open or closed: the column keeps its width either way, the window doesn't */
.ui-as-chat__ide { container: ui-as-main / inline-size; }
/* The evals sit under the IDE's toolbar, so their header needs no room for the sidebar's button */
.ui-as-chat__evals .ui-ev { --ui-ev-corner: 0px; }

/* IDE in place of the thread: a 16:9 code card with the lesson's details below it. Surfaces follow the elevation
   ladder (styles/fluid.css): the window is surface 2, so its cards are surface 3 with shadow 3 */
.ui-as-chat__evals { position: relative; flex: 1; min-height: 0; overflow-y: auto; }
/* Its own stacking context, so a stage's ambient glow (z-index -1) sits behind the stage and the details, on the window */
.ui-as-chat__editor { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; isolation: isolate; }
.ui-as-chat__editor[hidden] { display: none; }
/* The stage (editor, slides, video) runs the column's full width right under the toolbar, as part of the UI */
.ui-as-chat__editor[data-details] { padding: 0; }
.ui-as-chat__code {
  display: flex;
  flex: none;
  flex-direction: column;
  width: 100%;
  aspect-ratio: 16 / 9;
  /* A short panel keeps room for the first lines of the details */
  max-height: calc(100% - 7rem);
  min-height: 0;
  box-shadow: 0 1px 0 var(--line);
}
/* The editor draws its own card (surface 3, its shadow and inner edge) – see components/editor */
.ui-as-chat__code > * { flex: 1; min-height: 0; }
.ui-as-chat__code:has(> .ui-slide-deck) { aspect-ratio: auto; max-height: none; }
.ui-as-chat__details { flex: 1; min-height: 0; overflow-y: auto; padding: 24px 24px 20px; color: var(--muted); font-size: var(--fs-body); line-height: var(--lh-body); }


/* Conversation on the page surface: no frame or rule; the thread fades where there is more to scroll */
.ui-as-chat__main[data-surface="page"] { height: 100%; }
/* Same height and line as the window's toolbar across the gap */
.ui-as-chat__main[data-surface="page"] > .ui-as-chat__bar { height: 52px; margin-top: var(--frame-gap); padding: 0 16px 0 20px; border-bottom: 0; }
.ui-as-chat__main[data-surface="page"] > .ui-as-chat__thread { padding: 16px 20px 24px; }
.ui-as-chat__main[data-surface="page"] > .ui-as-chat__composer { padding: 0 12px var(--frame-gap); }
/* The composer's card is the code card's twin: surface 3 with shadow 3. Its corners follow the window's outer
   corners, since it sits beside the window on the page */
.ui-as-chat__main[data-surface="page"] .ui-as-composer__card {
  border-radius: var(--radius-panel);
  background: var(--surface-3);
  box-shadow: var(--shadow-3);
}
.ui-as-chat__route b { font-weight: 550; font-variation-settings: "opsz" 18; color: var(--ink); }
/* An agent's dot – the one its answers carry (ThinkingState's who), in the theme's brand color */
.ui-as-chat__dot { flex: none; width: 18px; height: 18px; border-radius: 50%; corner-shape: round; background: var(--brand); }
/* The agent in the conversation's bar: dot and name stay, the description shortens to fit */
.ui-as-chat__speaker { min-width: 0; padding-left: 0; }
.ui-as-chat__speaker b { flex: none; }
.ui-as-chat__speaker-note { overflow: hidden; min-width: 0; white-space: nowrap; text-overflow: ellipsis; }

/* Settings panel: the bar, the tabs and the save row stay; only the settings between them scroll (and fade) */
.ui-as-brief { position: relative; display: flex; flex: none; flex-direction: column; width: 400px; }
/* The divider stops short of the window's edges, so it never crosses the window's own inner edge */
.ui-as-brief::before { content: ""; position: absolute; z-index: 1; top: 1px; bottom: 1px; left: 0; width: 1px; background: var(--line-soft); pointer-events: none; }

.ui-as-brief__body { display: flex; flex: 1; flex-direction: column; min-height: 0; overflow-y: auto; }
/* The tabs are the shared segmented control; only their place in the brief is set here */
.ui-as-brief__seg { flex: none; margin: 20px 20px 4px; width: auto !important; }

.ui-as-brief__mode { margin: 18px 20px 6px; }

.ui-as-brief__section { display: flex; flex-direction: column; padding: 18px 20px; border-top: 1px solid var(--line-soft); }
.ui-as-brief__mode + .ui-as-brief__section { margin-top: 14px; }
.ui-as-brief__section--first { border-top: 0; }
.ui-as-brief__section--split { flex-direction: row; justify-content: space-between; gap: 16px; }
.ui-as-brief__label { padding-bottom: 12px; font-size: var(--fs-caption); font-weight: 550; font-variation-settings: "opsz" 18; line-height: 16px; color: var(--faint); }

.ui-as-brief__option {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 46px;
  margin: 0 -10px;
  padding: 0 10px;
  border-radius: calc(10px * var(--squircle-factor, 1));
  color: var(--muted);
  text-align: left;
  transition: background-color var(--motion-fast) var(--ease-fast), color var(--motion-fast) var(--ease-fast), box-shadow var(--motion-fast) var(--ease-fast);
}
.ui-as-brief__option:hover { background: var(--hover); color: var(--ink); }
.ui-as-brief__option[aria-checked="true"] { background: var(--chip); color: var(--ink); }
.ui-as-brief__radio { flex: none; width: 14px; height: 14px; border-radius: 50%; corner-shape: round; box-shadow: inset 0 0 0 1.5px var(--line-strong); transition: box-shadow var(--motion-fast) var(--ease-fast); }
.ui-as-brief__option[aria-checked="true"] .ui-as-brief__radio { box-shadow: inset 0 0 0 4px var(--ink); }
.ui-as-brief__name { display: flex; flex: 1; flex-direction: column; min-width: 0; font-size: var(--fs-body); font-weight: 550; font-variation-settings: "opsz" 18; line-height: 18px; color: var(--ink); }
.ui-as-brief__option .ui-as-brief__name { color: inherit; }
.ui-as-brief__name small { font-size: var(--fs-caption); font-weight: 400; line-height: 17px; color: var(--faint); }
/* Each theme's page, card and brand in dark, as three overlapping dots */
.ui-as-brief__swatches { display: flex; flex: none; }
.ui-as-brief__swatches i { width: 14px; height: 14px; border-radius: 50%; corner-shape: round; box-shadow: 0 0 0 1.5px var(--panel), inset 0 0 0 1px rgb(255 255 255 / 0.08); }
.ui-as-brief__swatches i + i { margin-left: -4px; }

/* Typography: a row per target – a label, then the choices as pills */
.ui-as-brief__type { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 36px; }
.ui-as-brief__type > span { font-size: var(--fs-body); color: var(--text); }
.ui-as-brief__pills { display: flex; flex-wrap: wrap; gap: 6px; }
.ui-as-brief__pills button { height: 28px; padding: 0 10px; border-radius: 999px; corner-shape: round; box-shadow: var(--shadow-2); font-size: var(--fs-caption); color: var(--muted); font-variant-numeric: tabular-nums; transition: background-color var(--motion-fast) var(--ease-fast), color var(--motion-fast) var(--ease-fast), box-shadow var(--motion-fast) var(--ease-fast); }
.ui-as-brief__pills button:hover { background: var(--hover); color: var(--ink); }
.ui-as-brief__pills button[aria-pressed="true"] { background: var(--select); box-shadow: none; color: var(--ink); font-weight: 550; font-variation-settings: "opsz" 18; }

.ui-as-brief__channel { display: flex; align-items: center; gap: 12px; min-height: 44px; cursor: pointer; }
.ui-as-brief__channel > svg { color: var(--muted); }
.ui-as-brief__swatches, .ui-as-brief__formats { display: flex; gap: 14px; font-size: var(--fs-caption); line-height: 16px; color: var(--muted); }
.ui-as-brief__swatches span, .ui-as-brief__formats span { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.ui-as-brief__swatches i { width: 22px; height: 22px; border-radius: 50%; corner-shape: round; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08); }
.ui-as-brief__formats span { justify-content: flex-end; height: 44px; }
.ui-as-brief__formats i { height: 24px; max-width: 36px; border: 1.5px solid var(--faint); border-radius: calc(4px * var(--squircle-factor, 1)); }
.ui-as-brief__formats span:nth-child(3) i { width: 36px; height: auto; }

.ui-as-brief__details { display: grid; gap: 12px; margin: 0; }
.ui-as-brief__details div { display: flex; align-items: center; justify-content: space-between; font-size: var(--fs-body); }
.ui-as-brief__details dt { display: flex; align-items: center; gap: 8px; color: var(--muted); }
.ui-as-brief__details dd { margin: 0; font-weight: 550; font-variation-settings: "opsz" 18; color: var(--ink); font-variant-numeric: tabular-nums; }

.ui-as-brief__panel { display: flex; flex: 1 0 auto; flex-direction: column; animation: ui-as-rise var(--motion-slow) var(--ease-slow) both; }
.ui-as-brief__assets { margin: 12px 16px 16px; padding: 4px; border-radius: calc(14px * var(--squircle-factor, 1)); transition: background-color var(--motion-fast) var(--ease-fast), box-shadow var(--motion-fast) var(--ease-fast); }
/* Files dragged over the tab: it becomes the drop zone */
.ui-as-brief__assets[data-dragging] { background: var(--hover); box-shadow: inset 0 0 0 1.5px var(--focus-ring); }
.ui-as-brief__assets[data-dragging] > * { pointer-events: none; }
.ui-as-brief__assets-head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; }
.ui-as-brief__assets-head .ui-as-brief__label { padding-bottom: 0; }
.ui-as-ads { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.ui-as-ad { margin: 0; }
.ui-as-ad__art {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 12px;
  border-radius: calc(12px * var(--squircle-factor, 1));
  background: var(--ad);
  box-shadow: var(--shadow-1);
  color: var(--ad-ink);
}
.ui-as-ad__art--file { position: relative; overflow: hidden; aspect-ratio: 1 / 1; background: var(--chip); color: var(--muted); }
.ui-as-ad__art--file img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.ui-as-ad__name { overflow: hidden; min-width: 0; text-overflow: ellipsis; white-space: nowrap; }
.ui-as-ad figcaption { gap: 8px; }
.ui-as-ad__art b { font-size: 15px; font-weight: 550; font-variation-settings: "opsz" 18; line-height: 1.2; }
.ui-as-ad figcaption { display: flex; justify-content: space-between; margin-top: 6px; font-size: var(--fs-caption); font-weight: 550; font-variation-settings: "opsz" 18; color: var(--ink); }
.ui-as-ad figcaption span { font-weight: 400; color: var(--muted); }
.ui-as-brief__empty { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-align: center; }
.ui-as-brief__empty > span { display: grid; place-items: center; width: 42px; height: 42px; margin-bottom: 8px; border-radius: calc(12px * var(--squircle-factor, 1)); background: var(--chip); color: var(--muted); }
.ui-as-brief__empty b { font-size: var(--fs-subtitle); font-weight: 550; font-variation-settings: "opsz" 18; color: var(--ink); }
.ui-as-brief__empty p { max-width: 240px; margin: 0 0 10px; font-size: var(--fs-body); line-height: 19px; color: var(--muted); }
.ui-as-activity { margin: 0; padding: 16px; list-style: none; }
.ui-as-activity li { position: relative; display: flex; gap: 12px; padding-bottom: 18px; }
/* A fine line joins the icons into a timeline */
.ui-as-activity li:not(:last-child)::before { content: ""; position: absolute; top: 28px; bottom: 2px; left: 13px; width: 1px; background: var(--line); }
.ui-as-activity__icon { display: grid; flex: none; place-items: center; width: 27px; height: 27px; border-radius: 50%; corner-shape: round; box-shadow: var(--shadow-2); color: var(--muted); }
.ui-as-activity__text { display: flex; flex-direction: column; padding-top: 3px; font-size: var(--fs-body); line-height: 19px; color: var(--ink); }
.ui-as-activity__text small { font-size: var(--fs-caption); color: var(--faint); }

.ui-as-brief__go {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
  padding: 16px 20px 20px;
  border-top: 1px solid var(--line-soft);
}
.ui-as-brief__tags { display: flex; gap: 4px; }
.ui-as-brief__tags span { padding: 3px 9px; border-radius: 999px; corner-shape: round; background: var(--hover); font-size: var(--fs-caption); font-weight: 550; font-variation-settings: "opsz" 18; color: var(--text); }

:where(.dark, [data-theme="dark"]) .ui-as-brief__signal i:not([data-on]) { background: #3a3a3f; }

/* Room for the sidebar icon while the sidebar is collapsed */
.ui-as-chat__main > .ui-as-chat__bar { transition: padding-left var(--motion-slow) var(--ease-slow); }
.ui-as-chat__scrim { display: none; }
/* The chat's own toggles: narrow only, where the conversation is a sheet */
.ui-as-chat__narrow { display: none; }
.ui-as-chat__wide { display: grid; }
.ui-as-chat__bar > .ui-as-chat__close { flex: none; margin-left: auto; }
/* In the shell's drawer the brief fills it, with no divider */
.ui-as-end > .ui-as-brief { flex: 1; width: auto; min-height: 0; }
.ui-as-end > .ui-as-brief::before { display: none; }

/* Narrow panels: the brief becomes a layer that slides in from the right over the chat (the workspace's settings
   leave the panel for the shell's drawer instead) */
@container ui-as-main (max-width: 900px) {
  .ui-as-brief {
    position: absolute;
    z-index: 12;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(400px, calc(100% - 32px));
    border-radius: 0 var(--radius-panel) var(--radius-panel) 0;
    background: var(--panel);
    box-shadow: var(--shadow-4);
    animation: ui-as-brief-in var(--motion-slow) var(--ease-slow) both;
  }
  .ui-as-brief::before { display: none; }
  .ui-as-chat__scrim {
    display: block;
    position: absolute;
    z-index: 11;
    inset: 0;
    border-radius: var(--radius-panel);
    background: rgba(0, 0, 0, 0.28);
    animation: ui-as-brief-fade var(--motion-slow) var(--ease-slow) both;
  }
  :where(.dark, [data-theme="dark"]) .ui-as-chat__scrim { background: rgba(0, 0, 0, 0.55); }
}
@keyframes ui-as-brief-in { from { translate: 100% 0; } }
@keyframes ui-as-brief-fade { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .ui-as-brief, .ui-as-chat__scrim { animation-duration: 0s !important; }
}
@container ui-as (max-width: 900px) {
  /* Room for the sidebar's button, which waits in the window's top left corner */
  .ui-as-main .ui-as-chat__main > .ui-as-chat__bar { padding-left: 52px; }
  .ui-as-chat__narrow { display: grid; }
  .ui-as-chat__wide { display: none; }
  .ui-as-chat__bar > .ui-as-chat__narrow { flex: none; margin-left: auto; }
}
@container ui-as (max-width: 600px) {
  /* Only the chat's name stays in the bar */
  .ui-as-chat__main .ui-as-chat__crumbs { min-width: 0; }
  .ui-as-chat__main .ui-as-chat__crumbs > svg, .ui-as-chat__main .ui-as-chat__crumbs > i { display: none; }
  .ui-as-chat__main .ui-as-chat__crumbs { font-size: 0; }
  .ui-as-chat__main .ui-as-chat__crumbs > b { overflow: hidden; font-size: var(--fs-body); white-space: nowrap; text-overflow: ellipsis; }
  .ui-as-chat__bar { padding-right: 8px; }
  .ui-as-brief .ui-as-chat__bar { padding-left: 52px; }
  .ui-as-end > .ui-as-brief .ui-as-chat__bar { padding-left: 20px; }
  .ui-as-chat__thread { padding: 24px 16px 12px; }
  .ui-as-chat__composer { padding: 6px 8px 8px; }
  .ui-as-chat__route { padding-left: 6px; }
  .ui-as-brief { width: 100%; border-radius: var(--radius-panel); }
  .ui-as-brief__seg { margin: 16px 16px 0; }
  .ui-as-brief__mode { margin: 16px 16px 6px; }
  .ui-as-brief__section { padding: 16px; }
  .ui-as-brief__section--split { flex-wrap: wrap; }
  .ui-as-brief__go { padding: 14px 16px 16px; }
}
/* Phones: the conversation keeps the window's frame – the composer sits the frame gap from the edges on all three
   sides, with the window's corners, and what's inside it, the thread and the bar line up with its text */
@container ui-as (max-width: 420px) {
  .ui-as-chat__main[data-surface="page"] > .ui-as-chat__composer { padding: 0 var(--frame-gap) var(--frame-gap); }
  .ui-as-chat__main[data-surface="page"] .ui-as-composer__card { padding: 12px 8px 6px 12px; border-radius: calc(10px * var(--squircle-factor, 1)); }
  .ui-as-chat__main[data-surface="page"] .ui-as-composer__bar { margin-top: 14px; }
  .ui-as-chat__main[data-surface="page"] > .ui-as-chat__bar { padding: 0 calc(var(--frame-gap) + 8px) 0 calc(var(--frame-gap) + 12px); }
  .ui-as-chat__main[data-surface="page"] > .ui-as-chat__bar .ui-as-chat__speaker { padding-left: 0; }
  /* The thread runs to the frame gap too, so cards take the chat's full width like the composer; text keeps the
     composer's inner inset, so every line of it starts where the composer's does */
  .ui-as-chat__main[data-surface="page"] > .ui-as-chat__thread { --ui-as-chat-inset: 12px; padding: 12px var(--frame-gap) 16px; }
  .ui-as-chat__main[data-surface="page"] .ui-as-chat__column { gap: 16px; }
  .ui-as-chat__main[data-surface="page"] .ui-as-chat__column > :not(.ui-tc, .ui-tc-group) { padding-inline: var(--ui-as-chat-inset); }
  .ui-as-chat__main[data-surface="page"] .ui-tc-group__list { gap: 6px; padding-top: 6px; }
  /* The clip's room for the cards' shadows stays inside the thread's own gap, so nothing scrolls sideways */
  .ui-as-chat__main[data-surface="page"] .ui-tc-group > .ui-tc__body > .ui-tc__clip { margin-inline: calc(-1 * var(--frame-gap)); padding-inline: var(--frame-gap); }
  /* Cards: tighter insets */
  .ui-as-chat__main[data-surface="page"] .ui-tc__head { gap: 8px; min-height: 40px; padding: 6px 8px 6px 7px; }
  .ui-as-chat__main[data-surface="page"] .ui-tc__sections { gap: 10px; padding: 8px; }
  .ui-as-chat__main[data-surface="page"] .ui-tc__code { padding: 8px 10px; }
}
`;
