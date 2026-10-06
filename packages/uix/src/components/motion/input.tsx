"use client";
// beui.dev/components/motion/input
import { Check } from "@mynaui/icons-react";

import {
  AnimatePresence,
  animate,
  motion,
  useReducedMotion,
} from "motion/react";
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { drop003Sound } from "~/lib/drop-003";
import {
  allowFocusSound,
  consumeFocusSoundSuppression,
  retainFocusSoundGuard,
} from "~/lib/focus-sound-guard";
import { playSound } from "~/lib/sound-engine";
import { cn } from "~/lib/utils";

function playFocusSound() {
  void playSound(drop003Sound.dataUri, { volume: 0.2 }).catch(() => undefined);
}

export type InputClassNames = {
  root?: string;
  label?: string;
  field?: string;
  input?: string;
  leftIcon?: string;
  rightIcon?: string;
  successIcon?: string;
  errorMessage?: string;
};

export interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue" | "onChange"
> {
  label?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Truthy error triggers a shake, red border and (if a string) a message. */
  error?: string | boolean;
  /** Reserve one message line so validation does not shift nearby content. */
  reserveErrorLine?: boolean;
  /** Play the focus sound. Browser-tab restoration is always silent. */
  focusSound?: boolean;
  success?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  className?: string;
  classNames?: InputClassNames;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    value: valueProp,
    defaultValue,
    onChange,
    onFocus,
    onBlur,
    onPointerDown,
    error,
    reserveErrorLine = false,
    focusSound = true,
    success,
    leftIcon,
    rightIcon,
    className,
    classNames,
    disabled,
    id: idProp,
    type,
    ...rest
  },
  ref,
) {
  const reactId = useId();
  const id = idProp ?? reactId;
  const reduce = useReducedMotion();

  const controlled = valueProp !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? "");
  const value = controlled ? (valueProp ?? "") : internal;

  const [focused, setFocused] = useState(false);

  const fieldRef = useRef<HTMLDivElement>(null);
  const soundStartedByPointer = useRef(false);

  const hasError = Boolean(error);
  const errorMessage = typeof error === "string" ? error : null;

  // Right edge shows the success check, otherwise the caller's right icon.
  const rightSlot = success ? null : rightIcon;

  // Shake the field when an error appears.
  useEffect(() => {
    if (!fieldRef.current || reduce || !hasError) return;
    animate(
      fieldRef.current,
      { x: [0, -6, 6, -4, 4, -2, 0] },
      { duration: 0.45 },
    );
  }, [hasError, reduce]);

  useEffect(() => retainFocusSoundGuard(), []);

  const handleChange = (next: string) => {
    if (!controlled) setInternal(next);
    onChange?.(next);
  };

  const triggerTouch = () => {
    const field = fieldRef.current;
    if (!field || reduce) return;
    field.classList.remove("input-water-touch");
    void field.offsetWidth;
    field.classList.add("input-water-touch");
  };

  return (
    <div
      className={cn("flex flex-col gap-1.5", className, classNames?.root)}
    >
      {label ? (
        <label
          htmlFor={id}
          className={cn(
            "px-1 text-sm font-medium text-foreground",
            classNames?.label,
          )}
        >
          {label}
        </label>
      ) : null}

      <div
        ref={fieldRef}
        data-state={
          hasError
            ? "error"
            : success
              ? "success"
              : focused
                ? "focused"
                : "idle"
        }
        className={cn(
          "relative h-12 rounded-full",
          disabled && "opacity-60",
          classNames?.field,
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 rounded-full border border-current bg-[linear-gradient(to_bottom,currentColor,transparent)] text-border transition-[inset,color,background-color] duration-200",
            focused && !hasError && "-inset-0.5",
            hasError &&
              "-inset-0.5 border-[color:color-mix(in_oklch,var(--destructive)_89%,black_11%)] bg-[linear-gradient(to_bottom,color-mix(in_oklch,var(--destructive)_82%,white_18%),var(--destructive))] text-destructive",
          )}
        />

        <div
          className={cn(
            "absolute inset-0 overflow-hidden rounded-full border border-border bg-background transition-colors duration-200",
            hasError &&
              "border-[color:color-mix(in_oklch,var(--destructive)_89%,black_11%)]",
          )}
        >
          {leftIcon ? (
            <span
              className={cn(
                "pointer-events-none absolute left-3 top-1/2 z-10 flex -translate-y-1/2 items-center text-muted-foreground [&_svg]:h-4 [&_svg]:w-4",
                classNames?.leftIcon,
              )}
            >
              {leftIcon}
            </span>
          ) : null}

          <input
            ref={ref}
            id={id}
            type={type}
            value={value}
            disabled={disabled}
            aria-invalid={hasError || undefined}
            aria-describedby={errorMessage ? `${id}-error` : undefined}
            {...rest}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={(event) => {
              if (disabled) {
                soundStartedByPointer.current = false;
                onFocus?.(event);
                return;
              }
              setFocused(true);
              const suppressSound = consumeFocusSoundSuppression();
              if (
                focusSound &&
                !soundStartedByPointer.current &&
                !suppressSound
              ) {
                playFocusSound();
              }
              soundStartedByPointer.current = false;
              triggerTouch();
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              soundStartedByPointer.current = false;
              onBlur?.(event);
            }}
            onPointerDown={(event) => {
              onPointerDown?.(event);
              if (disabled) {
                soundStartedByPointer.current = false;
                return;
              }
              allowFocusSound();
              const willFocus =
                !event.defaultPrevented &&
                document.activeElement !== event.currentTarget;
              soundStartedByPointer.current = willFocus;
              if (willFocus && focusSound) {
                playFocusSound();
              }
            }}
            className={cn(
              "peer relative h-full w-full rounded-full bg-transparent text-base leading-6 text-foreground caret-foreground outline-none",
              "placeholder:text-muted-foreground/60",
              leftIcon ? "pl-10" : "pl-3.5",
              rightSlot || success ? "pr-10" : "pr-3.5",
              disabled && "cursor-not-allowed",
              classNames?.input,
            )}
          />

          {success ? (
            <motion.span
              aria-hidden="true"
              initial={{ opacity: reduce ? 1 : 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
              className={cn(
                "absolute right-3.5 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-(--color-success)",
                classNames?.successIcon,
              )}
            >
              <Check size={20} stroke={2.5} />
            </motion.span>
          ) : rightSlot ? (
            <span
              className={cn(
                "absolute right-0 top-0 z-10 flex h-full items-center text-muted-foreground [&_button]:grid [&_button]:size-11 [&_button]:place-items-center [&_svg]:h-4 [&_svg]:w-4",
                classNames?.rightIcon,
              )}
            >
              {rightSlot}
            </span>
          ) : null}
        </div>
      </div>

      <div className={reserveErrorLine ? "min-h-4" : "contents"}>
        <AnimatePresence initial={false}>
          {errorMessage ? (
            <motion.p
              id={`${id}-error`}
              role="alert"
              initial={
                reduce
                  ? { opacity: 0 }
                  : { opacity: 0, y: -4, filter: "blur(4px)" }
              }
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={
                reduce
                  ? { opacity: 0 }
                  : { opacity: 0, y: -4, filter: "blur(4px)" }
              }
              transition={{ duration: 0.2 }}
              className={cn(
                "px-1 text-xs text-destructive",
                classNames?.errorMessage,
              )}
            >
              {errorMessage}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
});
