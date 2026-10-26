import type { Meta, StoryObj } from "@storybook/react-vite";
import { CertificateSeal } from "~/components/certificate-seal";
import { expect, within } from "storybook/test";

const meta = {
  title: "Components/Atoms/Certificate Seal",
  component: CertificateSeal,
  args: { digest: "d1d0ac5f87007c80c7a0d1773773b4ac9361c8aba3c175473f46bff44da78f8d", deformation: "twisted", relief: 1, animated: true, duration: 18 },
  argTypes: {
    digest: { control: "text", description: "64 hex characters. Reproduces the pattern; does not prove issuance." },
    deformation: { control: "inline-radio", options: ["hash", "pleated", "twisted", "hybrid"] },
    animated: { control: "boolean", description: "The twist rolls round the rings and loops back exactly to the seal at rest. Reduced motion keeps it still." },
    duration: { control: { type: "range", min: 4, max: 40, step: 1 }, description: "Seconds per loop." },
    relief: { control: { type: "range", min: 0, max: 1, step: 0.05 }, description: "Zero is flat; one is full relief. Camera, size and line count stay fixed." },
  },
  render: args => <div style={{ width: 152 }}><CertificateSeal {...args} /></div>,
} satisfies Meta<typeof CertificateSeal>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
export const ReliefComparison: StoryObj<typeof meta> = {
  render: args => <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 32, maxWidth: 1000 }}>
    {[0, 0.5, 1].map(relief => <figure key={relief} style={{ margin: 0, textAlign: "center" }}>
      <CertificateSeal {...args} relief={relief} />
      <figcaption>{relief === 0 ? "Flat" : relief === 1 ? "Full twist" : "Half relief"}</figcaption>
    </figure>)}
  </div>,
};
export const HashVariations: StoryObj<typeof meta> = {
  render: args => <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 32, maxWidth: 1000 }}>
    {["ab", "35", "c7", "f1"].map(seed => <figure key={seed} style={{ margin: 0, textAlign: "center" }}>
      <CertificateSeal {...args} digest={seed.repeat(32)} />
      <figcaption><code>{seed.repeat(4)}…</code></figcaption>
    </figure>)}
  </div>,
  play: async ({ canvasElement }) => {
    const seals = within(canvasElement).getAllByRole("img", { name: "Dojo certificate seal" });
    await expect(seals).toHaveLength(4);
    // Each digest its own rings – flat, four of them, no 3D orbits – in the medallion at the foot of the same laurel
    const rings = seals.map(seal => Array.from(seal.querySelectorAll('[data-part="watermark"] path'), path => path.getAttribute("d")).join("|"));
    await expect(new Set(rings).size).toBe(4);
    for (const seal of seals) {
      await expect(seal.querySelectorAll('[data-part="watermark"] path')).toHaveLength(4);
      await expect(seal.querySelectorAll('[data-part="orbit"]')).toHaveLength(0);
      await expect(seal.querySelectorAll('[data-part="laurel"] path')).toHaveLength(9);
      await expect(seal.querySelectorAll('[data-part="medallion"] [data-part="watermark"] path')).toHaveLength(4);
      await expect(seal.querySelector('[data-part="word"]')).toHaveTextContent("CERTIFICATE");
    }
  },
};
