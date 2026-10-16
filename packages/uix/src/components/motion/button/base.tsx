// beui.dev/components/motion/button

import {
  AnimatePresence,
  animate,
  type HTMLMotionProps,
  motion,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import { play } from "cuelume";
import {
  forwardRef,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { EASE_OUT, SPRING_PRESS } from "~/lib/ease";
import { useHoverCapable } from "~/lib/hooks/use-hover-capable";
import { cn } from "~/lib/utils";
import { CrackRips, type CrackRipsHandle } from "./crack-rips";
import { FingerprintMark } from "./fingerprint-mark";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends Omit<
  HTMLMotionProps<"button">,
  "children"
> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pressScale?: number;
  /** Tilt the surface into the button depth from its top-left corner. */
  crackStuck?: boolean;
  /** Spawn a Material-style ripple from the press point. Off by default. */
  ripple?: boolean;
  /** Leave a small, randomized fingerprint at the press point. Off by default. */
  fingerprint?: boolean;
  children?: ReactNode;
}

export interface ButtonLinkProps extends Omit<
  HTMLMotionProps<"a">,
  "children"
> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pressScale?: number;
  children?: ReactNode;
}

type Ripple = { id: number; x: number; y: number; size: number };
type Fingerprint = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  size: number;
  rotation: number;
  maskAngle: number;
  pressureX: number;
  pressureY: number;
};

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-button-primary-hover",
  secondary: "bg-card text-foreground",
  ghost: "text-muted-foreground hover:text-foreground hover:bg-primary/5",
  outline:
    "border border-border bg-transparent text-foreground hover:bg-primary/5",
};

const FINGERPRINT_SURFACE_CLASS: Record<ButtonVariant, string> = {
  primary: "[--fingerprint-surface:var(--primary)]",
  secondary: "[--fingerprint-surface:var(--card)]",
  ghost: "[--fingerprint-surface:var(--background)]",
  outline: "[--fingerprint-surface:var(--background)]",
};

const DEPTH_CLASS: Partial<Record<ButtonVariant, string>> = {
  primary:
    "bg-button-primary-depth pb-[3px] hover:bg-button-primary-depth",
  secondary: "bg-button-secondary-depth pb-[3px]",
};

const BORDER_SIBLING_CLASS: Partial<Record<ButtonVariant, string>> = {
  primary:
    "button-border-sibling [--button-border-surface:var(--primary)] group-has-[button:disabled]:[--button-border-surface:var(--button-disabled)]",
  secondary:
    "button-border-sibling [--button-border-surface:var(--card)] group-has-[button:disabled]:[--button-border-surface:var(--button-disabled)]",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-5 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
  icon: "h-8 w-8",
};

const INSET_SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-[30px] px-[11px] text-xs gap-1.5",
  md: "h-[38px] px-[19px] text-sm gap-2",
  lg: "h-[46px] px-[23px] text-base gap-2",
  icon: "h-[30px] w-[30px]",
};

const BORDER_SHELL_SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-8",
  md: "h-10",
  lg: "h-12",
  icon: "h-8 w-8",
};

const RADIUS_CLASS: Record<ButtonSize, string> = {
  sm: "rounded-button-sm",
  md: "rounded-button-md",
  lg: "rounded-button-lg",
  icon: "rounded-button-sm",
};

const PRESS_DEPTH = 2;
const CRACK_EASE = [0.16, 1, 0.3, 1] as const;
const IDENTITY_MATRIX =
  "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)";

type Point = { x: number; y: number };
type CachedGeometry = {
  height: number;
  pageLeft: number;
  pageTop: number;
  width: number;
};
type ProjectionState = {
  animation: { stop: () => void } | null;
  height: number;
  points: Point[] | null;
  width: number;
};

function rectanglePoints(width: number, height: number): Point[] {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
}

