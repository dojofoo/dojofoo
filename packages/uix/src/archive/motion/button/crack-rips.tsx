import { forwardRef, useId, useImperativeHandle, useRef } from "react";
import { projectParticlePath } from "./particle-path";

const CRACK_LENGTH = 40;
const CRACKS_PER_PRESS = 5;
const SLOT_COUNT = 20;
const CRACK_VARIANTS = 6;

export type CrackRipsHandle = {
  trigger: (geometry: {
    height: number;
    pointerX: number;
    pointerY: number;
    width: number;
  }) => void;
};

function randomBetween(minimum: number, maximum: number) {
  return minimum + Math.random() * (maximum - minimum);
}

export const CrackRips = forwardRef<CrackRipsHandle>(function CrackRips(
  _,
  forwardedRef,
) {
  const prefix = `crack-${useId().replaceAll(":", "")}`;
  const svg = useRef<SVGSVGElement>(null);
  const slots = useRef<Array<SVGGElement | null>>([]);
  const uses = useRef<Array<SVGUseElement | null>>([]);
  const reveals = useRef<Array<SVGAnimationElement | null>>([]);
  const fades = useRef<Array<SVGAnimationElement | null>>([]);
  const active = useRef<boolean[]>([]);
  const generations = useRef<number[]>([]);
  const nextSlot = useRef(0);

  useImperativeHandle(forwardedRef, () => ({
    trigger: ({ height, pointerX, pointerY, width }) => {
      if (!svg.current) return;
      svg.current.setAttribute("height", String(height));
      svg.current.setAttribute("viewBox", `0 0 ${width} ${height}`);
      svg.current.setAttribute("width", String(width));

      const offsetX = pointerX - width / 2;
      const offsetY = pointerY - height / 2;
      const direction =
        Math.hypot(offsetX, offsetY) < 2
          ? 90
          : Math.atan2(offsetY, offsetX) * 180 / Math.PI;
      const spread = 72;
      const sector = spread / CRACKS_PER_PRESS;

      for (let index = 0; index < CRACKS_PER_PRESS; index += 1) {
        let slot: number | undefined;
        for (let offset = 0; offset < SLOT_COUNT; offset += 1) {
          const candidate = (nextSlot.current + offset) % SLOT_COUNT;
          if (active.current[candidate]) continue;
          slot = candidate;
          active.current[candidate] = true;
          nextSlot.current = (candidate + 1) % SLOT_COUNT;
          break;
        }
        if (slot === undefined) break;

        const group = slots.current[slot];
        const use = uses.current[slot];
        const reveal = reveals.current[slot];
        const fade = fades.current[slot];
        if (!group || !use || !reveal || !fade) {
          active.current[slot] = false;
          continue;
        }

        const angle = direction - spread / 2 + (index + Math.random()) * sector;
        const length = randomBetween(19, 34);
        const projection = projectParticlePath(
          {
            centerX: width / 2,
            centerY: height / 2,
            insetHalfHeight: height / 2,
            insetHalfWidth: width / 2,
          },
          angle,
          length,
        );
        const generation = (generations.current[slot] ?? 0) + 1;
        generations.current[slot] = generation;

        use.setAttribute(
          "href",
          `#${prefix}-${Math.floor(Math.random() * CRACK_VARIANTS)}`,
        );
        group.setAttribute(
          "transform",
          `translate(${projection.startX} ${projection.startY}) rotate(${angle}) scale(${length / CRACK_LENGTH} ${Math.random() < 0.5 ? -1 : 1})`,
        );
        group.setAttribute("visibility", "visible");
        fade.addEventListener(
          "endEvent",
          () => {
            if (generations.current[slot!] !== generation) return;
            active.current[slot!] = false;
            group.setAttribute("visibility", "hidden");
          },
          { once: true },
        );
        const delay = index * 0.013;
        reveal.beginElementAt(delay);
        fade.beginElementAt(delay);
      }
    },
  }));

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 z-0 overflow-visible [color:color-mix(in_oklch,var(--primary)_48%,#252525_52%)]"
      height="1"
      ref={svg}
      viewBox="0 0 1 1"
      width="1"
    >
      <defs>
        <path id={`${prefix}-0`} d="M0-2 6-3 12 .7 19-4 27 .2 34-2 40 0 34-.5 27 1.8 19-2 12 3 6-1 0 1.6ZM12 1 16 7 23 9 18 5 14 .1ZM27 .8 31-5 36-7 32-3 28 1.2Z" />
        <path id={`${prefix}-1`} d="M0-1.5 7-4 14-1 21 2 29-3 35 1 40 0 35 2 29-1.2 21 3.7 14 .8 7-2 0 2ZM9-2.5 12-8 18-10 14-6 11-1.5ZM22 2.5 27 8 33 9 28 6 23 1.8Z" />
        <path id={`${prefix}-2`} d="M0-2.2 5-1 11-4 18 .8 25-2.5 32 2 40 0 32 3.1 25-.8 18 2.8 11-2 5 .8 0 1.4ZM10-2.8 14 4 20 7 15 2 12-2.4ZM25-1.7 29-7 35-9 30-5 26-.8Z" />
        <path id={`${prefix}-3`} d="M0-1.7 8-3 15 1.5 22-3.8 30 .9 36-1.5 40 0 36-.2 30 2.3 22-2 15 3.5 8-1 0 2.1ZM14 2 18 8 25 10 20 6 16 1.1ZM22-3 26-8 32-8.5 27-6 23-2.1Z" />
        <path id={`${prefix}-4`} d="M0-2 6-4 13-.5 19 2.2 27-3 34 1.4 40 0 34 2.4 27-1.2 19 4 13 1.5 6-2 0 1.3ZM7-3 11 3 17 5 12 1 9-2.4ZM27-2.2 31-7 37-6 32-5 28-1.3Z" />
        <path id={`${prefix}-5`} d="M0-1.6 5-3.5 11 .8 17-4 24 1.8 32-2.2 40 0 32-.5 24 3.5 17-2 11 3 5-1.4 0 2ZM10 1.3 14 7 21 9 16 5 12 .4ZM17-3.2 21-9 27-10 22-7 18-2.3ZM25 2.1 30 7 36 7.5 31 5 26 1.2Z" />
        {Array.from({ length: SLOT_COUNT }, (_, slot) => (
          <clipPath id={`${prefix}-clip-${slot}`} key={slot}>
            <rect height="24" width="0" x="0" y="-12">
              <animate
                attributeName="width"
                begin="indefinite"
                dur="190ms"
                fill="freeze"
                from="0"
                ref={(node) => {
                  reveals.current[slot] = node as SVGAnimationElement | null;
                }}
                restart="always"
                to={CRACK_LENGTH}
              />
            </rect>
          </clipPath>
        ))}
      </defs>
      {Array.from({ length: SLOT_COUNT }, (_, slot) => (
        <g
          key={slot}
          ref={(node) => {
            slots.current[slot] = node;
          }}
          visibility="hidden"
        >
          <animate
            attributeName="opacity"
            begin="indefinite"
            dur="720ms"
            keyTimes="0;0.12;0.58;1"
            ref={(node) => {
              fades.current[slot] = node as SVGAnimationElement | null;
            }}
            restart="always"
            values="0;1;0.88;0"
          />
          <use
            clipPath={`url(#${prefix}-clip-${slot})`}
            fill="currentColor"
            ref={(node) => {
              uses.current[slot] = node;
            }}
          />
        </g>
      ))}
    </svg>
  );
});
