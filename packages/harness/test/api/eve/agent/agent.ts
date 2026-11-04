import { defineAgent } from "@dojofoo/harness";
import { mockModel } from "@dojofoo/harness/evals";

/** Replies by what the message asks for: a question, a tool call, a slow or paused reply, files without text, or an echo. */
export default defineAgent({
  model: mockModel({
    modelId: "fixture",
    respond: async ({ userMessages, messages, toolResults }) => {
      // A turn's clientContext reaches the model as its own "Client context: …" user message
      const authored = (text: string) => !text.startsWith("Client context:");
      const message = userMessages.filter(authored).at(-1) ?? "";
      // Eve shows the model a file sent without text as "Attached file <path> (<media type>)"
      if (message.startsWith("Attached file ")) return "I received your notes.";
      // This turn's tool result, not an earlier turn's
      const answered = messages.slice(messages.findLastIndex(item => item.role === "user" && authored(item.text)) + 1).some(item => item.role === "tool");
      const result = answered ? toolResults.at(-1) : undefined;
      if (message.includes("ask")) {
        if (!result) return { toolCalls: [{ name: "ask_question", input: { question: "Review the lesson?", options: [
          { label: "Review", description: "Look at it again" }, { label: "Skip", description: "Move on" },
        ] } }] };
        return `You chose ${(result.output as { answer?: string }).answer}.`;
      }
      if (message.includes("read")) {
        if (!result) return { toolCalls: [{ name: "lesson_note", input: { path: "lesson.md" } }] };
        return `Read: ${String(result.output)}`;
      }
      if (message.includes("slow")) await new Promise(resolve => setTimeout(resolve, 30_000));
      if (message.includes("pause")) await new Promise(resolve => setTimeout(resolve, 5_000));
      return `Echo: ${message}`;
    },
  }),
});
