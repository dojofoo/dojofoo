import type { ReactNode } from "react";

/*
 * Dojo.foo's social cards (Takumi): the grid template's arrangement – a title over its description – on the footer's
 * contour map under a glass-like fade, the logo at the top. A course's card brings the course itself: its color card
 * as the course page shows it, lifted and leaning as if the pointer were over it. Takumi draws flat (no perspective),
 * so the lean is a turn and a skew, the lift a deeper shadow.
 */

export const OG = { width: 1200, height: 630 } as const;

export function DojoOg({ title, description, logo, ground, groundColor, card }: {
  title: string;
  description?: string;
  /** The wordmark, as a data URL */
  logo: string;
  /** The contour map (public/og-ground.png) and its color */
  ground: string;
  groundColor: string;
  /** Beside the words on the right, e.g. a course's card */
  card?: ReactNode;
}) {
  const narrow = Boolean(card);
  return (
    <div style={{ position: "relative", display: "flex", width: "100%", height: "100%", backgroundColor: groundColor, color: "#ffffff" }}>
      <img alt="" src={ground} width={OG.width} height={OG.height} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />
      {/* The fade: clear behind the words, the map showing to the right and below */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(100deg, ${groundColor}b3 0%, ${groundColor}80 35%, ${groundColor}1a 65%, ${groundColor}00 100%)` }} />
      {/* The grid's dotted frame */}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: 64, width: 1, borderLeft: "1px dotted #44403c" }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, right: 64, width: 1, borderLeft: "1px dotted #44403c" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 64, height: 1, borderTop: "1px dotted #44403c" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 64, height: 1, borderTop: "1px dotted #44403c" }} />

      {/* The logo at the top, on the words' edge */}
      <img alt="" src={logo} height={56} width={198} style={{ position: "absolute", top: 98, left: 128, objectFit: "contain", objectPosition: "left" }} />

      <div style={{ position: "absolute", top: 196, bottom: 112, left: 128, width: narrow ? 500 : 896, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ display: "flex", fontFamily: "Khand", fontWeight: 500, fontSize: narrow ? 60 : title.length > 20 ? 72 : 84, lineHeight: 1.08, textWrap: "balance" }}>{title}</div>
        {description && <div style={{ display: "flex", marginTop: 24, color: "#a8a29e", fontFamily: "Hind", fontWeight: 400, fontSize: narrow ? 30 : 38, lineHeight: 1.45, textWrap: "balance", lineClamp: 3 }}>{description}</div>}
      </div>

      {card && <div style={{ position: "absolute", top: 0, bottom: 0, right: 96, display: "flex", alignItems: "center" }}>{card}</div>}
    </div>
  );
}

/** A course's color card (packages/uix ColorCard + CourseCard), drawn for Takumi at `size`, hovered */
export function OgCourseCard({ hue, lines, linesOpacity = 0.55, mark, figure, kicker, title, label, value, tag, size = 420 }: {
  /** The course's hue: its color is oklch(0.58 0.2 hue), as courseColor draws it */
  hue: number;
  /** Its shader's lines, white on black (public/og-cards) */
  lines: string;
  linesOpacity?: number;
  /** Top left: the author, or our logo */
  mark: ReactNode;
  /** Top right, e.g. the version */
  figure?: string;
  kicker?: string;
  title: string;
  label?: string;
  value?: string;
  tag?: string;
  size?: number;
}) {
  // The card's type in proportion to its width (its big size's container units)
  const u = size / 100;
  const color = `oklch(0.58 0.2 ${hue})`;
  // ColorCard's gradient, its relative colors worked out: lighter at the top left, deeper and turned at the bottom right
  const light = `oklch(0.74 0.2 ${hue} / 0.85)`;
  const deep = `oklch(0.3 0.12 ${(hue + 40) % 360})`;
  // The card's edge, seen past its face as it leans: the color at its deepest
  const edge = `oklch(0.2 0.08 ${(hue + 40) % 360})`;
  const radius = 6 * u;
  return (
    <div style={{ position: "relative", display: "flex", transform: "rotate(-3deg) skew(-1deg, 0.5deg)" }}>
      {/* Its thickness, a little below and to the right of the face */}
      <div style={{ position: "absolute", top: 5, left: 3, width: size, height: size, borderRadius: radius, backgroundColor: edge,
        // Lifted off the page, as under the pointer
        boxShadow: "0 56px 90px -16px rgba(0, 0, 0, 0.75), 0 22px 36px -8px rgba(0, 0, 0, 0.5)" }} />
      <div style={{
        position: "relative", display: "flex", flexDirection: "column", width: size, height: size, padding: 8 * u, overflow: "hidden",
        borderRadius: radius, color: "#ffffff", fontFamily: "Inter",
        backgroundImage: `radial-gradient(120% 90% at 0% 0%, ${light}, transparent 60%), linear-gradient(140deg, ${color}, ${deep})`,
      }}>
        <img alt="" src={lines} width={size} height={size} style={{ position: "absolute", top: 0, left: 0, width: size, height: size, mixBlendMode: "screen", opacity: linesOpacity }} />
        {/* The light from the top left: a sheen across the face, its rims lit there and in shade at the bottom right */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(125deg, rgba(255, 255, 255, 0.24) 0%, rgba(255, 255, 255, 0.07) 30%, rgba(255, 255, 255, 0) 50%)" }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: radius, border: "1.5px solid rgba(255, 255, 255, 0.6)", maskImage: "linear-gradient(135deg, black 0%, rgba(0, 0, 0, 0.35) 35%, transparent 60%)" }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: radius, border: "1.5px solid rgba(0, 0, 0, 0.35)", maskImage: "linear-gradient(315deg, black 0%, transparent 45%)" }} />
        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", fontSize: 5.6 * u, fontWeight: 600 }}>{mark}</div>
          {figure && <div style={{ display: "flex", fontSize: 5 * u, fontWeight: 600 }}>{figure}</div>}
        </div>
        <div style={{ position: "relative", display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center", gap: 1.6 * u }}>
          {kicker && <div style={{ display: "flex", fontFamily: "Iosevka", fontSize: 4.6 * u, opacity: 0.72 }}>{kicker}</div>}
          <div style={{ display: "flex", fontSize: 8.2 * u, fontWeight: 600, lineHeight: 1.15, letterSpacing: "-0.015em", textWrap: "balance", lineClamp: 3 }}>{title}</div>
        </div>
        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          {(label || value) && <div style={{ display: "flex", flexDirection: "column", gap: 2.3 * u }}>
            {label && <div style={{ display: "flex", fontSize: 4.4 * u, opacity: 0.72 }}>{label}</div>}
            {value && <div style={{ display: "flex", fontSize: 5 * u, fontWeight: 500 }}>{value}</div>}
          </div>}
          {tag && <div style={{ display: "flex", padding: `${1.6 * u}px ${3.6 * u}px`, borderRadius: 999, backgroundColor: "rgba(255, 255, 255, 0.2)", fontSize: 4.4 * u, fontWeight: 600 }}>{tag}</div>}
        </div>
      </div>
    </div>
  );
}
