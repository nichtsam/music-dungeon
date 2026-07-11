// Deterministic force-directed spring layout for the Nest3D similarity graph.
// No randomness: hash-based initial positions, fixed iteration count.
import type { V3 } from "../components/map3d";

const SPRING_MIN = 110;
const SPRING_RANGE = 520; // L = 110 + (1-score)*520
const ITERATIONS = 250;

export function springLayout(
  ids: string[],
  hashes: number[],
  edges: { a: number; b: number; score: number }[],
  zStretch = 2.4,
): V3[] {
  const n = ids.length;
  const pos: V3[] = hashes.map((h) => {
    const t = ((h % 997) / 997) * Math.PI * 2;
    const u = (((h >> 10) % 991) / 991) * 2 - 1;
    const r = 160 + ((h >> 20) % 80);
    const s = Math.sqrt(1 - u * u);
    return [r * s * Math.cos(t), r * s * Math.sin(t), r * u * 0.7];
  });
  const vel: V3[] = ids.map(() => [0, 0, 0]);

  for (let it = 0; it < ITERATIONS; it++) {
    const step = 0.9 * (1 - it / ITERATIONS) + 0.1;
    for (const e of edges) {
      const pa = pos[e.a], pb = pos[e.b];
      const dx = pb[0] - pa[0], dy = pb[1] - pa[1], dz = pb[2] - pa[2];
      const d = Math.hypot(dx, dy, dz) || 1;
      const target = SPRING_MIN + (1 - e.score) * SPRING_RANGE;
      const f = ((d - target) / d) * 0.04 * step;
      vel[e.a][0] += dx * f; vel[e.a][1] += dy * f; vel[e.a][2] += dz * f;
      vel[e.b][0] -= dx * f; vel[e.b][1] -= dy * f; vel[e.b][2] -= dz * f;
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const pa = pos[i], pb = pos[j];
        const dx = pb[0] - pa[0], dy = pb[1] - pa[1], dz = pb[2] - pa[2];
        const d2 = Math.max(dx * dx + dy * dy + dz * dz, 2500);
        const f = Math.min(220000 / d2, 12) * 0.01 * step;
        const d = Math.sqrt(d2);
        const ux = dx / d, uy = dy / d, uz = dz / d;
        vel[i][0] -= ux * f; vel[i][1] -= uy * f; vel[i][2] -= uz * f;
        vel[j][0] += ux * f; vel[j][1] += uy * f; vel[j][2] += uz * f;
      }
      vel[i][0] -= pos[i][0] * 0.0015 * step;
      vel[i][1] -= pos[i][1] * 0.0015 * step;
      vel[i][2] -= pos[i][2] * 0.0015 * step;
    }
    for (let i = 0; i < n; i++) {
      pos[i][0] += vel[i][0]; pos[i][1] += vel[i][1]; pos[i][2] += vel[i][2];
      vel[i][0] *= 0.6; vel[i][1] *= 0.6; vel[i][2] *= 0.6;
    }
  }
  for (let axis = 0; axis < 3; axis++) {
    const vals = pos.map((p) => p[axis]);
    const mid = (Math.min(...vals) + Math.max(...vals)) / 2;
    for (const p of pos) p[axis] -= mid;
  }
  for (const p of pos) p[2] *= zStretch;
  return pos;
}

if (import.meta.env.DEV) {
  const p = springLayout(
    ["a", "b", "c"],
    [1, 999999, 500000],
    [{ a: 0, b: 1, score: 0.95 }, { a: 0, b: 2, score: 0.73 }],
    1,
  );
  const d = (i: number, j: number) =>
    Math.hypot(p[i][0] - p[j][0], p[i][1] - p[j][1], p[i][2] - p[j][2]);
  console.assert(d(0, 1) < d(0, 2), "springLayout smoke check failed", d(0, 1), d(0, 2));
}
