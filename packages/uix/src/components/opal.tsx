"use client";

import { ShaderCanvas } from "./shader-canvas";

/*
 * Opal – fifty rings, each pushed out by drifting noise, fading toward the outermost: a shader after Morgan McGuire's 2D
 * value noise. Seen through a view – zoomed in, turned, tilted as if from the side, its middle off toward a corner – so
 * the rings sweep across the whole card rather than sit in its middle. White on black: screen it over a color and
 * only the rings show.
 *
 *   <Opal className="absolute inset-0 mix-blend-screen" seed={42} />
 */
// As written, for WebGL 1: the ring count is a constant (loop bounds must be), iTime/iResolution are u_time/
// u_resolution, the seed shifts where the noise is read – and the view (zoom, angle, tilt, center) is new.
const FRAG = /* glsl */ `
  precision highp float;
  uniform float u_time;
  uniform vec2 u_resolution;
  uniform vec2 u_seed;
  uniform float u_zoom;
  uniform float u_angle;
  uniform float u_tilt;
  uniform float u_cx;
  uniform float u_cy;
  uniform float u_falloff;
  uniform float u_inner;
  uniform float u_spread;
  uniform float u_gain;

  float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123); }
  float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    uv = uv * 2.0 - 1.0;
    uv.x *= u_resolution.x / u_resolution.y;
    // The view: the rings' middle moved toward a corner, turned, tilted (one axis stretched, as seen from the side) and
    // zoomed in, so the arcs fill the card
    uv -= vec2(u_cx, u_cy);
    float ca = cos(u_angle), sa = sin(u_angle);
    uv = mat2(ca, -sa, sa, ca) * uv;
    uv.y *= u_tilt;
    uv *= u_zoom;

    vec3 color = vec3(0.0);
    const float count = 50.0;
    float dist = length(uv);
    for (float i = 0.0; i < count; i++) {
      float radius = u_inner + (count - i) * u_spread;
      float thickness = 0.01;
      float amp = 0.4;
      float sep = 0.03;
      float noisyRadius = radius + noise(uv + u_seed + u_time - i * sep) * amp;
      float edge = smoothstep(noisyRadius - thickness, noisyRadius, dist) - smoothstep(noisyRadius, noisyRadius + thickness, dist);
      color += vec3(edge) * pow((count - i) / count, u_falloff) * 0.3 * u_gain;
    }
    gl_FragColor = vec4(color, 1.0);
  }
`;

export type OpalProps = {
  /** Playback speed multiplier */
  speed?: number;
  /** Another seed, another opal */
  seed?: number;
  /** Below 1 zooms in – the rings grow past the card */
  zoom?: number;
  /** The rings' turn, in degrees */
  angle?: number;
  /** Above 1 tilts them away, as if seen from the side */
  tilt?: number;
  /** Where their middle sits, in the card's units (0,0 the center, ±1 the edges) */
  center?: [number, number];
  /** How fast the rings fade toward the middle – 2 as in the original, lower keeps the inner ones lit */
  falloff?: number;
  /** The innermost ring's radius – 0.3 as in the original, lower fills the middle */
  inner?: number;
  /** The step from ring to ring – 0.009 as in the original, more spreads them across a wider band */
  spread?: number;
  /** How bright each ring draws – 1 as in the original; spread wide they overlap less, so they want more */
  gain?: number;
  className?: string;
  "data-kind"?: string;
};

// The defaults fill a card: zoomed in, turned 45° and tilted to a side view, the rings run from near the middle out
// past the edges, fading gently, each drawn brighter to make up for overlapping less
export function Opal({ speed = 1, seed = 0, zoom = 0.45, angle = 45, tilt = 2, center = [0, 0], falloff = 0.5, inner = 0.02, spread = 0.03, gain = 2, className, "data-kind": kind }: OpalProps) {
  return <ShaderCanvas fragment={FRAG} uniforms={{ u_zoom: zoom, u_angle: (angle * Math.PI) / 180, u_tilt: tilt, u_cx: center[0], u_cy: center[1], u_falloff: falloff, u_inner: inner, u_spread: spread, u_gain: gain }} speed={speed} seed={seed} className={className} data-kind={kind} />;
}
