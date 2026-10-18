const digestPattern = /^[a-f0-9]{64}$/i;

const TAU = Math.PI * 2;
export type CertificateDeformation = "hash" | "pleated" | "twisted" | "hybrid";
export type CertificateGeometry = {
  deformation?: CertificateDeformation;
  relief?: number;
  /** Where the twist is in its loop: 0 is the seal itself; it rolls on as time grows and is back exactly at 1 */
  time?: number;
  /** Points per ring – fewer while it moves, the full count for the seal at rest */
  samples?: number;
};

function seededRandom(bytes: number[]) {
  let state = bytes.reduce((seed, byte) => Math.imul(seed ^ byte, 16777619), 2166136261);
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function closedPath(point: (angle: number) => [number, number], samples: number): string {
  return Array.from({ length: samples }, (_, step) => {
    const [x, y] = point(step / samples * TAU);
    return `${step ? "L" : "M"}${(100 + x * 0.8).toFixed(2)},${(100 + y * 0.8).toFixed(2)}`;
  }).join(" ") + " Z";
}

/**
 * Flat twisted rings: a braided pair and two scalloped contours, their surface lifted into 3D and
 * projected through a fixed camera. Everything comes from the digest – no runtime randomness – so a digest always draws
 * the same seal. The twist rolls at a constant rate around each ring, a whole number of turns per lap; `time` rolls it
 * on like a wave moving round the ring (no swinging back and forth), and every phase moves by whole turns, so time 1
 * is time 0 again and the motion loops exactly. Time 0 is the seal itself – the one to print or compare.
 */
export function certificateWatermarkPaths(digest = "0".repeat(64), options: CertificateGeometry = {}): string[] {
  if (!digestPattern.test(digest)) throw new Error("Certificate digest must be a SHA-256 hex string");
  const relief = options.relief ?? 1;
  if (!Number.isFinite(relief) || relief < 0 || relief > 1) throw new Error("Certificate relief must be between 0 and 1");
  const time = options.time ?? 0;
  if (!Number.isFinite(time)) throw new Error("Certificate time must be a finite number");
  const samples = options.samples ?? 1440;
  const bytes = Array.from({ length: 32 }, (_, i) => Number.parseInt(digest.slice(i * 2, i * 2 + 2), 16));
  const random = seededRandom(bytes);
  const family = random() < 0.5 ? "pleated" : "twisted";
  const deformation = options.deformation === undefined || options.deformation === "hash" ? family : options.deformation;
  const phase = random() * TAU;
  const folds = 3 + Math.floor(random() * 5);
  const twists = 1 + Math.floor(random() * 3);
  const height = 8 + random() * 2;
  const loops = 7 + Math.floor(random() * 10);
  const amplitude = 5 + random() * 2.5;
  const lobes = 4 + Math.floor(random() * 5);
  const scallop = 2 + random() * 1.5;
  // How far the wave has moved: whole turns of phase per loop
  const shift = TAU * time;

  const project = (angle: number, point: [number, number], lane: number, index: number): [number, number] => {
    // Keep the inner contours as the flat baseline; only the outer pair twists.
    const flat = deformation === "hybrid" && index >= 2;
    const azimuth = Math.atan2(point[1], point[0]);
    const offset = Math.hypot(...point) - lane;
    const lift = flat ? 0 : relief * height * (lane - 45) / 33 * Math.sin(folds * angle + phase + index * 0.4 - shift);
    // The roll: a steady turn around the ring – `twists` whole turns a lap – that time carries on round
    const twisted = !flat && (deformation === "twisted" || deformation === "hybrid");
    const turn = twisted ? twists * angle + phase - shift : 0;
    const radial = offset * Math.cos(turn) - lift * Math.sin(turn);
    const depth = offset * Math.sin(turn) + lift * Math.cos(turn);
    // Relief blends from the flat ring (0) to the full roll (1)
    const radius = lane + offset + relief * (radial - offset);
    const z = relief * depth;
    // The camera and focal length stay fixed: shape changes come from the surface.
    const perspective = 160 / (160 - z);
    return [radius * Math.cos(azimuth) * perspective, radius * Math.sin(azimuth) * perspective];
  };

  const braid = (offset: number, index: number) => closedPath(angle => {
    const lane = 78;
    return project(angle, [
      lane * Math.cos(angle) + amplitude * Math.cos(loops * angle + offset),
      lane * Math.sin(angle) + amplitude * Math.sin(loops * angle + offset),
    ], lane, index);
  }, samples);
  const paths = [braid(phase, 0), braid(phase + Math.PI, 1)];
  for (let layer = 0; layer < 2; layer++) {
    paths.push(closedPath(angle => {
      const lane = 55 + layer * 11;
      const radius = lane + scallop * Math.sin(lobes * angle + phase);
      return project(angle, [radius * Math.cos(angle), radius * Math.sin(angle)], lane, layer + 2);
    }, samples));
  }
  return paths;
}