function solveLinearSystem(rows: number[][]) {
  const size = rows.length;
  for (let pivot = 0; pivot < size; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(rows[row][pivot]) > Math.abs(rows[best][pivot])) best = row;
    }
    [rows[pivot], rows[best]] = [rows[best], rows[pivot]];
    const divisor = rows[pivot][pivot];
    if (Math.abs(divisor) < 1e-10) return null;
    for (let column = pivot; column <= size; column += 1) {
      rows[pivot][column] /= divisor;
    }
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const factor = rows[row][pivot];
      for (let column = pivot; column <= size; column += 1) {
        rows[row][column] -= factor * rows[pivot][column];
      }
    }
  }
  return rows.map((row) => row[size]);
}

function projectRectangle(width: number, height: number, target: Point[]) {
  const source = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const rows: number[][] = [];
  for (let index = 0; index < source.length; index += 1) {
    const { x, y } = source[index];
    const { x: projectedX, y: projectedY } = target[index];
    rows.push([
      x, y, 1, 0, 0, 0, -projectedX * x, -projectedX * y, projectedX,
    ]);
    rows.push([
      0, 0, 0, x, y, 1, -projectedY * x, -projectedY * y, projectedY,
    ]);
  }
  const solution = solveLinearSystem(rows);
  if (!solution || solution.some((value) => !Number.isFinite(value))) {
    return IDENTITY_MATRIX;
  }
  const [a, b, c, d, e, f, g, h] = solution;
  return `matrix3d(${a},${d},0,${g},${b},${e},0,${h},0,0,1,0,${c},${f},0,1)`;
}

function animateProjection(
  transform: { set: (value: string) => void },
  state: ProjectionState,
  width: number,
  height: number,
  target: Point[],
  duration: number,
) {
  state.animation?.stop();
  const source = rectanglePoints(width, height);
  if (state.width !== width || state.height !== height) {
    state.points = source;
    state.width = width;
    state.height = height;
    transform.set(IDENTITY_MATRIX);
  }
  const start = (state.points ?? source).map((point) => ({ ...point }));
  state.animation = animate(0, 1, {
    duration,
    ease: CRACK_EASE,
    onUpdate: (progress) => {
      const points = start.map((point, index) => ({
        x: point.x + (target[index].x - point.x) * progress,
        y: point.y + (target[index].y - point.y) * progress,
      }));
      state.points = points;
      transform.set(projectRectangle(width, height, points));
    },
  });
}

