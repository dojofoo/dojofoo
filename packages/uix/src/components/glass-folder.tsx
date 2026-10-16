import { useId } from "react";

/*
 * Glass Folder – a glassy folder illustration, in a single self-contained file.
 * Three documents sit in a blue folder behind a frosted front pocket.
 * Hover the folder: the pocket tips forward and every document shifts on its own.
 * The artwork scales with its container and keeps a 3 : 2 frame.
 */

export type GlassFolderProps = {
  className?: string;
  /** Accessible description of the scene */
  label?: string;
};

const BACK =
  "M38 0H176Q196 0 204 14L218 30Q224 38 246 38H562Q600 38 600 76V462Q600 500 562 500H38Q0 500 0 462V38Q0 0 38 0Z";
const LINES = [78, 180, 140, 175, 126, 168, 110];

export function GlassFolder({
  className,
  label = "Blue folder holding three documents behind a frosted front pocket",
}: GlassFolderProps) {
  const id = "ui-fd" + useId().replace(/[^a-zA-Z0-9_-]/g, "");

  return (
    // An empty label marks the folder as decoration next to its own text, so it stays out of the accessibility tree
    <div className={["ui-fd", className].filter(Boolean).join(" ")} {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>
      {/* React 19 hoists this into <head> once, no matter how many instances render */}
      <style href="ui-glass-folder" precedence="default">
        {css}
      </style>
      <div className="ui-fd-icon" aria-hidden="true">
        {/* Back of the folder with its tab */}
        <svg className="ui-fd-layer ui-fd-back" viewBox="0 0 600 500">
          <defs>
            <filter id={`${id}-hl`} x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blur" />
              <feOffset in="blur" dy="3" result="offset" />
              <feComposite in="blur" in2="offset" operator="arithmetic" k2="1" k3="-1" result="diff" />
              <feFlood floodColor="#fff" floodOpacity="0.65" />
              <feComposite in2="diff" operator="in" result="light" />
              <feComposite in="light" in2="SourceAlpha" operator="in" />
            </filter>
          </defs>
          <path className="ui-fd-back-fill" d={BACK} fill="#5bb7ea" />
          <path d={BACK} fill="#000" filter={`url(#${id}-hl)`} />
        </svg>

        {/* Documents – each one moves on its own */}
        <svg className="ui-fd-layer" viewBox="0 0 600 500">
          <defs>
            <linearGradient id={`${id}-paper`} x1="0" y1="0" x2="0" y2="1">
              <stop className="ui-fd-paper-top" offset="0%" stopColor="#fff" />
              <stop className="ui-fd-paper-bottom" offset="100%" stopColor="#eaf2f8" />
            </linearGradient>
            <symbol id={`${id}-doc`} overflow="visible">
              <rect className="ui-fd-paper" x="0.6" y="0.6" width="278.8" height="348.8" rx="19.4" fill={`url(#${id}-paper)`} stroke="rgba(0,0,0,0.12)" strokeWidth="1.2" />
              {LINES.map((w, i) => (
                <rect key={i} className="ui-fd-line" x="30" y={87 + i * 28} width={w} height="9" rx="4.5" fill="rgba(0,0,0,0.12)" />
              ))}
            </symbol>
          </defs>
          <use className="ui-fd-doc ui-fd-doc--left" href={`#${id}-doc`} />
          <use className="ui-fd-doc ui-fd-doc--right" href={`#${id}-doc`} />
          <use className="ui-fd-doc ui-fd-doc--middle" href={`#${id}-doc`} />
        </svg>

        {/* Frosted front pocket */}
        <div className="ui-fd-front" />
      </div>
    </div>
  );
}

/* ---------- Styles ---------- */

const css = /* css */ `
.ui-fd {
  --ui-fd-ease: cubic-bezier(0.2, 0.85, 0.25, 1);
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 2;
  overflow: hidden;
  container-type: inline-size;
  font-family: var(--ui-font, "Inter Variable", "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif);
}

/* The folder is drawn on a 600 × 500 grid; cqw keeps every detail in proportion */
.ui-fd-icon {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 40%;
  aspect-ratio: 6 / 5;
  container-type: inline-size;
  perspective: 220cqw;
  perspective-origin: 50% 60%;
  transform: translate(-50%, -48%);
  transition: transform 0.6s var(--ui-fd-ease);
}
.ui-fd-icon:hover { transform: translate(-50%, -48%) scale(1.03); }

.ui-fd-layer { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.ui-fd-back {
  filter:
    drop-shadow(0 4cqw 4.6cqw rgba(60, 130, 180, 0.28))
    drop-shadow(0 1.3cqw 2cqw rgba(60, 130, 180, 0.16))
    drop-shadow(0 0.3cqw 0.7cqw rgba(60, 130, 180, 0.1));
}

.ui-fd-doc {
  transform-box: fill-box;
  transform-origin: center;
  filter: drop-shadow(0 3px 4px rgba(0, 30, 60, 0.18));
  transition: transform 0.55s var(--ui-fd-ease);
}
.ui-fd-doc--left   { transform: translate(40px, 80px) rotate(6deg); }
.ui-fd-doc--right  { transform: translate(280px, 80px) rotate(6deg); }
.ui-fd-doc--middle { transform: translate(160px, 66px) rotate(-4deg); }
.ui-fd-icon:hover .ui-fd-doc--left   { transform: translate(32px, 70px) rotate(9deg); }
.ui-fd-icon:hover .ui-fd-doc--right  { transform: translate(286px, 76px) rotate(5deg); }
.ui-fd-icon:hover .ui-fd-doc--middle { transform: translate(166px, 52px) rotate(-7deg); }

/* Pocket: top edge at 108 of 500, corners 38; on hover it drops to 124 and tips forward */
.ui-fd-front {
  position: absolute;
  inset: 21.6% 0 0;
  border-radius: 6.333cqw;
  background:
    linear-gradient(180deg, rgba(0, 40, 75, 0) 74%, rgba(0, 40, 75, 0.28) 100%),
    linear-gradient(180deg, rgba(132, 214, 248, 0.45) 0%, rgba(69, 170, 220, 0.45) 100%);
  box-shadow: inset 0 0 0 0.67cqw rgba(255, 255, 255, 0.3), inset 0 0.25cqw 0 rgba(255, 255, 255, 0.55);
  -webkit-backdrop-filter: blur(3.3cqw) saturate(1.1);
  backdrop-filter: blur(3.3cqw) saturate(1.1);
  transform-origin: 50% 100%;
  transition: top 0.6s var(--ui-fd-ease), border-radius 0.6s var(--ui-fd-ease), transform 0.6s var(--ui-fd-ease);
}
.ui-fd-icon:hover .ui-fd-front {
  top: 24.8%;
  border-radius: 3cqw 3cqw 6.333cqw 6.333cqw;
  transform: translateZ(2.33cqw) rotateX(-9deg);
}

/* Dark mode: follows a .dark class or data-theme="dark" on any ancestor, e.g. <html>.
   Dark paper with light lines, a deeper blue folder and a pocket that lets less light through. */
:where(.dark, [data-theme="dark"]) .ui-fd-back-fill { fill: #3d8fc6; }
:where(.dark, [data-theme="dark"]) .ui-fd-paper-top { stop-color: #34363c; }
:where(.dark, [data-theme="dark"]) .ui-fd-paper-bottom { stop-color: #26292f; }
:where(.dark, [data-theme="dark"]) .ui-fd-paper { stroke: rgba(255, 255, 255, 0.1); }
:where(.dark, [data-theme="dark"]) .ui-fd-line { fill: rgba(255, 255, 255, 0.16); }
:where(.dark, [data-theme="dark"]) .ui-fd-back {
  filter:
    drop-shadow(0 4cqw 4.6cqw rgba(0, 0, 0, 0.45))
    drop-shadow(0 1.3cqw 2cqw rgba(0, 0, 0, 0.3));
}
:where(.dark, [data-theme="dark"]) .ui-fd-doc { filter: drop-shadow(0 3px 4px rgba(0, 0, 0, 0.45)); }
:where(.dark, [data-theme="dark"]) .ui-fd-front {
  background:
    linear-gradient(180deg, rgba(0, 20, 40, 0) 70%, rgba(0, 20, 40, 0.4) 100%),
    linear-gradient(180deg, rgba(100, 190, 235, 0.42) 0%, rgba(45, 130, 190, 0.5) 100%);
  box-shadow: inset 0 0 0 0.67cqw rgba(255, 255, 255, 0.14), inset 0 0.25cqw 0 rgba(255, 255, 255, 0.3);
}

@media (prefers-reduced-motion: reduce) {
  .ui-fd-icon, .ui-fd-doc, .ui-fd-front { transition: none; }
}
`;
