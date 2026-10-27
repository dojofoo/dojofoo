import { Button } from "./button";

export type QueuedMessage = { id: string; text: string };

/** The host owns delivery and cancellation; this list only presents its pending notes. */
export function MessageQueue({ queued, running = "Queued", onCancel }: {
  queued: readonly QueuedMessage[];
  running?: string;
  onCancel?: (id: string) => void;
}) {
  if (!queued.length) return null;
  return <section className="ui-message-queue" data-slot="message-queue" aria-label="Queued messages">
    <style href="ui-message-queue" precedence="default">{css}</style>
    <div className="ui-message-queue__heading"><span>{running}</span><span>{queued.length} queued</span></div>
    <ul>{queued.map(message => <li key={message.id}>
      <span className="ui-message-queue__text">{message.text}</span>
      {onCancel && <Button variant="ghost" size="sm" aria-label={`Remove "${message.text}" from the queue`} onClick={() => onCancel(message.id)}>Remove</Button>}
    </li>)}</ul>
  </section>;
}

const css = /* css */ `
.ui-message-queue { min-width: 0; margin-bottom: 8px; font-size: .875rem; line-height: 1.5; color: var(--fluid-foreground); }
.ui-message-queue__heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; color: var(--fluid-muted); font-size: .8125rem; }
.ui-message-queue__heading > :last-child { flex: none; font-variant-numeric: tabular-nums; }
.ui-message-queue ul { margin: 4px 0 0; padding: 0; list-style: none; }
.ui-message-queue li { display: flex; align-items: start; justify-content: space-between; gap: 8px; padding: 4px 0; }
.ui-message-queue__text { min-width: 0; flex: 1; white-space: pre-wrap; overflow-wrap: anywhere; }
.ui-message-queue .ui-button { flex: none; }
`;
