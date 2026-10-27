import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState, type ComponentProps } from "react";
import { MessageQueue } from "../components/message-queue";

function QueuePreview(props: ComponentProps<typeof MessageQueue>) {
  const [queued, setQueued] = useState(props.queued);
  useEffect(() => setQueued(props.queued), [props.queued]);
  return <MessageQueue {...props} queued={queued} onCancel={props.onCancel ? id => {
    props.onCancel?.(id);
    setQueued(items => items.filter(item => item.id !== id));
  } : undefined} />;
}

const meta = {
  title: "Components/Molecules/Message Queue",
  component: MessageQueue,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div style={{ maxWidth: 400 }}><Story /></div>],
  args: { running: "Kyoshi is responding", queued: [
    { id: "first", text: "Keep the opening example short." },
    { id: "second", text: "Use plain language and keep each example focused. ".repeat(8).trim() },
  ], onCancel: () => {} },
  render: args => <QueuePreview {...args} />,
} satisfies Meta<typeof MessageQueue>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Queued: Story = {};
export const Waiting: Story = { args: { running: "Waiting for your answer" } };
export const ReadOnly: Story = { args: { onCancel: undefined } };
export const Empty: Story = { args: { queued: [] } };
