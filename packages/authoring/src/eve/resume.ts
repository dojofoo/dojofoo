import { EveAgentStore, defaultMessageReducer, type ClientSession, type MessageStreamEvent } from "@dojofoo/agent/client";

/** Read-only replay/follow. Eve owns cursor recovery and settled-tail detection.
 * This store exists only for the observer request; no second durable history.
 */
export function resumeEveEvents(session: ClientSession, signal: AbortSignal, initialEvents: readonly MessageStreamEvent[] = []): AsyncIterable<MessageStreamEvent> {
  const store = new EveAgentStore({ session, initialEvents, reducer: defaultMessageReducer(), optimistic: false });
  let closed = false;
  let emitted = false;
  const dispose = () => {
    closed = true;
    signal.removeEventListener("abort", abort);
    // Public reset only discards this observer's local state and aborts its
    // transport. It does not call session.cancel() or retire the native session.
    store.reset();
  };
  let abort: () => void;
  const output = new ReadableStream<MessageStreamEvent>({
    start(controller) {
      abort = () => {
        if (closed) return;
        dispose();
        controller.error(signal.reason ?? new Error("Observer disconnected"));
      };
      if (signal.aborted) { abort(); return; }
      signal.addEventListener("abort", abort, { once: true });
      store.setCallbacks({ onEvent(event) { if (!closed) { emitted = true; controller.enqueue(event); } } });
      void store.resume().then(() => {
        if (closed) return;
        const error = store.snapshot.error;
        // A settled seeded snapshot needs no replay. Forward its actual final
        // boundary so the AG-UI projector can finish without inventing an event.
        const tail = store.snapshot.events.at(-1);
        if (!error && !emitted && tail) controller.enqueue(tail);
        dispose();
        if (error) controller.error(error);
        else controller.close();
      }, error => {
        if (closed) return;
        dispose();
        controller.error(error);
      });
    },
    cancel() { if (!closed) dispose(); },
  });
  return output;
}
