import type { IconGlyph } from "../lib/icons";

export const Icon = ({ icon: Glyph, size = 16, stroke, color = "currentColor" }: { icon: IconGlyph; size?: number; stroke?: number; color?: string }) => (
  <Glyph size={size} stroke={stroke} color={color} />
);
