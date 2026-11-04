export type SessionPeer = {
  request: Request;
  send(data: string): unknown;
  peers: Iterable<SessionPeer>;
};

/** The peers of one page key (`workspace`, `course`, `lesson`), or of one ACP thread (`session`) until the kata page moves to Eve. */
export class SessionChannel {
  readonly id: string;

  constructor(private readonly peer: SessionPeer) {
    const id = channelId(peer);
    if (!id) throw new Error("A session-bound connection is required");
    this.id = id;
  }

  send(value: unknown): void {
    this.peer.send(JSON.stringify(value));
  }

  broadcast(value: unknown): void {
    const data = JSON.stringify(value);
    for (const peer of this.peer.peers) {
      if (peer === this.peer || channelId(peer) !== this.id) continue;
      peer.send(data);
    }
  }

  emit(value: unknown): void {
    this.send(value);
    this.broadcast(value);
  }
}

function channelId(peer: Pick<SessionPeer, "request">): string | null {
  const query = new URL(peer.request.url).searchParams;
  const session = query.get("session");
  if (session) return session;
  const workspace = query.get("workspace");
  const course = query.get("course");
  return workspace && course ? `page:${workspace}\0${course}\0${query.get("lesson") ?? ""}` : null;
}
