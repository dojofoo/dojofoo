"use client";

import { ShaderCanvas } from "./shader-canvas";

/*
 * Waves – lines drawn across a rolling sea, seen from above at an angle: a Shadertoy shader (a choppy sea height map,
 * ray-traced, its depth cut into evenly spaced lines). White on black: screen it over a color and only the lines show.
 *
 *   <Waves className="absolute inset-0 mix-blend-screen" seed={42} />
 */
// As written, for WebGL 1: fwidth needs OES_standard_derivatives, Shadertoy's iTime/iResolution are u_time/
// u_resolution, the unused iChannel0 read is left out, the hit point starts defined (the early return left it empty),
// and the seed shifts the sea.
const FRAG = /* glsl */ `
  #extension GL_OES_standard_derivatives : enable
  precision highp float;
  uniform float u_time;
  uniform vec2 u_resolution;
  uniform vec2 u_seed;
  uniform float u_lines;

  const float cameraHeight = 8.0;
  const float cameraAngle = 0.8;
  const int ITER_GEOMETRY = 2;
  const float SEA_HEIGHT = 1.6;
  const float SEA_CHOPPY = 4.0;
  const float SEA_SPEED = 0.8;
  const float SEA_FREQ = 0.16;
  const int NUM_STEPS = 8;
  const mat2 octave_m = mat2(1.6, 1.2, -1.2, 1.6);

  mat3 fromEuler(vec3 ang) {
    vec2 a1 = vec2(sin(ang.x), cos(ang.x));
    vec2 a2 = vec2(sin(ang.y), cos(ang.y));
    vec2 a3 = vec2(sin(ang.z), cos(ang.z));
    mat3 m;
    m[0] = vec3(a1.y * a3.y + a1.x * a2.x * a3.x, a1.y * a2.x * a3.x + a3.y * a1.x, -a2.y * a3.x);
    m[1] = vec3(-a2.y * a1.x, a1.y * a2.y, a2.x);
    m[2] = vec3(a3.y * a1.x * a2.x + a1.y * a3.x, a1.x * a3.x - a1.y * a3.y * a2.x, a2.y * a3.y);
    return m;
  }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return -1.0 + 2.0 * mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float sea_octave(vec2 uv, float choppy) {
    uv += noise(uv);
    vec2 wv = 1.0 - abs(sin(uv));
    vec2 swv = abs(cos(uv));
    wv = mix(wv, swv, wv);
    return pow(1.0 - pow(wv.x * wv.y, 0.65), choppy);
  }
  float map(vec3 p) {
    float seaTime = 1.0 + u_time * SEA_SPEED;
    float freq = SEA_FREQ;
    float amp = SEA_HEIGHT;
    float choppy = SEA_CHOPPY;
    vec2 uv = p.xz + u_seed;
    uv.x *= 0.75;
    float d, h = 0.0;
    for (int i = 0; i < ITER_GEOMETRY; i++) {
      d = sea_octave((uv + seaTime) * freq, choppy);
      d += sea_octave((uv - seaTime) * freq, choppy);
      h += d * amp;
      uv *= octave_m; freq *= 1.9; amp *= 0.22;
      choppy = mix(choppy, 1.0, 0.2);
    }
    return p.y - h;
  }
  float heightMapTracing(vec3 ori, vec3 dir, out vec3 p) {
    float tm = 0.0;
    float tx = 1000.0;
    p = ori + dir * tx;
    float hx = map(p);
    if (hx > 0.0) return tx;
    float hm = map(ori + dir * tm);
    float tmid = 0.0;
    for (int i = 0; i < NUM_STEPS; i++) {
      tmid = mix(tm, tx, hm / (hm - hx));
      p = ori + dir * tmid;
      float hmid = map(p);
      if (hmid < 0.0) { tx = tmid; hx = hmid; } else { tm = tmid; hm = hmid; }
    }
    return tmid;
  }

  void main() {
    vec2 uv = (2.0 * gl_FragCoord.xy - u_resolution.xy) / u_resolution.y;
    vec3 ang = vec3(0.0, cameraAngle, 0.0);
    vec3 ori = vec3(0.0, cameraHeight, 0.0);
    vec3 dir = normalize(vec3(uv.xy, -2.0));
    dir = normalize(dir) * fromEuler(ang);
    vec3 p;
    heightMapTracing(ori, dir, p);
    float coord = p.z / u_lines;
    float c = abs(fract(coord) - 0.5) / fwidth(coord);
    c = 1.0 - min(c, 1.0);
    c = pow(c, 1.0 / 2.2);
    gl_FragColor = vec4(vec3(c), 1.0);
  }
`;

export type WavesProps = {
  /** Playback speed multiplier */
  speed?: number;
  /** Distance between the lines, on the sea – smaller is denser */
  spacing?: number;
  /** Another seed, another sea */
  seed?: number;
  className?: string;
  "data-kind"?: string;
};

export function Waves({ speed = 1, spacing = 0.25, seed = 0, className, "data-kind": kind }: WavesProps) {
  return <ShaderCanvas fragment={FRAG} uniforms={{ u_lines: spacing }} speed={speed} seed={seed} extensions={["OES_standard_derivatives"]} className={className} data-kind={kind} />;
}
