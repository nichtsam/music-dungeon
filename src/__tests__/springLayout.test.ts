import { describe, expect, it } from "vitest";
import { springLayout } from "../lib/springLayout";

function dist(positions: number[][], i: number, j: number): number {
  const [a, b] = [positions[i], positions[j]];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

describe("springLayout", () => {
  it("places high-similarity pair closer than low-similarity pair", () => {
    // 0–1 score=0.95 (nearly identical), 0–2 score=0.73 (weaker)
    const p = springLayout(
      ["a", "b", "c"],
      [1, 999999, 500000],
      [{ a: 0, b: 1, score: 0.95 }, { a: 0, b: 2, score: 0.73 }],
      1, // no z-stretch so distances aren't anisotropic
    );
    expect(dist(p, 0, 1)).toBeLessThan(dist(p, 0, 2));
  });

  it("is deterministic — same inputs produce same positions", () => {
    const p1 = springLayout(["x", "y"], [42, 1337], [{ a: 0, b: 1, score: 0.8 }]);
    const p2 = springLayout(["x", "y"], [42, 1337], [{ a: 0, b: 1, score: 0.8 }]);
    expect(p1[0]).toEqual(p2[0]);
    expect(p1[1]).toEqual(p2[1]);
  });

  it("centers the layout near the origin", () => {
    const p = springLayout(
      ["a", "b", "c", "d"],
      [1, 2, 3, 4],
      [
        { a: 0, b: 1, score: 0.9 },
        { a: 1, b: 2, score: 0.85 },
        { a: 2, b: 3, score: 0.8 },
      ],
    );
    // Midpoint of bounding box should be near 0 for each axis
    for (let axis = 0; axis < 3; axis++) {
      const vals = p.map((pos) => pos[axis]);
      const mid = (Math.min(...vals) + Math.max(...vals)) / 2;
      expect(Math.abs(mid)).toBeLessThan(1); // centered to within 1px
    }
  });

  it("returns the correct number of positions", () => {
    const p = springLayout(
      ["a", "b", "c", "d", "e"],
      [10, 20, 30, 40, 50],
      [],
    );
    expect(p.length).toBe(5);
  });
});
