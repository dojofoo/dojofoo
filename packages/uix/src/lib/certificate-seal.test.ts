import { describe, expect, it } from "vitest";
import { certificateWatermarkPaths } from "./certificate-seal";

function points(path: string) {
  return Array.from(path.matchAll(/[ML]([\d.]+),([\d.]+)/g), ([, x, y]) => [Number(x), Number(y)]);
}

describe("certificate seal", () => {
  it("recreates the same paths from the same digest, including case variations", () => {
    const digest = "abcdef01".repeat(8);
    expect(certificateWatermarkPaths(digest)).toEqual(certificateWatermarkPaths(digest.toUpperCase()));
    expect(certificateWatermarkPaths(digest)).toHaveLength(4);
    expect(certificateWatermarkPaths(digest).every(path => path.startsWith("M") && !path.includes("NaN"))).toBe(true);
  });

  it("uses bytes at the end as well as the start of the digest", () => {
    const digest = "0".repeat(64);
    expect(certificateWatermarkPaths(digest)).not.toEqual(certificateWatermarkPaths(`${"0".repeat(63)}1`));
  });

  it("changes geometry, not just rotation, when the hash changes", () => {
    const signature = (digest: string) => points(certificateWatermarkPaths(digest)[1])
      .map(([x, y]) => Math.hypot(x - 100, y - 100).toFixed(1)).sort();
    expect(signature("0".repeat(64))).not.toEqual(signature(`${"0".repeat(63)}1`));
  });

  it("projects distinct relief families while keeping the flat baseline identical", () => {
    const digest = "ab".repeat(32);
    expect(certificateWatermarkPaths(digest, { deformation: "pleated", relief: 0 }))
      .toEqual(certificateWatermarkPaths(digest, { deformation: "twisted", relief: 0 }));
    expect(certificateWatermarkPaths(digest, { deformation: "pleated" }))
      .not.toEqual(certificateWatermarkPaths(digest, { deformation: "twisted" }));
  });

  it("combines the exact flat inner contours with the twisted outer pair", () => {
    const digest = "ab".repeat(32);
    const flat = certificateWatermarkPaths(digest, { relief: 0 });
    const twisted = certificateWatermarkPaths(digest, { deformation: "twisted" });
    const hybrid = certificateWatermarkPaths(digest, { deformation: "hybrid" });
    expect(hybrid).toHaveLength(4);
    expect(hybrid.slice(0, 2)).toEqual(twisted.slice(0, 2));
    expect(hybrid.slice(2)).toEqual(flat.slice(2));
  });

  it.each([0, 0.13, 0.5, 0.87])("keeps the rings closed, bounded and clear of the logo at time %s, at any relief", time => {
    for (const deformation of ["pleated", "twisted", "hybrid"] as const) {
      for (const relief of [0, 0.35, 1]) {
        for (const digest of ["00", "ff", "ab", "35"].map(byte => byte.repeat(32))) {
          for (const path of certificateWatermarkPaths(digest, { deformation, relief, time })) {
            const vertices = points(path);
            const radii = vertices.map(([x, y]) => Math.hypot(x - 100, y - 100));
            expect(Math.min(...radii)).toBeGreaterThan(37);
            expect(Math.max(...radii)).toBeLessThan(76);
            const edge = ([x, y]: number[], [u, v]: number[]) => Math.hypot(x - u, y - v);
            const maximumStep = Math.max(...vertices.slice(1).map((point, i) => edge(point, vertices[i])));
            expect(edge(vertices[0], vertices.at(-1)!)).toBeLessThanOrEqual(maximumStep * 1.1);
          }
        }
      }
    }
  });

  it("rolls the twist on as time passes and loops back exactly to the seal at rest", () => {
    const digest = "ab".repeat(32);
    const options = { deformation: "twisted" } as const;
    const rest = certificateWatermarkPaths(digest, options);
    expect(certificateWatermarkPaths(digest, { ...options, time: 0 })).toEqual(rest);
    // A whole loop later – or several – it is the same seal, to the hundredth of a unit
    expect(certificateWatermarkPaths(digest, { ...options, time: 1 })).toEqual(rest);
    expect(certificateWatermarkPaths(digest, { ...options, time: 3 })).toEqual(rest);
    // In between, every ring has moved
    const half = certificateWatermarkPaths(digest, { ...options, time: 0.5 });
    half.forEach((path, index) => expect(path).not.toEqual(rest[index]));
    // And the same moment always draws the same rings
    expect(certificateWatermarkPaths(digest, { ...options, time: 0.37 })).toEqual(certificateWatermarkPaths(digest, { ...options, time: 0.37 }));
  });

  it("moves like a wave going round: a moment later is the same twist turned a little further", () => {
    // Shifting time by a fraction of a loop shifts the roll's phase; the ring's radius profile travels rather than
    // swinging in place, so its spread (how far it reaches in and out) stays about the same through the loop
    const digest = "35".repeat(32);
    const spread = (time: number) => {
      const radii = points(certificateWatermarkPaths(digest, { deformation: "twisted", time })[0]).map(([x, y]) => Math.hypot(x - 100, y - 100));
      return Math.max(...radii) - Math.min(...radii);
    };
    const spreads = [0, 0.1, 0.25, 0.5, 0.75].map(spread);
    expect(Math.max(...spreads) - Math.min(...spreads)).toBeLessThan(Math.min(...spreads) * 0.25);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])("rejects an invalid time: %s", time => {
    expect(() => certificateWatermarkPaths("0".repeat(64), { time })).toThrow("time");
  });

  it.each([-1, 2, Number.NaN])("rejects invalid relief: %s", relief => {
    expect(() => certificateWatermarkPaths("0".repeat(64), { relief })).toThrow("relief");
  });

  it("closes each engraved line and leaves a clear logo centre inside the viewbox", () => {
    for (const path of certificateWatermarkPaths("f".repeat(64))) {
      expect(path.endsWith(" Z")).toBe(true);
      const points = path.matchAll(/[ML]([\d.]+),([\d.]+)/g);
      for (const [, x, y] of points) {
        const radius = Math.hypot(Number(x) - 100, Number(y) - 100);
        expect(radius).toBeGreaterThan(37);
        expect(radius).toBeLessThan(76);
      }
    }
  });

  it.each(["", "not a hash", "g".repeat(64), "a".repeat(63)])("rejects malformed digests: %s", digest => {
    expect(() => certificateWatermarkPaths(digest)).toThrow("SHA-256");
  });
});
