import type { ButtonHTMLAttributes } from "react";
import { cn } from "~/lib/utils";

/*
 * OpenRouterButton – "Continue with OpenRouter": connects the user's OpenRouter account (OAuth with PKCE, a localhost
 * callback) and gets back a key that bills their own OpenRouter credits. Shaped like the ChatGPT button – white on
 * black, or black on white in dark mode – so the two read as a pair; the mark is OpenRouter's, in the text's color.
 *
 *   <OpenRouterButton onClick={connect} />
 */
export function OpenRouterButton({ label = "Continue with OpenRouter", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }) {
  return (
    <button type="button" {...props} className={cn("ui-sior", className)}>
      <style href="ui-sior" precedence="default">{css}</style>
      <OpenRouterLogo />
      <span>{label}</span>
    </button>
  );
}

/** The OpenRouter mark (Simple Icons), in the current color */
export function OpenRouterLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M16.778 1.844v1.919q-.569-.026-1.138-.032-.708-.008-1.415.037c-1.93.126-4.023.728-6.149 2.237-2.911 2.066-2.731 1.95-4.14 2.75-.396.223-1.342.574-2.185.798-.841.225-1.753.333-1.751.333v4.229s.768.108 1.61.333c.842.224 1.789.575 2.185.799 1.41.798 1.228.683 4.14 2.75 2.126 1.509 4.22 2.11 6.148 2.236.88.058 1.716.041 2.555.005v1.918l7.222-4.168-7.222-4.17v2.176c-.86.038-1.611.065-2.278.021-1.364-.09-2.417-.357-3.979-1.465-2.244-1.593-2.866-2.027-3.68-2.508.889-.518 1.449-.906 3.822-2.59 1.56-1.109 2.614-1.377 3.978-1.466.667-.044 1.418-.017 2.278.02v2.176L24 6.014Z" />
    </svg>
  );
}

const css = /* css */ `
.ui-sior { display: inline-flex; align-items: center; justify-content: center; gap: 10px; height: 44px; padding: 0 20px; border-radius: 999px; corner-shape: round; background: #000; color: #fff; font-size: 15px; font-weight: 500; letter-spacing: -0.01em; transition: opacity var(--motion-fast) var(--ease-fast), scale var(--motion-fast) var(--ease-fast); }
.ui-sior:hover:not(:disabled) { opacity: 0.88; }
.ui-sior:active:not(:disabled) { scale: 0.98; }
.ui-sior:disabled { opacity: 0.6; }
.ui-sior:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
:where(.dark, [data-theme="dark"]) .ui-sior { background: #fff; color: #000; }
`;
