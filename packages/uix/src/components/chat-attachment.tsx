import { File01Icon } from "../lib/icons";

/** A received attachment. The host resolves sources; provider file handles have no preview URL. */
export function ChatAttachment({ kind, name, src }: {
  kind: "image" | "audio" | "video" | "document";
  name: string;
  src?: string;
}) {
  const url = src && /^(?:https?:|blob:|data:|\/(?!\/))/iu.test(src) ? src : undefined;
  return <figure className="ui-chat-attachment">
    <style href="ui-chat-attachment" precedence="default">{css}</style>
    {url && kind === "image" && <img src={url} alt={name} loading="lazy" />}
    {url && kind === "audio" && <audio src={url} aria-label={name} controls preload="none" />}
    {url && kind === "video" && <video src={url} aria-label={name} controls preload="none" />}
    <figcaption>
      <File01Icon size={16} color="currentColor" />
      {url ? <a href={url} download={url.startsWith("data:") ? name : undefined} target="_blank" rel="noopener noreferrer">{name}</a> : <span>{name}</span>}
      {!url && <span className="ui-chat-attachment__unavailable">Preview unavailable</span>}
    </figcaption>
  </figure>;
}

const css = /* css */ `
.ui-chat-attachment { min-width: 0; max-width: 100%; margin: 0; color: var(--fluid-foreground); }
.ui-chat-attachment > img, .ui-chat-attachment > video { display: block; width: auto; max-width: 100%; max-height: 280px; border-radius: calc(8px * var(--squircle-factor, 1)); }
.ui-chat-attachment > audio { display: block; width: 320px; max-width: 100%; }
.ui-chat-attachment figcaption { display: grid; grid-template-columns: 16px minmax(0, 1fr); align-items: center; gap: 6px; width: fit-content; max-width: 100%; margin-top: 4px; padding: 5px 9px; border-radius: calc(8px * var(--squircle-factor, 1)); background: var(--fluid-hover); font-size: var(--fs-caption); overflow-wrap: anywhere; }
.ui-chat-attachment figcaption > svg { color: var(--fluid-muted); }
.ui-chat-attachment a { min-width: 0; color: inherit; text-decoration: underline; text-underline-offset: 3px; }
.ui-chat-attachment a:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
.ui-chat-attachment__unavailable { grid-column: 2; color: var(--fluid-muted); }
`;
