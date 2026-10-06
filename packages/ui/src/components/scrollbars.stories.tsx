import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScrollArea } from "./ui/scroll-area";
import { ChatContainer, ChatContainerContent } from "./ui/chat-container";

export default { title: "Components/Scrollbars", parameters: { layout: "padded" } } satisfies Meta;
const content = <div className="h-[900px] p-4">Scroll to compare the shared thumb style.</div>;
export const Surfaces: StoryObj = { render: () => <div className="grid grid-cols-3 gap-6">
  <ScrollArea className="h-64" data-testid="standard-scroll">{content}</ScrollArea>
  <ChatContainer className="h-64" data-testid="compact-scroll"><ChatContainerContent>{content}</ChatContainerContent></ChatContainer>
  <div className="scrollbar-compact h-64 overflow-auto" data-testid="native-scroll">{content}</div>
</div> };
