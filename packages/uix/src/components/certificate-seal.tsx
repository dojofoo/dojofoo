import { useEffect, useMemo, useRef } from "react";
import logo from "../assets/brand/dojofoo-mono.svg?raw";
import { cn } from "../lib/utils";
import { certificateWatermarkPaths, type CertificateGeometry } from "../lib/certificate-seal";

// Trusted, repository-owned vector artwork. Keep its paths inside the exported
// SVG so the logo and engraving share currentColor in either theme (the mono
// build: one colour, FOO cut out of the ribbon).
const logoPaths = logo.slice(logo.indexOf("<g "), logo.lastIndexOf("</svg>")).replaceAll("fill:white", "fill:currentColor");
const logoViewBox = /viewBox="([^"]+)"/.exec(logo)?.[1] ?? "0 0 2225 1212";
const [, , logoWidth = 1, logoHeight = 1] = logoViewBox.split(" ").map(Number);
/** The logo 84 across, centred where the medallion's rings centre (100, 100) */
const LOGO_HEIGHT = (84 * logoHeight) / logoWidth;

/** Points per ring while the twist moves – the seal at rest keeps the full count */
const MOVING_SAMPLES = 480;

/** The badge, as a festival laurel: an open wreath of stars – round its foot and up both sides – the
    medallion in its middle and the word, small, over it. 116 across; the canvas starts at the top of the word's
    capitals (its baseline less 0.727 of the 8.5 type) and ends at the foot star's lowest points (its middle, 104, plus
    8.6 × sin 54°) – nothing above or below, so a card can set it on its padding */
