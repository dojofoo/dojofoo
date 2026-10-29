import type { IconGlyph } from "../lib/icons";
import codex from "../assets/agents/codex.svg?raw";
import cursor from "../assets/agents/cursor.svg?raw";
import fx from "../assets/agents/fx.svg?raw";
import grok from "../assets/agents/grok.svg?raw";
import opencode from "../assets/agents/opencode.svg?raw";
import pi from "../assets/agents/pi.svg?raw";

/*
 * The coding harnesses' marks, from the website's "Works with" row (apps/web/public/agents) – one source for both. The
 * wordmarks are cropped to their mark (the viewBoxes below), and every mark draws in currentColor, so it follows the
 * text around it in light and dark.
 */
function harness(svg: string, viewBox: string, recolor: (body: string) => string = (body) => body): IconGlyph {
  const body = recolor(svg.replace(/^[\s\S]*?<svg[^>]*>|<\/svg>\s*$/g, ""));
  return function Harness({ size, color, className }) {
    return <svg viewBox={viewBox} width={size} height={size} color={color} fill="currentColor" className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: body }} />;
  };
}

export const CodexIcon = harness(codex, "0 0 361 360");
export const CursorIcon = harness(cursor, "-23 0 545 545");
export const FxIcon = harness(fx, "166.241 0 155.861 156");
export const GrokIcon = harness(grok, "0 -0.5 34 34");
export const OpenCodeIcon = harness(opencode, "0 0 24 24");
export const PiIcon = harness(pi, "100 100 600 600", (body) => body.replaceAll('fill="#fff"', 'fill="currentColor"'));

/** The harnesses by name, as the website lists them */
export const harnessIcons = { OpenCode: OpenCodeIcon, Codex: CodexIcon, Grok: GrokIcon, Pi: PiIcon, Cursor: CursorIcon, FX: FxIcon } satisfies Record<string, IconGlyph>;
