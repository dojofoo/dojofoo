import type { IconGlyph } from "~/lib/icons";
import codex from "../../../../apps/web/public/agents/codex.svg?raw";
import cursor from "../../../../apps/web/public/agents/cursor.svg?raw";
import fx from "../../../../apps/web/public/agents/fx.svg?raw";
import grok from "../../../../apps/web/public/agents/grok.svg?raw";
import opencode from "../../../../apps/web/public/agents/opencode.svg?raw";
import pi from "../../../../apps/web/public/agents/pi.svg?raw";

/*
 * The coding harnesses' marks, from the website's "Works with" row (apps/web/public/agents) – one source for both. The
 * wordmarks are cropped to their mark (the viewBoxes below), and every mark draws in currentColor, so it follows the
 * text around it in light and dark; OpenCode keeps its two tones as two opacities.
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
export const OpenCodeIcon = harness(opencode, "-30 0 300 300", (body) => body.replace('fill="#4b4646"', 'fill="currentColor" fill-opacity="0.3"').replace('fill="#f1ecec"', 'fill="currentColor"'));
export const PiIcon = harness(pi, "100 100 600 600", (body) => body.replaceAll('fill="#fff"', 'fill="currentColor"'));

/** The harnesses by name, as the website lists them */
export const harnessIcons = { OpenCode: OpenCodeIcon, Codex: CodexIcon, Grok: GrokIcon, Pi: PiIcon, Cursor: CursorIcon, FX: FxIcon } satisfies Record<string, IconGlyph>;
