"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const VERT = /* glsl */ `
  attribute vec2 a_pos;
  void main() {
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform float u_time;
  uniform vec2  u_resolution;
  uniform vec2  u_mouse;
  uniform vec2  u_vel;
  uniform float u_active;
  uniform float u_density;
  uniform vec3  u_color;

  float hash(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 17.23);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float a = 0.5, s = 0.0;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 5; i++) {
      s += a * noise(p);
      p = m * p + 3.7;
      a *= 0.5;
    }
    return s;
  }

  vec2 warp(vec2 p, vec2 m, vec2 vel) {
    vec2 d = p - m;
    float r = length(d);
    float g = exp(-r * r * 3.0);
    float ang = u_active * 2.4 * g;
    float c = cos(ang), s = sin(ang);
    d = mat2(c, -s, s, c) * d;
    d *= 1.0 + u_active * g * 0.55;
    return m + d + vel * g * 0.6;
  }

  float terrain(vec2 p, float t) {
    vec2 w = vec2(fbm(p * 0.6 + t * 0.04), fbm(p * 0.6 - t * 0.035 + 11.0));
    float h = fbm(p * 1.1 + (w - 0.5) * 1.2 + vec2(t * 0.02, 0.0));
    h += 0.18 * sin(p.x * 1.3 + t * 0.15) * cos(p.y * 0.9 - t * 0.1);
    return h;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 p = uv; p.x *= aspect;
    vec2 m = u_mouse / u_resolution; m.x *= aspect;
    vec2 vel = u_vel / u_resolution; vel.x *= aspect;
    float t = u_time;

    float e = 1.0 / u_resolution.y;
    vec2 q  = warp(p, m, vel);
    vec2 qx = warp(p + vec2(e, 0.0), m, vel);
    vec2 qy = warp(p + vec2(0.0, e), m, vel);
    float h  = terrain(q, t);
    float hx = terrain(qx, t);
    float hy = terrain(qy, t);

    float levels = 16.0 * u_density;
    float f = h * levels;
    float grad = length(vec2(hx - h, hy - h)) * levels + 1e-4;

    float v = abs(fract(f) - 0.5);
    float minor = 1.0 - smoothstep(0.0, grad * 1.1, 0.5 - v);
    float idx = mod(floor(f + 0.5), 5.0);
    float isMajor = 1.0 - step(0.5, idx);
    float major = (1.0 - smoothstep(0.0, grad * 2.2, 0.5 - v)) * isMajor;

    float crowd = clamp(grad * 18.0, 0.0, 1.0);
    float rp = length(p - m);
    float well = exp(-rp * rp * 6.0) * u_active;

    float alphaMinor = 0.16 + 0.32 * crowd + well * 0.5;
    float alphaMajor = 0.42 + 0.35 * crowd + well * 0.4;
    float line = max(minor * alphaMinor, major * alphaMajor);

    vec3 bg = vec3(0.012, 0.013, 0.018);
    bg += u_color * (h - 0.4) * 0.03;
    bg += u_color * well * 0.04;

    vec3 col = bg + u_color * line;
    col += u_color * pow(well, 3.0) * (1.0 - smoothstep(0.0, 0.008, rp)) * 0.8;
    col *= 1.0 - 0.45 * dot(uv - 0.5, uv - 0.5);

    col += (hash(gl_FragCoord.xy + fract(t)) - 0.5) * 0.01;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

function compileShader(gl: WebGLRenderingContext, type: number, src: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function buildProgram(gl: WebGLRenderingContext) {
  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vert || !frag) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

export type TopographyProps = {
  /** Playback speed multiplier. */
  speed?: number;
  /** Contour spacing multiplier. Higher packs more lines into the frame. */
  density?: number;
  /** Line color. Pale for white-on-black; use the brand accent for a tinted map. */
  color?: string;
  /** Pointer acts as a gravity well: contours pull toward it and spiral. */
  interactive?: boolean;
  /** Classes merged onto the canvas. Give the parent a size; the canvas fills it. */
  className?: string;
};

export function Topography({
  speed = 1,
  density = 1,
  color = "#d8dce4",
  interactive = true,
  className,
}: TopographyProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const canvas: HTMLCanvasElement = canvasEl;
    let cleanup: (() => void) | null = null;

    const setup = (): (() => void) | null => {
      const gl = canvas.getContext("webgl", { antialias: false, powerPreference: "high-performance" });
      if (!gl) return null;
      const prog = buildProgram(gl);
      if (!prog) return null;
      gl.useProgram(prog);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const posLoc = gl.getAttribLocation(prog, "a_pos");
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      const u = (n: string) => gl.getUniformLocation(prog, n);
      const uTime = u("u_time"), uRes = u("u_resolution"), uMouse = u("u_mouse"), uVel = u("u_vel"), uActive = u("u_active");
      const uDensity = u("u_density"), uColor = u("u_color");
      gl.uniform3fv(uColor, hexToRgb(color));

      const target = { x: 0, y: 0, active: 0 };
      const current = { x: 0, y: 0, active: 0 };
      const vel = { x: 0, y: 0 };
      let idle = true;

      const onMove = (e: PointerEvent) => {
        const r = canvas.getBoundingClientRect();
        const dpr = canvas.width / Math.max(r.width, 1);
        target.x = (e.clientX - r.left) * dpr;
        target.y = (r.bottom - e.clientY) * dpr;
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        target.active = inside ? 1 : 0;
        idle = !inside;
      };
      if (interactive) {
        window.addEventListener("pointermove", onMove, { passive: true });
      }

      const start = performance.now();
      let raf = 0;
      let running = false;
      let inView = true;
      const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

      function drawFrame() {
        const now = (performance.now() - start) / 1000;
        const t = now * speed;
        if (idle) {
          target.x = canvas.width * (0.5 + Math.sin(t * 0.19) * 0.32);
          target.y = canvas.height * (0.5 + Math.cos(t * 0.14) * 0.28);
          target.active = 0.6;
        }
        const px = current.x, py = current.y;
        current.x += (target.x - current.x) * 0.07;
        current.y += (target.y - current.y) * 0.07;
        current.active += (target.active - current.active) * 0.04;
        vel.x += ((current.x - px) * 12 - vel.x) * 0.1;
        vel.y += ((current.y - py) * 12 - vel.y) * 0.1;
        gl!.uniform1f(uTime, t);
        gl!.uniform2f(uRes, canvas.width, canvas.height);
        gl!.uniform2f(uMouse, current.x, current.y);
        gl!.uniform2f(uVel, vel.x, vel.y);
        gl!.uniform1f(uActive, current.active);
        gl!.uniform1f(uDensity, Math.min(Math.max(density, 0.25), 3));
        gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
      }
      function render() {
        drawFrame();
        raf = requestAnimationFrame(render);
      }
      function syncLoop() {
        const shouldRun = !motionQuery.matches && inView && !document.hidden;
        if (shouldRun && !running) {
          running = true;
          raf = requestAnimationFrame(render);
        } else if (!shouldRun && running) {
          running = false;
          cancelAnimationFrame(raf);
        }
        if (!running && motionQuery.matches && inView) drawFrame();
      }
      function resize() {
        const dpr = Math.min(devicePixelRatio, 2);
        canvas.width = canvas.clientWidth * dpr;
        canvas.height = canvas.clientHeight * dpr;
        gl!.viewport(0, 0, canvas.width, canvas.height);
        if (!running) drawFrame();
      }
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(canvas);
      const io = new IntersectionObserver((entries) => {
        inView = entries[0]?.isIntersecting ?? true;
        syncLoop();
      });
      io.observe(canvas);
      document.addEventListener("visibilitychange", syncLoop);
      motionQuery.addEventListener("change", syncLoop);
      syncLoop();

      return () => {
        running = false;
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        window.removeEventListener("pointermove", onMove);
        document.removeEventListener("visibilitychange", syncLoop);
        motionQuery.removeEventListener("change", syncLoop);
        gl!.deleteProgram(prog);
        gl!.deleteBuffer(buf);
      };
    };

    cleanup = setup();
    const onLost = (e: Event) => {
      e.preventDefault();
      cleanup?.();
      cleanup = null;
    };
    const onRestored = () => {
      cleanup?.();
      cleanup = setup();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      cleanup?.();
      if (!canvas.isConnected) canvas.getContext("webgl")?.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [speed, density, color, interactive]);

  return <canvas ref={canvasRef} className={cn("block h-full w-full", className)} />;
}

Topography.displayName = "Topography";
