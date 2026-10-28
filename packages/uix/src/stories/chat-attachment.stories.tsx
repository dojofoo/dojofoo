import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChatAttachment } from "../components/chat-attachment";
import { ChatMessage } from "../components/chat-message";

const outline = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" rx="12" fill="#173a3a"/><path d="M48 90h224M160 42v96" stroke="#6ac8b7" stroke-width="4"/><circle cx="160" cy="90" r="24" fill="#6ac8b7"/></svg>')}`;
const recording = "data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";

const meta = {
  title: "Components/Molecules/Chat Attachment",
  component: ChatAttachment,
  parameters: { layout: "padded" },
  decorators: [Story => <div style={{ maxWidth: 360 }}><ChatMessage role="assistant"><Story /></ChatMessage></div>],
  args: { kind: "image", name: "Lesson outline.svg", src: outline },
} satisfies Meta<typeof ChatAttachment>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Image: Story = {};
export const Audio: Story = { args: { kind: "audio", name: "Notes.wav", src: recording } };
export const Video: Story = { args: { kind: "video", name: "Lesson recording.webm", src: "/fixtures/lesson-video.webm" } };
export const Document: Story = { args: { kind: "document", name: "Course guidance.md", src: "data:text/markdown,Choose%20one%20learning%20outcome." } };
export const ProviderFile: Story = { args: { kind: "document", name: "Course guidance.pdf", src: undefined } };
export const LongFilename: Story = { args: { name: "An-outline-with-a-long-filename-that-still-fits-inside-a-narrow-conversation-column.svg" } };
