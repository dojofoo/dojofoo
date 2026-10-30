---
"@dojofoo/uix": patch
"@dojofoo/ui": patch
---

The Sensei's chat renders in uix: `components/streamed-message` (its activity panel, questions, checks and attachments), `components/chat-transcript`, `components/agent-question` and `components/ask-user-questions` moved from packages/ui, which keeps only what the app knows – Eve's tool calls and questions, its own lesson messages, the authored fragments it shows.

Its Markdown is Streamdown (`components/chat-markdown`): headings, nested and task lists, quotes, tables, links, rules, emphasis and strikethrough in the chat's own type, fenced code in a CodeBlock, and `[highlight:L3-5]` as a chip that highlights those lines in the editor. Turns in the chat pane keep the column's spacing (`ui-as-chat__turns`), and ask-user tools keep `multiSelect`.

Storybook's Components/Organisms/Sensei Chat shows the chat on the right of a lesson, as the app does: thinking, working, waiting, testing, checks that fail and pass, tool calls, questions with one answer, several, an open one and an answered one, line highlights, Markdown and a streaming reply. The Conversation story and Chat/Activity's stories of components the app doesn't use are gone; the Interactive lesson and the demo pages' chats (Pages/Dojo and others) render through the same renderer.
