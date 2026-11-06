import { defineWebSocketHandler } from "nitro";
import { localAgentRuntime } from "../../../src/server/agent-api";
import { createLessonSocket } from "../../../src/server/session/lesson-socket";

const socket = createLessonSocket({ runtime: localAgentRuntime });

export default defineWebSocketHandler({
  upgrade(request) {
    socket.upgrade(request);
  },
  async open(peer) {
    await socket.open(peer);
  },
  async message(peer, message) {
    await socket.message(peer, message.text());
  },
  close(peer) {
    socket.close(peer);
  },
});