function pressProjection(
  width: number,
  height: number,
  pointerX: number,
  pointerY: number,
  travel: number,
  inset: number,
) {
  const x = Math.min(1, Math.max(0, pointerX / width));
  const y = Math.min(1, Math.max(0, pointerY / height));
  const side = x < 1 / 3 ? "left" : x > 2 / 3 ? "right" : "center";
  const verticalImpact = 0.65 + y * 0.35;
  const sideWeights = {
    left: [0.55, 0, 0, 1],
    center: [0.55, 0.55, 1, 1],
    right: [0, 0.55, 1, 0],
  }[side];
  const weights = sideWeights.map((weight) => weight * verticalImpact);
  const horizontalBias = side === "center" ? 0 : 1;
  const corners = [
    { x: 0, y: 0, direction: 1 },
    { x: width, y: 0, direction: -1 },
    { x: width, y: height, direction: -1 },
    { x: 0, y: height, direction: 1 },
  ];
  return corners.map((corner, index) => ({
    x:
      corner.x +
      corner.direction * inset * horizontalBias * weights[index],
    y: corner.y + travel * weights[index],
  }));
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      pressScale = 0.98,
      crackStuck = false,
      ripple = false,
      fingerprint = false,
      className,
      children,
      onPointerDown,
      onPointerUp,
      onPointerCancel,
      ...rest
    },
    ref,
  ) {
    const reduce = useReducedMotion();
    const canHover = useHoverCapable();
    const isDisabled = Boolean(rest.disabled);
    const hasBorderSibling = Boolean(BORDER_SIBLING_CLASS[variant]);
    const [ripples, setRipples] = useState<Ripple[]>([]);
    const [fingerprints, setFingerprints] = useState<Fingerprint[]>([]);
    const [crackLight, setCrackLight] = useState({
      active: false,
      x: 50,
      y: 50,
    });
    const fingerprintTimers = useRef<Map<number, number>>(new Map());
    const crackRipsRef = useRef<CrackRipsHandle>(null);
    const crackGeometry = useRef<CachedGeometry | null>(null);
    const crackGeometryFrame = useRef<number | null>(null);
    const crackReleaseTimer = useRef<number | null>(null);
    const crackActive = useRef(false);
    const crackDepthTransform = useMotionValue(IDENTITY_MATRIX);
    const crackSurfaceTransform = useMotionValue(IDENTITY_MATRIX);
    const depthProjection = useRef<ProjectionState>({
      animation: null,
      height: 0,
      points: null,
      width: 0,
    });
    const surfaceProjection = useRef<ProjectionState>({
      animation: null,
      height: 0,
      points: null,
      width: 0,
    });
    const surfaceRef = useRef<HTMLSpanElement>(null);
    const nextId = useRef(0);

    const cacheCrackGeometry = useCallback(() => {
      const surface = surfaceRef.current;
      if (!surface || crackActive.current) return;
      const rect = surface.getBoundingClientRect();
      crackGeometry.current = {
        height: surface.offsetHeight,
        pageLeft: rect.left + window.scrollX,
        pageTop: rect.top + window.scrollY,
        width: surface.offsetWidth,
      };
    }, []);

    useEffect(
      () => () => {
        for (const timer of fingerprintTimers.current.values()) {
          window.clearTimeout(timer);
        }
        depthProjection.current.animation?.stop();
        surfaceProjection.current.animation?.stop();
      },
      [],
    );

    useLayoutEffect(() => {
      if (!crackStuck || !surfaceRef.current) return;
      const scheduleGeometryCache = () => {
        if (crackGeometryFrame.current !== null) {
          window.cancelAnimationFrame(crackGeometryFrame.current);
        }
        crackGeometryFrame.current = window.requestAnimationFrame(() => {
          crackGeometryFrame.current = null;
          cacheCrackGeometry();
        });
      };
      cacheCrackGeometry();
      const observer = new ResizeObserver(scheduleGeometryCache);
      observer.observe(surfaceRef.current);
      window.addEventListener("resize", scheduleGeometryCache);
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", scheduleGeometryCache);
        if (crackGeometryFrame.current !== null) {
          window.cancelAnimationFrame(crackGeometryFrame.current);
        }
        if (crackReleaseTimer.current !== null) {
          window.clearTimeout(crackReleaseTimer.current);
        }
      };
    }, [cacheCrackGeometry, crackStuck]);

    const handlePointerDown = useCallback(
      (event: PointerEvent<HTMLButtonElement>) => {
        play("press", { volume: 0.5 });
        if (ripple && !reduce) {
          const rect = event.currentTarget.getBoundingClientRect();
          const size = Math.max(rect.width, rect.height) * 2;
          const id = nextId.current++;
          setRipples((prev) => [
            ...prev,
            {
              id,
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
              size,
            },
          ]);
        }
        if (fingerprint && !reduce) {
          const rect = event.currentTarget.getBoundingClientRect();
          const id = nextId.current++;
          const direction = Math.random() < 0.5 ? -1 : 1;
          setFingerprints((prev) => [
            ...prev,
            {
              id,
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
              width: rect.width,
              height: rect.height,
              size: 21,
              rotation: direction * (2 + Math.random() * 3),
              maskAngle: -35 + Math.random() * 70,
              pressureX: 0.35 + Math.random() * 0.3,
              pressureY: 0.3 + Math.random() * 0.4,
            },
          ]);
          fingerprintTimers.current.set(
            id,
            window.setTimeout(() => {
              setFingerprints((prev) => prev.filter((mark) => mark.id !== id));
              fingerprintTimers.current.delete(id);
            }, 850),
          );
        }
        if (crackStuck && !reduce) {
          if (crackReleaseTimer.current !== null) {
            window.clearTimeout(crackReleaseTimer.current);
            crackReleaseTimer.current = null;
          }
          crackActive.current = true;
          const cached = crackGeometry.current;
          const fallback = event.currentTarget.parentElement?.getBoundingClientRect();
          const geometry = cached
            ? {
                height: cached.height,
                left: cached.pageLeft - window.scrollX,
                top: cached.pageTop - window.scrollY,
                width: cached.width,
              }
            : fallback;
          if (geometry) {
            const pointerX = event.clientX - geometry.left;
            const pointerY = event.clientY - geometry.top;
            crackRipsRef.current?.trigger({
              height: geometry.height,
              pointerX,
              pointerY,
              width: geometry.width,
            });
            setCrackLight({
              active: true,
              x:
                100 -
                Math.min(100, Math.max(0, pointerX / geometry.width * 100)),
              y:
                100 -
                Math.min(100, Math.max(0, pointerY / geometry.height * 100)),
            });
            animateProjection(
              crackSurfaceTransform,
              surfaceProjection.current,
              geometry.width,
              geometry.height,
              pressProjection(
                geometry.width,
                geometry.height,
                pointerX,
                pointerY,
                PRESS_DEPTH,
                0.9,
              ),
              0.14,
            );
            animateProjection(
              crackDepthTransform,
              depthProjection.current,
              geometry.width,
              geometry.height,
              pressProjection(
                geometry.width,
                geometry.height,
                pointerX,
                pointerY,
                0.35,
                0.3,
              ),
              0.14,
            );
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }
        onPointerDown?.(event);
      },
      [
        crackDepthTransform,
        crackStuck,
        crackSurfaceTransform,
        fingerprint,
        ripple,
        reduce,
        onPointerDown,
      ],
    );

    const handlePointerRelease = useCallback(
      (event: PointerEvent<HTMLButtonElement>) => {
        if (crackStuck) {
          const geometry = crackGeometry.current;
          if (geometry) {
            const target = rectanglePoints(geometry.width, geometry.height);
            animateProjection(
              crackSurfaceTransform,
              surfaceProjection.current,
              geometry.width,
              geometry.height,
              target,
              0.2,
            );
            animateProjection(
              crackDepthTransform,
              depthProjection.current,
              geometry.width,
              geometry.height,
              target,
              0.2,
            );
          }
          setCrackLight((current) => ({ ...current, active: false }));
          if (crackReleaseTimer.current !== null) {
            window.clearTimeout(crackReleaseTimer.current);
          }
          crackReleaseTimer.current = window.setTimeout(() => {
            crackActive.current = false;
            crackReleaseTimer.current = null;
            cacheCrackGeometry();
          }, 220);
        }
        if (event.type === "pointercancel") onPointerCancel?.(event);
        else onPointerUp?.(event);
      },
      [
        cacheCrackGeometry,
        crackDepthTransform,
        crackStuck,
        crackSurfaceTransform,
        onPointerCancel,
        onPointerUp,
      ],
    );

    return (
      <motion.span
        whileTap={
          reduce || isDisabled
            ? undefined
            : { scale: pressScale }
        }
        whileHover={
          reduce || !canHover || isDisabled ? undefined : { scale: 1.02 }
        }
        transition={SPRING_PRESS}
        className={cn(
          "group relative inline-flex cursor-pointer self-start",
          RADIUS_CLASS[size],
          DEPTH_CLASS[variant] && "pb-[3px]",
        )}
      >
        {DEPTH_CLASS[variant] ? (
          <motion.span
            aria-hidden="true"
            style={
              crackStuck
                ? { transform: crackDepthTransform, transformOrigin: "0 0" }
                : undefined
            }
            className={cn(
              "absolute inset-x-0 top-[3px] bottom-0 group-has-[button:disabled]:bg-button-disabled-depth",
              RADIUS_CLASS[size],
              VARIANT_CLASS[variant],
              DEPTH_CLASS[variant],
              "pb-0",
            )}
          />
        ) : null}
        {crackStuck ? <CrackRips ref={crackRipsRef} /> : null}
        {hasBorderSibling ? (
          <motion.span
          ref={surfaceRef}
          whileTap={
              reduce || isDisabled || crackStuck ? undefined : { y: 2 }
          }
          transition={SPRING_PRESS}
          style={
            crackStuck
              ? {
                  transform: crackSurfaceTransform,
                  transformOrigin: "0 0",
                }
              : undefined
          }
          className={cn(
              "relative inline-flex",
            BORDER_SHELL_SIZE_CLASS[size],
            RADIUS_CLASS[size],
          )}
        >
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-0",
                RADIUS_CLASS[size],
                BORDER_SIBLING_CLASS[variant],
              )}
            />
            <motion.button
              ref={ref}
              type="button"
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerRelease}
              onPointerCancel={handlePointerRelease}
              className={cn(
                "relative m-px inline-flex cursor-pointer items-center justify-center font-medium select-none",
                "transition-colors",
                "disabled:pointer-events-none disabled:bg-button-disabled disabled:text-button-disabled-foreground",
                (crackStuck || ripple || fingerprint) && "overflow-hidden",
                VARIANT_CLASS[variant],
                FINGERPRINT_SURFACE_CLASS[variant],
                INSET_SIZE_CLASS[size],
                RADIUS_CLASS[size],
                className,
              )}
              {...rest}
            >
              {crackStuck ? (
                <motion.span
                  aria-hidden="true"
                  animate={{ opacity: crackLight.active ? 1 : 0 }}
                  className="pointer-events-none absolute inset-0 rounded-[inherit]"
                  style={{
                    background: `radial-gradient(ellipse 85% 130% at ${crackLight.x}% ${crackLight.y}%, rgb(255 255 255 / 24%), rgb(255 255 255 / 7%) 38%, transparent 72%)`,
                    mixBlendMode: "screen",
                  }}
                  transition={{ duration: crackLight.active ? 0.12 : 0.2 }}
                />
              ) : null}
              {ripple && !reduce ? (
                <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
                  <AnimatePresence>
                    {ripples.map((r) => (
                      <motion.span
                        key={r.id}
                        className="absolute rounded-full bg-current"
                        style={{
                          left: r.x,
                          top: r.y,
                          width: r.size,
                          height: r.size,
                          x: "-50%",
                          y: "-50%",
                        }}
                        initial={{ scale: 0.05, opacity: 0.3 }}
                        animate={{ scale: 1, opacity: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.6, ease: EASE_OUT }}
                        onAnimationComplete={() =>
                          setRipples((prev) => prev.filter((x) => x.id !== r.id))
                        }
                      />
                    ))}
                  </AnimatePresence>
                </span>
              ) : null}
              {fingerprint && !reduce
                ? fingerprints.map((mark) => (
                    <FingerprintMark key={mark.id} {...mark} />
                  ))
                : null}
              {children}
            </motion.button>
          </motion.span>
        ) : (
          <motion.button
            ref={ref}
            type="button"
            whileTap={
              reduce || isDisabled || !DEPTH_CLASS[variant] || crackStuck
                ? undefined
                : { y: 2 }
            }
            transition={SPRING_PRESS}
            style={
              crackStuck
                ? {
                    transform: crackSurfaceTransform,
                    transformOrigin: "0 0",
                  }
                : undefined
            }
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerRelease}
            onPointerCancel={handlePointerRelease}
            className={cn(
              "inline-flex cursor-pointer items-center justify-center font-medium select-none",
              "transition-colors",
              "disabled:pointer-events-none disabled:bg-button-disabled disabled:text-button-disabled-foreground",
              (crackStuck || ripple || fingerprint) &&
                "relative overflow-hidden",
              VARIANT_CLASS[variant],
              FINGERPRINT_SURFACE_CLASS[variant],
              SIZE_CLASS[size],
              RADIUS_CLASS[size],
              className,
            )}
            {...rest}
          >
          {crackStuck ? (
            <motion.span
              aria-hidden="true"
              animate={{ opacity: crackLight.active ? 1 : 0 }}
              className="pointer-events-none absolute inset-0 rounded-[inherit]"
              style={{
                background: `radial-gradient(ellipse 85% 130% at ${crackLight.x}% ${crackLight.y}%, rgb(255 255 255 / 24%), rgb(255 255 255 / 7%) 38%, transparent 72%)`,
                mixBlendMode: "screen",
              }}
              transition={{ duration: crackLight.active ? 0.12 : 0.2 }}
            />
          ) : null}
          {ripple && !reduce ? (
            <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
              <AnimatePresence>
                {ripples.map((r) => (
                  <motion.span
                    key={r.id}
                    className="absolute rounded-full bg-current"
                    style={{
                      left: r.x,
                      top: r.y,
                      width: r.size,
                      height: r.size,
                      x: "-50%",
                      y: "-50%",
                    }}
                    initial={{ scale: 0.05, opacity: 0.3 }}
                    animate={{ scale: 1, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.6, ease: EASE_OUT }}
                    onAnimationComplete={() =>
                      setRipples((prev) => prev.filter((x) => x.id !== r.id))
                    }
                  />
                ))}
              </AnimatePresence>
            </span>
          ) : null}
          {fingerprint && !reduce
            ? fingerprints.map((mark) => (
                <FingerprintMark key={mark.id} {...mark} />
              ))
            : null}
          {children}
          </motion.button>
        )}
      </motion.span>
    );
  },
);

