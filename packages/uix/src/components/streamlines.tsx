"use client";

import { ShaderCanvas } from "./shader-canvas";

/*
 * Streamlines – a wind tunnel seen from the side: hairline streamlines run left to right, part round invisible
 * cylinders and close behind them in a gently wavering wake. After shadcn.io's Streamlines shader (WGSL, WebGPU),
 * written for WebGL 1 like the cards' shaders: the lines only, white, so the box's own color shows between them
 * (screen it or lay it on a gray), and the cylinders placed by the caller – round what sits on top of it, say. With
 * `dots`, each line is a row of points drifting downstream, the old landing ocean's look.
 *
 *   <Streamlines cylinders={[[-0.35, 0, 0.2], [0.35, 0, 0.2]]} className="absolute inset-0" />
 */

/** A cylinder: its centre (x, y) and radius, in heights of the box from its middle (x right, y up) */
export type Cylinder = readonly [x: number, y: number, r: number];

// The stream function of a flow from left to right past each cylinder (a doublet), with a slowly swinging circulation
// and a faint wobble in its wake; the lines are its isolines, antialiased by its screen derivative, fading to their
// average ink where they crowd closer than a few pixels. Simplex noise after Inigo Quilez (MIT).
const FRAG = /* glsl */ `
  #extension GL_OES_standard_derivatives : enable
  precision highp float;
  uniform float u_time;
  uniform vec2 u_resolution;
  uniform float u_lines;
  uniform float u_thickness;
  uniform float u_intensity;
  uniform float u_count;
  uniform float u_dots;
  uniform float u_ax, u_ay, u_ar, u_bx, u_by, u_br;

  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float simplex(vec2 p) {
    const float K1 = 0.366025404;
    const float K2 = 0.211324865;
    vec2 i = floor(p + (p.x + p.y) * K1);
    vec2 a = p - i + (i.x + i.y) * K2;
    float m = step(a.y, a.x);
    vec2 o = vec2(m, 1.0 - m);
    vec2 b = a - o + K2;
    vec2 c = a - 1.0 + 2.0 * K2;
    vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
    vec3 n = h * h * h * h * vec3(dot(a, hash2(i)), dot(b, hash2(i + o)), dot(c, hash2(i + 1.0)));
    return dot(n, vec3(70.0));
  }

  void main() {
    vec2 res = u_resolution;
    float px = 1.0 / res.y;
    vec2 p = (gl_FragCoord.xy - 0.5 * res) * px;
    float t = u_time;

    float psi = p.y;
    float phi = p.x;
    float solid = 0.0;
    for (int i = 0; i < 2; i++) {
      float fi = float(i);
      vec3 c = i == 0 ? vec3(u_ax, u_ay, u_ar) : vec3(u_bx, u_by, u_br);
      float r = c.z * step(fi + 0.5, u_count);
      vec2 d = p - c.xy;
      float r2 = max(dot(d, d), 1e-5);
      psi -= r * r * d.y / r2;
      phi += r * r * d.x / r2;
      psi += 0.15 * r * sin(t * 0.5 + 2.1 * fi) * log(r2);
      float behind = max(d.x - r, 0.0);
      float wake = smoothstep(0.0, 2.0 * r + px, behind) * exp(-behind / (8.0 * r + px)) * exp(-d.y * d.y / (2.0 * r * r + px));
      psi += 0.18 * r * wake * simplex(vec2(behind / (r + px) * 0.35 - t * 0.6, d.y / (r + px) * 0.6 + 7.0 * fi));
      solid = max(solid, 1.0 - smoothstep(r - 3.0 * px, r - px, sqrt(r2)));
    }

    float s = psi * u_lines;
    float w = max(fwidth(s), 1e-4);
    float halfWidth = 0.5 * u_thickness;
    float across = abs(fract(s + 0.5) - 0.5) / w;
    float line = clamp(halfWidth + 0.5 - across, 0.0, 1.0);
    // Dots: where the lines cross the isolines of the flow's potential (at right angles, as far apart), so they stay
    // round and even round the bends, drifting downstream
    float q = phi * u_lines - t;
    float wq = max(fwidth(q), 1e-4);
    float along = abs(fract(q + 0.5) - 0.5) / wq;
    float dot = clamp(halfWidth + 0.5 - length(vec2(across, along)), 0.0, 1.0);
    float ink = mix(line, dot, u_dots);
    float average = mix(min(2.0 * halfWidth * w, 1.0), min(3.14159 * halfWidth * halfWidth * w * wq, 1.0), u_dots);
    float alpha = clamp(mix(ink, average, smoothstep(0.3, 0.6, w)) * u_intensity * (1.0 - solid), 0.0, 1.0);
    gl_FragColor = vec4(vec3(alpha), alpha);
  }
`;

export type StreamlinesProps = {
  /** Up to two cylinders the flow parts around */
  cylinders?: readonly Cylinder[];
  /** How many streamlines cross the height of the box */
  lines?: number;
  /** The lines' width in device pixels */
  thickness?: number;
  /** How strongly the lines show, 0–1 */
  intensity?: number;
  /** Rows of drifting points instead of lines */
  dots?: boolean;
  speed?: number;
  className?: string;
};

export function Streamlines({ cylinders = [], lines = 60, thickness = 1.2, intensity = 1, dots = false, speed = 1, className }: StreamlinesProps) {
  const [a = [0, 0, 0], b = [0, 0, 0]] = cylinders;
  return (
    <ShaderCanvas
      fragment={FRAG}
      uniforms={{ u_lines: lines, u_thickness: thickness, u_intensity: intensity, u_dots: dots ? 1 : 0, u_count: Math.min(cylinders.length, 2), u_ax: a[0], u_ay: a[1], u_ar: a[2], u_bx: b[0], u_by: b[1], u_br: b[2] }}
      speed={speed}
      extensions={["OES_standard_derivatives"]}
      className={className}
    />
  );
}
