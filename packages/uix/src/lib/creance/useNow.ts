'use client';

import { useEffect, useState } from 'react';

/**
 * The current time, read just after mount and then every `interval` ms while `ticking`.
 * Undefined until mounted: a clock read while rendering differs between the server and the browser,
 * and Next.js refuses it when prerendering.
 */
export function useNow(interval: number, ticking = true): number | undefined {
  const [now, setNow] = useState<number>();
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = ticking ? setInterval(tick, interval) : undefined;
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [interval, ticking]);
  return now;
}
