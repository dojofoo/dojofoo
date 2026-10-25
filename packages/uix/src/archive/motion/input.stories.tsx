import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CSSProperties } from "react";
import { Input } from "./input";

const meta = {
  title: "Archive/Animated Controls/Input",
  component: Input,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Input>;

export default meta;

type Story = StoryObj<typeof meta>;

const successStyle = {
  "--color-success": "#30a46c",
} as CSSProperties;

export const Default: Story = {
  render: () => (
    <main
      className="grid min-w-[42rem] gap-10 bg-background p-12 text-foreground"
      style={successStyle}
    >
      <section className="grid gap-4">
        <h2 className="text-sm font-medium">States</h2>
        <div className="grid grid-cols-2 gap-6">
          <Input label="Default" placeholder="Enter a value" />
          <Input
            defaultValue="A populated value"
            label="Populated"
            placeholder="Enter a value"
          />
          <Input
            defaultValue="hello@dojofoo.dev"
            label="Success"
            success
            type="email"
          />
          <Input
            defaultValue="not-an-email"
            error="Enter a valid email address."
            label="Error"
            reserveErrorLine
            type="email"
          />
          <Input disabled label="Disabled" placeholder="Unavailable" />
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="text-sm font-medium">Types</h2>
        <div className="grid grid-cols-2 gap-6">
          <Input label="Email" placeholder="you@example.com" type="email" />
          <Input label="Password" placeholder="Password" type="password" />
          <Input label="Search" placeholder="Search…" type="search" />
          <Input label="Telephone" placeholder="+49 123 456789" type="tel" />
        </div>
      </section>
    </main>
  ),
};
