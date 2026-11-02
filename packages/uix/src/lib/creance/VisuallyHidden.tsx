import type { HTMLAttributes } from 'react';

/** Content for screen readers only. */
export function VisuallyHidden(props: HTMLAttributes<HTMLSpanElement>) {
  return <span className="cr-visually-hidden" {...props} />;
}
