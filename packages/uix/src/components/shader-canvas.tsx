"use client";

import { useEffect, useRef } from "react";
import { cn } from "../lib/utils";

/*
 * ShaderCanvas – a full-size canvas running one fragment shader (WebGL 1), for the cards' drifting backgrounds. It hands
 * the shader u_time (seconds × speed), u_resolution (pixels) and u_seed (a vec2 from `seed`), plus any number uniforms
 * given; it pauses off screen, in a hidden tab and for reduced motion (then draws one still frame), and redraws on
 * resize. `extensions` turns on what the shader asks for (e.g. OES_standard_derivatives for fwidth).
 *
 *   <ShaderCanvas fragment={FRAG} uniforms={{ u_scale: 4 }} speed={0.5} seed={42} className="absolute inset-0" />
 */
const VERT = /* glsl */ `
  attribute vec2 a_pos;
  void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
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

export type ShaderCanvasProps = {
  fragment: string;
  uniforms?: Record<string, number>;
  /** Playback speed multiplier */
  speed?: number;
  /** Another seed, another pattern */
  seed?: number;
  extensions?: string[];
  className?: string;
  "data-kind"?: string;
};

export function ShaderCanvas({ fragment, uniforms = {}, speed = 1, seed = 0, extensions = [], className, "data-kind": kind }: ShaderCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uniformKey = JSON.stringify(uniforms);
  const extensionKey = extensions.join(",");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, powerPreference: "low-power" });
    if (!gl) return;
    for (const name of extensionKey ? extensionKey.split(",") : []) gl.getExtension(name);
    const vert = compile(gl, gl.VERTEX_SHADER, VERT);
    const frag = compile(gl, gl.FRAGMENT_SHADER, fragment);
    if (!vert || !frag) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    const uTime = gl.getUniformLocation(prog, "u_time"), uRes = gl.getUniformLocation(prog, "u_resolution");
    gl.uniform2f(gl.getUniformLocation(prog, "u_seed"), (seed * 12.9898) % 97, (seed * 78.233) % 89);
    for (const [name, value] of Object.entries(JSON.parse(uniformKey) as Record<string, number>)) gl.uniform1f(gl.getUniformLocation(prog, name), value);

    const start = performance.now();
    let raf = 0;
    let running = false;
    let inView = true;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const draw = () => {
      gl.uniform1f(uTime, ((performance.now() - start) / 1000) * speed);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    const loop = () => { draw(); raf = requestAnimationFrame(loop); };
    const sync = () => {
      const run = !motion.matches && inView && !document.hidden;
      if (run && !running) { running = true; raf = requestAnimationFrame(loop); }
      else if (!run && running) { running = false; cancelAnimationFrame(raf); }
      if (!running && inView) draw();
    };
    const resize = () => {
      const dpr = Math.min(devicePixelRatio, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (!running) draw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver((entries) => { inView = entries[0]?.isIntersecting ?? true; sync(); });
    io.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    motion.addEventListener("change", sync);
    sync();
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      motion.removeEventListener("change", sync);
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    };
  }, [fragment, uniformKey, speed, seed, extensionKey]);

  return <canvas ref={canvasRef} data-kind={kind} className={cn("block h-full w-full", className)} />;
}
