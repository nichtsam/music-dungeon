// Deterministic force-directed spring layout for the Attunements3D similarity graph.
// No randomness: hash-based initial positions, fixed iteration count.
// Multiple connected components are laid out independently and placed as islands.
import type { V3 } from "../components/map3d";

const SPRING_MIN = 110;
const SPRING_RANGE = 520; // L = 110 + (1-score)*520
const ITERATIONS = 250;
const ISLAND_RADIUS = 1600; // distance between component centroids

function unionFind(n: number, edges: { a: number; b: number }[]): number[] {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number =>
    parent[x] === x ? x : (parent[x] = find(parent[x]));
  for (const e of edges) {
    const pa = find(e.a), pb = find(e.b);
    if (pa !== pb) parent[pa] = pb;
  }
  return Array.from({ length: n }, (_, i) => find(i));
}

function layoutComponent(
  hashes: number[],
  edges: { a: number; b: number; score: number }[],
): V3[] {
  const n = hashes.length;
  const pos: V3[] = hashes.map((h) => {
    const t = ((h % 997) / 997) * Math.PI * 2;
    // >>> not >>: hashes >= 2^31 turn negative under signed shift (u < -1 → NaN sqrt)
    const u = (((h >>> 10) % 991) / 991) * 2 - 1;
    const r = 160 + ((h >>> 20) % 80);
    const s = Math.sqrt(1 - u * u);
    return [r * s * Math.cos(t), r * s * Math.sin(t), r * u * 0.7];
  });
  const vel: V3[] = hashes.map(() => [0, 0, 0] as V3);

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
  // center component at local origin
  for (let axis = 0; axis < 3; axis++) {
    const vals = pos.map((p) => p[axis]);
    const mid = (Math.min(...vals) + Math.max(...vals)) / 2;
    for (const p of pos) p[axis] -= mid;
  }
  // enforce minimum separation
  const MIN_D = 80;
  for (let pass = 0; pass < 20; pass++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[i][0] - pos[j][0], dy = pos[i][1] - pos[j][1], dz = pos[i][2] - pos[j][2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < MIN_D && d > 0.01) {
          const push = (MIN_D - d) * 0.5 / d;
          pos[i][0] += dx * push; pos[j][0] -= dx * push;
          pos[i][1] += dy * push; pos[j][1] -= dy * push;
          pos[i][2] += dz * push; pos[j][2] -= dz * push;
        }
      }
    }
  }
  return pos;
}

export function springLayout(
  ids: string[],
  hashes: number[],
  edges: { a: number; b: number; score: number }[],
  zStretch = 2.4,
): V3[] {
  const n = ids.length;
  if (n === 0) return [];

  // Find connected components; each becomes an isolated island.
  const comp = unionFind(n, edges);
  const compMap = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const c = comp[i];
    if (!compMap.has(c)) compMap.set(c, []);
    compMap.get(c)!.push(i);
  }

  // Largest component at origin; others placed evenly on a ring.
  const comps = [...compMap.entries()].sort((a, b) => b[1].length - a[1].length);
  const result: V3[] = new Array(n);

  comps.forEach(([compRoot, nodeIndices], ci) => {
    const localHashes = nodeIndices.map((i) => hashes[i]);
    const localEdges = edges
      .filter((e) => comp[e.a] === compRoot)
      .map((e) => ({
        a: nodeIndices.indexOf(e.a),
        b: nodeIndices.indexOf(e.b),
        score: e.score,
      }));
    const lpos = layoutComponent(localHashes, localEdges);

    const angle = ci === 0 ? 0 : ((ci - 1) / Math.max(comps.length - 1, 1)) * Math.PI * 2;
    const ox = ci === 0 ? 0 : ISLAND_RADIUS * Math.cos(angle);
    const oy = ci === 0 ? 0 : ISLAND_RADIUS * Math.sin(angle);
    nodeIndices.forEach((ni, li) => {
      result[ni] = [ox + lpos[li][0], oy + lpos[li][1], lpos[li][2]];
    });
  });

  // Each component is centered at its local origin; main component is already at (0,0,0).
  // Caller is responsible for further centering (e.g. on the current node).
  for (const p of result) p[2] *= zStretch;
  return result;
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