export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(
  function ButtonLink(
    {
      variant = "primary",
      size = "md",
      pressScale = 0.98,
      className,
      children,
      ...rest
    },
    ref,
  ) {
    const reduce = useReducedMotion();
    const canHover = useHoverCapable();
    const hasBorderSibling = Boolean(BORDER_SIBLING_CLASS[variant]);

    return (
      <motion.span
        whileTap={reduce ? undefined : { scale: pressScale }}
        whileHover={reduce || !canHover ? undefined : { scale: 1.02 }}
        transition={SPRING_PRESS}
        className={cn(
          "relative inline-flex cursor-pointer self-start",
          RADIUS_CLASS[size],
          DEPTH_CLASS[variant] && "pb-[3px]",
        )}
      >
        {DEPTH_CLASS[variant] ? (
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-x-0 top-[3px] bottom-0",
              RADIUS_CLASS[size],
              VARIANT_CLASS[variant],
              DEPTH_CLASS[variant],
              "pb-0",
            )}
          />
        ) : null}
        {hasBorderSibling ? (
          <motion.span
          whileTap={
              reduce ? undefined : { y: 2 }
          }
          transition={SPRING_PRESS}
          className={cn(
              "relative inline-flex",
            BORDER_SHELL_SIZE_CLASS[size],
            RADIUS_CLASS[size],
          )}
        >
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-0",
                RADIUS_CLASS[size],
                BORDER_SIBLING_CLASS[variant],
              )}
            />
            <motion.a
              ref={ref}
              className={cn(
                "relative m-px inline-flex cursor-pointer items-center justify-center font-medium select-none",
                "transition-colors",
                VARIANT_CLASS[variant],
                INSET_SIZE_CLASS[size],
                RADIUS_CLASS[size],
                className,
              )}
              {...rest}
            >
              {children}
            </motion.a>
          </motion.span>
        ) : (
          <motion.a
            ref={ref}
            whileTap={
              reduce || !DEPTH_CLASS[variant] ? undefined : { y: 2 }
            }
            transition={SPRING_PRESS}
            className={cn(
              "inline-flex cursor-pointer items-center justify-center font-medium select-none",
              "transition-colors",
              VARIANT_CLASS[variant],
              SIZE_CLASS[size],
              RADIUS_CLASS[size],
              className,
            )}
            {...rest}
          >
            {children}
          </motion.a>
        )}
      </motion.span>
    );
  },
);
