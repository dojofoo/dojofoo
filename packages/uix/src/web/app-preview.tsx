import { useEffect, useRef, useState, type ReactNode } from "react";

/** The learner illustration, `height` tall (800px by default): drawn at the frame's width (1280px at least, scaled down
    to fit a narrower one), so on a wide screen it shows at its real size. The app fills it, whatever its own height */
const PHONE = 600;

export function AppPreview({ children, label, artwork = false, ...props }: { children: ReactNode; label: string; artwork?: boolean; height?: number; ratio?: number; controls?: string }) {
  if (artwork) return <ArtworkFrame {...props} label={label}>{children}</ArtworkFrame>;
  return <figure data-app-preview="" role="img" aria-label={label} className="@container/preview m-0">
    <div data-app-preview-frame="" aria-hidden="true" inert
      className="relative aspect-video w-full overflow-hidden rounded-[calc(16px*var(--squircle-factor,1))] bg-(--page) [box-shadow:var(--shadow-5),0_0_0_1px_var(--line)] @max-[600px]/preview:aspect-[5/8] @max-[600px]/preview:max-h-[680px]">
      {children}
    </div>
  </figure>;
}

/** The original UIX composition, measured only in the artwork-generation story. */
function ArtworkFrame({ children, label, height = 800, ratio, controls }: { children: ReactNode; label: string; height?: number; /** Width over height (16 / 9): the window keeps it at every width, instead of a fixed height */ ratio?: number;
  /** On a phone, what stays live (a selector, e.g. the drawers' buttons and scrims); all else is still, as wide */ controls?: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1280);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width || 1280));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // On a phone a 1200-wide screen would be too small to read: the app at the phone's own width instead, unscaled, in its
  // narrow layout (the sidebar and the Sensei as drawers), optional `controls` can keep its drawers live
  const phone = Boolean(ratio) && width < PHONE;
  // At a ratio it's a 1200-wide screen at any width (scaled, so the sidebar runs past its bottom edge), so what it shows doesn't change with the page
  const base = phone ? width : ratio ? 1200 : Math.max(1280, width);
  const scale = width / base;
  const tall = phone ? Math.round(Math.min(width * 1.6, 680)) : ratio ? Math.round(base / ratio) : height;
  // When controls are supplied, every other control remains inert (out of reach of taps and the keyboard), also those
  // the app draws later (the editor loads after it)
  useEffect(() => {
    const el = frame.current;
    if (!phone || !el) return;
    const still = () => el.querySelectorAll<HTMLElement>("a[href], button, input, textarea, select, [tabindex], [contenteditable], [role=button]").forEach((item) => {
      if (!controls || !item.matches(controls)) item.inert = true;
    });
    still();
    const observer = new MutationObserver(still);
    observer.observe(el, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [phone, controls]);
  return (
    <figure className="ui-web-app m-0" role={!controls ? "img" : undefined} aria-label={label} data-phone={phone || undefined}>
      <div ref={frame} className="ui-web-app__frame relative overflow-hidden rounded-[calc(16px*var(--squircle-factor,1))] bg-(--page) [box-shadow:var(--shadow-5),0_0_0_1px_var(--line)]" style={{ height: tall * scale }} inert={!phone || !controls} aria-hidden={!controls || undefined} data-controls={phone && controls ? "" : undefined}>
        <div className="ui-web-app__scale absolute top-0 left-0 origin-top-left [&>*]:h-full!" style={{ width: base, height: tall, transform: `scale(${scale})` }}>{children}</div>
      </div>
    </figure>
  );
}
