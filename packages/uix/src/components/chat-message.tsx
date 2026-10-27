import type { HTMLAttributes, ReactNode } from "react";

/** The approved message frame; applications own content, streaming and history. */
export function ChatMessage({ role, children, className, ...props }: Omit<HTMLAttributes<HTMLDivElement>, "role"> & {
  role: "user" | "assistant";
  children: ReactNode;
}) {
  return <div {...props} className={[role === "user" ? "ui-as-msg-user" : "ui-as-msg", className].filter(Boolean).join(" ")}>
    <ChatStyles />
    {children}
  </div>;
}

export function ChatStyles() {
  return <style href="ui-screen-chat" precedence="default">{chatCss}</style>;
}

const chatCss = /* css */ `
/* Chat thread shared by Assistant Home and Agent Chat */
.ui-as-msg-user {
  align-self: flex-end;
  max-width: 80%;
  margin: 0;
  padding: 9px 14px;
  border-radius: calc(16px * var(--squircle-factor, 1));
  background: var(--chip);
  font-size: 14px;
  line-height: 1.5;
  color: var(--ink);
  animation: ui-as-msg-in var(--motion-slow) var(--ease-slow) both;
}
.ui-as-msg {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--ink);
  animation: ui-as-msg-in var(--motion-slow) var(--ease-slow) 160ms both;
}
.ui-as-msg__thinking.ui-think { zoom: 0.92; width: 100%; max-width: 440px; }
.ui-as-msg__p { margin: 0; animation: ui-as-msg-fade var(--motion-slow) var(--ease-slow) both; }
@keyframes ui-as-msg-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes ui-as-msg-fade { from { opacity: 0; } to { opacity: 1; } }
`;