const VIEW = { y: 8.8, width: 116, height: 102.2 };
const WREATH = { x: 58, y: 54, rx: 50, ry: 50 };
/** The medallion – the rings (within 76 of their middle) and the logo – shrunk into the wreath's middle */
const MEDALLION_SCALE = 0.46;
const medallion = { x: WREATH.x, y: WREATH.y + 2 };
/** The word: a small spaced line over the medallion */
const WORD_BASELINE = 15;
/** A five-pointed star at (x, y), `size` from its middle to a tip, the first tip pointing along `angle` (degrees) */
const star = (x: number, y: number, size: number, angle: number) =>
  Array.from({ length: 10 }, (_, i) => {
    const a = ((angle + i * 36) * Math.PI) / 180;
    const r = i % 2 ? size * 0.42 : size;
    return `${i ? "L" : "M"}${(x + r * Math.cos(a)).toFixed(2)},${(y + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ") + " Z";
/** The wreath: the largest star at the foot, turned to point up at the medallion, then four a side up the ellipse to
    the top stars (at 198°), each smaller than the one below it and turned as on a circle – its tip pointing out from the
    middle – the top left open. They are spaced along the curve so the room between neighbours is the same all the way
    up, big stars and small alike */
const FOOT_SIZE = 8.6;
const STAR_SIZES = [7.6, 6.6, 5.6, 4.8];
const TOP_ANGLE = 198;
const wreathPoint = (angle: number) => {
  const a = (angle * Math.PI) / 180;
  return [WREATH.x + WREATH.rx * Math.cos(a), WREATH.y + WREATH.ry * Math.sin(a)] as const;
};
const onWreath = (angle: number, size: number, turn = angle) => {
  const [x, y] = wreathPoint(angle);
  return star(x, y, size, turn);
};
/** The curve from the foot to the top stars, measured in small steps (an ellipse's arc has no closed form): the angle
    reached at each length along it */
const curve: Array<[angle: number, length: number]> = [[90, 0]];
for (let step = 1; step <= 1080; step++) {
  const angle = 90 + ((TOP_ANGLE - 90) * step) / 1080;
  const [x, y] = wreathPoint(angle);
  const [px, py] = wreathPoint(curve[step - 1][0]);
  curve.push([angle, curve[step - 1][1] + Math.hypot(x - px, y - py)]);
}
const angleAlong = (distance: number) => curve.find(([, length]) => length >= distance)?.[0] ?? TOP_ANGLE;
const laurel = (() => {
  const sizes = [FOOT_SIZE, ...STAR_SIZES];
  // The curve's length, less every star's reach towards its neighbours, shared out evenly as the gaps
  const reach = STAR_SIZES.reduce((sum, size, index) => sum + sizes[index] + size, 0);
  const gap = (curve[curve.length - 1][1] - reach) / STAR_SIZES.length;
  let along = 0;
  const offsets = STAR_SIZES.map((size, index) => (along += sizes[index] + size + gap, angleAlong(along) - 90));
  return [onWreath(90, FOOT_SIZE, 270), ...offsets.flatMap((offset, index) => [-1, 1].map(side => onWreath(90 + side * offset, STAR_SIZES[index])))];
})();

/**
 * The certificate's badge, a festival laurel made modern: an open wreath of stars, its largest at the foot, and in its
 * middle the medallion – flat twisted rings drawn from the digest round the logo – under a small "Certificate".
 * Animated, the twist rolls round the rings like a moving wave, one loop every `duration` seconds, and comes back
 * exactly to the seal at rest (time 0). It stays still off screen, in a hidden tab and for reduced motion.
 */
export function CertificateSeal({ digest, deformation = "twisted", relief = 1, animated = true, duration = 18, className }: { digest?: string; className?: string; animated?: boolean; /** Seconds per loop */ duration?: number } & Omit<CertificateGeometry, "time" | "samples">) {
  const rings = useMemo(() => certificateWatermarkPaths(digest, { deformation, relief }), [digest, deformation, relief]);
  const group = useRef<SVGGElement>(null);

  useEffect(() => {
    const svg = group.current?.ownerSVGElement;
    const paths = group.current ? Array.from(group.current.querySelectorAll("path")) : [];
    if (!animated || !svg || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const loop = Math.max(1, duration) * 1000;
    // The time it has run, kept across pauses so it carries on where it stopped
    let elapsed = 0;
    let last: number | undefined;
    let frame = 0;
    let onScreen = true;
    const draw = (now: number) => {
      if (last !== undefined) elapsed += now - last;
      last = now;
      const next = certificateWatermarkPaths(digest, { deformation, relief, time: (elapsed % loop) / loop, samples: MOVING_SAMPLES });
      paths.forEach((path, index) => path.setAttribute("d", next[index]));
      frame = requestAnimationFrame(draw);
    };
    const update = () => {
      cancelAnimationFrame(frame);
      last = undefined;
      if (onScreen && !document.hidden) frame = requestAnimationFrame(draw);
    };
    const observer = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; update(); });
    observer.observe(svg);
    document.addEventListener("visibilitychange", update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      // Back to the seal at rest
      paths.forEach((path, index) => path.setAttribute("d", rings[index]));
    };
  }, [animated, digest, deformation, relief, duration, rings]);

  return <svg className={cn("ui-certificate-seal", className)} viewBox={`0 ${VIEW.y} ${VIEW.width} ${VIEW.height}`} role="img" aria-label="Dojo certificate seal" data-digest={digest?.toLowerCase()} data-animated={animated}>
    {digest && <metadata>{JSON.stringify({ version: 10, algorithm: "sha256", geometry: "flat-twisted-rings", digest: digest.toLowerCase(), deformation, relief })}</metadata>}
    <g data-part="laurel" fill="currentColor">{laurel.map((d, index) => <path key={index} d={d} />)}</g>
    <text data-part="word" x={WREATH.x} y={WORD_BASELINE} fill="currentColor" fontSize="8.5" fontWeight="700" letterSpacing="1.6" textAnchor="middle">CERTIFICATE</text>
    {/* The rings and logo drawn as before, at 200 across, then shrunk onto the wreath's foot – the lines thickened to
        keep their weight */}
    <g data-part="medallion" transform={`translate(${medallion.x - 100 * MEDALLION_SCALE} ${medallion.y - 100 * MEDALLION_SCALE}) scale(${MEDALLION_SCALE})`}>
      <g ref={group} data-part="watermark" fill="none" stroke="currentColor" strokeWidth={1.1 / MEDALLION_SCALE / 1.6} opacity="0.8">
        {rings.map((path, index) => <path key={index} d={path} />)}
      </g>
      <svg x="58" y={100 - LOGO_HEIGHT / 2} width="84" height={LOGO_HEIGHT} viewBox={logoViewBox} dangerouslySetInnerHTML={{ __html: logoPaths }} />
    </g>
  </svg>;
}
