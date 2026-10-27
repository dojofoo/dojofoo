"use client";

import { ShaderCanvas } from "./shader-canvas";

/*
 * Network – points drifting in a grid, each joined by lines to its neighbors: a Shadertoy shader (points and lines in
 * a 3×3 neighborhood), drawn sharp – hard 1px lines and small hard dots, no smoothing, so its edges stay aliased – and
 * sized in pixels, so it stays as fine at any size. White on black: screen it over a color and only the lines show.
 *
 *   <Network className="absolute inset-0 mix-blend-screen" scale={2.5} seed={42} />
 */
// The original reads its neighbors with a hand-kept counter; WebGL 1 only indexes arrays by loop indices, so the 3×3
// loop runs on ints. Its soft glow and smoothed lines are hard steps here: a line is lit within half its width, a dot
// within its radius, both in pixels; a longer line still fades, as before.
const FRAG = /* glsl */ `
  precision highp float;
  uniform float u_time;
  uniform vec2 u_resolution;
  uniform vec2 u_seed;
  uniform float u_scale;
  uniform float u_line;
  uniform float u_dot;

  float rand(vec2 co) { return fract(cos(mod(dot(co.xy + 0.12, vec2(12.9898, 78.233)), 3.14)) * 43758.5453); }
  vec3 rand3(vec2 co) { float t = rand(co); float z = rand(co + t); return vec3(t, z, rand(co + z)); }
  vec3 getpoint(vec2 id) {
    vec3 r = rand3(id + u_seed);
    // Each point starts at its own phase (from its random numbers and the seed), so the net is scattered from the first
    // frame instead of starting as a grid – at time 0 the original puts every point at the same spot in its cell
    vec3 phase = fract(r.yzx * 7.31 + u_seed.xyx * 0.013) * 6.28318;
    vec3 ou = vec3(sin(u_time * r.x + phase.x), cos(u_time * r.y + phase.y), sin(u_time * r.z * 10.0 + phase.z));
    return ou * 0.45 + 0.5;
  }
  // One pixel, in cell units
  float px() { return 2.0 * u_scale / u_resolution.y; }
  float line(vec2 uv, vec2 p, vec2 p2) {
    vec2 n = uv - p;
    vec2 w = p2 - p;
    float r = clamp(dot(n, w) / dot(w, w), 0.0, 1.0);
    r = length(n - w * r);
    float lit = step(r, u_line * 0.5 * px());
    return lit * smoothstep(0.6, 1.0, 1.0 / distance(p, p2));
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
    uv *= u_scale;
    vec2 id = floor(uv);
    vec2 c = fract(uv);

    vec2 p[9];
    float col = 0.0;
    for (int y = 0; y < 3; y++) {
      for (int x = 0; x < 3; x++) {
        vec2 offset = vec2(float(x) - 1.0, float(y) - 1.0);
        vec3 point = getpoint(id + offset);
        p[y * 3 + x] = point.xy + offset;
        // A hard dot, a little larger the nearer the point is (its z)
        float radius = u_dot * (0.6 + 0.4 * point.z) * px();
        col = max(col, step(distance(point.xy + offset, c), radius));
      }
    }
    for (int i = 0; i < 9; i++) col = max(col, line(c, p[i], p[4]));
    col = max(col, line(c, p[1], p[3]));
    col = max(col, line(c, p[1], p[5]));
    col = max(col, line(c, p[7], p[3]));
    col = max(col, line(c, p[7], p[5]));
    gl_FragColor = vec4(vec3(col), 1.0);
  }
`;

export type NetworkProps = {
  /** Playback speed multiplier */
  speed?: number;
  /** Cells across the shorter side – more is a finer net */
  scale?: number;
  /** Line width, in pixels */
  line?: number;
  /** Dot radius, in pixels */
  dot?: number;
  /** Another seed, another net */
  seed?: number;
  className?: string;
  "data-kind"?: string;
};

export function Network({ speed = 1, scale = 5, line = 1, dot = 2, seed = 0, className, "data-kind": kind }: NetworkProps) {
  return <ShaderCanvas fragment={FRAG} uniforms={{ u_scale: scale, u_line: line, u_dot: dot }} speed={speed} seed={seed} className={className} data-kind={kind} />;
}
