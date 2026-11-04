/** Hidden turns the UI server or a persona sends; the chat never shows them. */
export const dojoTags = { begin: "[dojo:begin]", check: "[dojo:check]", beginAuthoring: "[dojo:begin-authoring]" } as const;
export type DojoTag = (typeof dojoTags)[keyof typeof dojoTags];

export function tagged(tag: DojoTag, text: string): string {
  return `${tag} ${text}`;
}

/** Hidden in the chat: a message that starts with a [dojo:<name>] tag (not a dojo:// link) */
export function isTaggedTurn(text: string): boolean {
  return /^\[dojo:[a-z-]+\]/u.test(text);
}
