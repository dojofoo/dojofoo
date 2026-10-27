export const composerCss = /* css */ `
/* Composer: white card in the gray tray, folder and apps in the tray below */
.ui-as-composer {
  width: 100%;
  padding: 4px;
  border-radius: calc(18px * var(--squircle-factor, 1));
  background: var(--tray);
}
.ui-as-composer[data-bare] { padding: 0; border-radius: 0; background: none; }
.ui-as-composer__card {
  padding: 14px 10px 8px 14px;
  border-radius: calc(14px * var(--squircle-factor, 1));
  background: var(--card);
  box-shadow: var(--shadow-3);
}
.ui-as-composer__field {
  display: block;
  width: 100%;
  min-height: 20px;
  margin: 0;
  padding: 0;
  border: 0;
  resize: none;
  background: transparent;
  font: inherit;
  font-size: var(--fs-subtitle);
  line-height: 20px;
  color: var(--ink);
}
.ui-as-composer__field::placeholder { color: var(--placeholder); }
.ui-as-composer__bar {
  display: flex;
  align-items: center;
  gap: 2px;
  margin: 19px 0 0 -6px;
}
.ui-as-composer__end { display: flex; align-items: center; gap: 4px; margin-left: auto; }
.ui-as-ghost[data-active] { color: var(--ink); }
.ui-as-ghost[data-active] svg { color: var(--accent); }
.ui-as-ghost--model > svg:last-child { margin-left: -2px; color: var(--faint); }
.ui-as-composer .ui-as-menu { min-width: 248px; }
.ui-as-composer__tray .ui-as-anchor { display: flex; }
/* Dictation: the mic turns red and pulses while it listens */
.ui-as-mic[aria-pressed="true"] { background: rgba(220, 38, 38, 0.1); color: #dc2626; animation: ui-as-listen 1s ease-in-out infinite; }
@keyframes ui-as-listen { 50% { box-shadow: 0 0 0 4px rgba(220, 38, 38, 0.12); } }
.ui-as-attachments { display: flex; flex-wrap: wrap; gap: 6px; margin: -4px 0 10px; }
.ui-as-attachment {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 4px 0 9px;
  border-radius: calc(8px * var(--squircle-factor, 1));
  background: var(--chip);
  font-size: var(--fs-caption);
  color: var(--ink);
  animation: ui-as-pop var(--motion-moderate) var(--ease-moderate);
}
.ui-as-attachment > svg { color: var(--muted); }
.ui-as-attachment button { display: grid; place-items: center; width: 20px; height: 20px; border-radius: calc(6px * var(--squircle-factor, 1)); color: var(--muted); }
.ui-as-attachment button:hover { background: var(--hover); color: var(--ink); }
.ui-as-ghost {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  border-radius: calc(8px * var(--squircle-factor, 1));
  font-size: var(--fs-caption);
  color: var(--text);
  transition: background-color var(--motion-fast) var(--ease-fast);
}
.ui-as-ghost svg { color: var(--muted); }
.ui-as-ghost:hover { background: var(--hover); }
.ui-as-ghost--model { font-weight: 550; font-variation-settings: "opsz" 18; color: var(--ink); }
.ui-as-composer__effort { color: var(--muted); font-weight: 400; font-variation-settings: "opsz" 14; }
.ui-as-send {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  margin-left: 2px;
  border-radius: 50%; corner-shape: round;
  background: var(--ink);
  color: var(--on-ink);
  transition: background-color var(--motion-fast) var(--ease-fast), opacity var(--motion-fast) var(--ease-fast), transform var(--motion-fast) var(--ease-fast);
}
/* Nothing to send: the same button, faded like any disabled one */
.ui-as-send:disabled { opacity: 0.4; cursor: not-allowed; }
.ui-as-send:not(:disabled):active { transform: scale(0.94); }

.ui-as-composer__tray {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 37px;
  padding: 0 8px 0 6px;
}
.ui-as-tray-link {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 26px;
  padding: 0 6px;
  border-radius: calc(8px * var(--squircle-factor, 1));
  font-size: 11.5px;
  color: var(--text);
}
.ui-as-tray-link:hover { background: var(--hover); }
/* Glass Folder from the library at icon size; hovering the link opens it like hovering the folder itself */
.ui-as-tray-link__folder { position: relative; flex: none; width: 16px; height: 14px; }
.ui-as-tray-link__folder .ui-fd { position: absolute; top: 50%; left: 50%; width: 40px; translate: -50% -50%; }
.ui-as-tray-link:hover .ui-fd-icon { transform: translate(-50%, -48%) scale(1.03); }
.ui-as-tray-link:hover .ui-fd-doc--left { transform: translate(32px, 70px) rotate(9deg); }
.ui-as-tray-link:hover .ui-fd-doc--right { transform: translate(286px, 76px) rotate(5deg); }
.ui-as-tray-link:hover .ui-fd-doc--middle { transform: translate(166px, 52px) rotate(-7deg); }
.ui-as-tray-link:hover .ui-fd-front {
  top: 24.8%;
  border-radius: calc(3cqw * var(--squircle-factor, 1)) calc(3cqw * var(--squircle-factor, 1)) calc(6.333cqw * var(--squircle-factor, 1)) calc(6.333cqw * var(--squircle-factor, 1));
  transform: translateZ(2.33cqw) rotateX(-9deg);
}
.ui-as-tray-link--apps { gap: 10px; color: var(--muted); }
.ui-as-apps { display: flex; align-items: center; gap: 6px; }
.ui-as-apps svg { width: 13px; height: 13px; }
`;
