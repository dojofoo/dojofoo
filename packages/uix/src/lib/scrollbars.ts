// What the scrollbars' styles (styles/fluid.css) can't see for themselves: whatever scrolls – the root element for the
// page itself – is marked with data-scrolling until 600ms after its last scroll, and the element whose scrollbar the
// pointer is on (anywhere in the 10px track, not only on the thumb) with data-scrollbar-hover.
const LINGER_MS = 600;
/** The track's width, as styles/fluid.css draws it */
const TRACK = 10;
const timers = new WeakMap<Element, number>();
let pointed: Element | undefined;

function onScroll(event: Event) {
  const target = event.target === document ? document.documentElement : event.target;
  if (!(target instanceof Element)) return;
  const timer = timers.get(target);
  if (timer === undefined) target.setAttribute("data-scrolling", "");
  else window.clearTimeout(timer);
  timers.set(target, window.setTimeout(() => {
    timers.delete(target);
    target.removeAttribute("data-scrolling");
  }, LINGER_MS));
}

/** The element whose scrollbar is under the pointer: the page's, or the one of the element it's over */
function scrollbarAt(event: PointerEvent) {
  const root = document.documentElement;
  if ((event.clientX >= Math.min(root.clientWidth, innerWidth - TRACK) && root.scrollHeight > root.clientHeight)
    || (event.clientY >= Math.min(root.clientHeight, innerHeight - TRACK) && root.scrollWidth > root.clientWidth)) return root;
  // Overlay tracks reserve no gutter and may target the content underneath them.
  // Walk up to its scroll container rather than requiring a measurable gutter.
  for (let el = event.target instanceof HTMLElement ? event.target : null; el && el !== root && el !== document.body; el = el.parentElement) {
    if (el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth) continue;
    const style = getComputedStyle(el);
    if (style.scrollbarWidth === "none") continue;
    const right = parseFloat(style.borderRightWidth), bottom = parseFloat(style.borderBottomWidth);
    const vertical = el.scrollHeight > el.clientHeight && /auto|scroll|overlay/.test(style.overflowY);
    const horizontal = el.scrollWidth > el.clientWidth && /auto|scroll|overlay/.test(style.overflowX);
    const box = el.getBoundingClientRect();
    const scale = el.offsetWidth ? box.width / el.offsetWidth : 1;
    if (vertical && box.right - right * scale - event.clientX < TRACK * scale) return el;
    if (horizontal && box.bottom - bottom * scale - event.clientY < TRACK * scale) return el;
  }
  return undefined;
}

function point(el: Element | undefined) {
  if (el === pointed) return;
  pointed?.removeAttribute("data-scrollbar-hover");
  el?.setAttribute("data-scrollbar-hover", "");
  pointed = el;
}

/** Once per page; calling it again changes nothing. Scroll events don't bubble, so it listens while they're captured */
export function revealScrollbars() {
  if (typeof document === "undefined") return;
  document.addEventListener("scroll", onScroll, { capture: true, passive: true });
  document.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("pointerout", onPointerOut, { passive: true });
}

function onPointerMove(event: PointerEvent) {
  point(event.pointerType === "touch" ? undefined : scrollbarAt(event));
}

/** Leaving the window */
function onPointerOut(event: PointerEvent) {
  if (!event.relatedTarget) point(undefined);
}
