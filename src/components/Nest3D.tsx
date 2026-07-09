// ATTUNEMENT TREE — the music you've collected, as a knowledge-tree graph.
// Deliberately NOT a map: no paths, no floors, no door kinds. Nodes are
// tracks, edges are similarity relations (spring layout on the similarity
// model's real scores, length ~ 1 - score), mood only colors the nodes.
// Tracks referenced by exits but not yet visited appear as locked previews —
// the "next unlockable skill" of the tree. Ground rings fill with dwell-time
// completeness (attunement).
import { Fragment, useMemo, useState } from "react";
import { useDungeon, completenessOf } from "../store";
import { paletteFor, topMood } from "../theme";
import { hashKey } from "../dungeon";
import { CUBE_FACES, edgeKey, lineStyle, shade, useOrbitCamera, type V3 } from "./map3d";

const SPRING_MIN = 110;
const SPRING_RANGE = 520; // L = 110 + (1-score)*520
const ITERATIONS = 250;
const HALO = 120;

// tank-style fill: liquid rises along world z, so each face maps the level to
// its own local axis. Order matches CUBE_FACES:
// "" = +z top · rotateY(180) = -z bottom · rotateY(90) local +x -> world -z ·
// rotateY(-90) mirrored · rotateX(90) local +y -> world +z · rotateX(-90) mirrored
const FILL_DIR = ["top", "bottom", "to left", "to right", "to bottom", "to top"] as const;

function FillCube({
  glow,
  fill,
  locked,
  size,
}: {
  glow: string;
  fill: number;
  locked: boolean;
  size: number;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, fill)) * 100);
  const liquid = (b: number) => shade(glow, Math.min(1.6, b + 0.5));
  const shell = (b: number) =>
    locked ? shade("#8a84a8", b * 0.5) : shade(glow, b * 0.42);
  return (
    <>
      {CUBE_FACES.map((f, i) => {
        const dir = FILL_DIR[i];
        let bg: string;
        if (locked || pct <= 0) bg = shell(f.b);
        else if (dir === "top") bg = pct >= 100 ? liquid(f.b) : shell(f.b);
        else if (dir === "bottom") bg = liquid(f.b);
        else if (pct >= 100) bg = liquid(f.b);
        else
          bg = `linear-gradient(${dir}, ${liquid(f.b)} 0 ${pct}%, ${shell(f.b)} ${pct}% 100%)`;
        return (
          <div
            key={f.t}
            style={{
              position: "absolute",
              left: -size / 2,
              top: -size / 2,
              width: size,
              height: size,
              transform: `${f.t} translateZ(${size / 2}px)`,
              background: bg,
              border: "1px solid #0c0a14",
              borderRadius: 3,
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              pointerEvents: "none",
            }}
          />
        );
      })}
    </>
  );
}

// deterministic spring layout (no randomness: hash init, fixed steps)
function springLayout(
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
  // the lattice-ish tunnel network relaxes toward a pancake; stretch depth
  for (const p of pos) p[2] *= zStretch;
  return pos;
}

if (import.meta.env.DEV) {
  const p = springLayout(
    ["a", "b", "c"],
    [1, 999999, 500000],
    [{ a: 0, b: 1, score: 0.95 }, { a: 0, b: 2, score: 0.73 }],
    1, // no z-stretch: anisotropic, would distort the distance comparison
  );
  const d = (i: number, j: number) =>
    Math.hypot(p[i][0] - p[j][0], p[i][1] - p[j][1], p[i][2] - p[j][2]);
  console.assert(d(0, 1) < d(0, 2), "springLayout smoke check failed", d(0, 1), d(0, 2));
}

interface NestNode {
  key: string;
  pos: V3;
  title: string;
  glow: string;
  mood: string | null;
  genre: string | null;
  bpm: number | null;
  isCurrent: boolean;
  completeness: number;
  locked: boolean; // referenced by a similarity edge but not yet visited
}

export default function Nest3D() {
  const { cells, tracks, currentKey, visitedKeys, dwell } = useDungeon();
  const [hover, setHover] = useState<NestNode | null>(null);
  const { overlayRef, sceneRef, pointerHandlers } = useOrbitCamera();

  const { nodes, tunnels, moodCounts, avgC } = useMemo(() => {
    const visited = new Set(visitedKeys);
    // locked previews: tracks our collection points at but hasn't visited
    const lockedKeys: string[] = [];
    for (const key of visitedKeys)
      for (const ex of cells[key]?.exits ?? [])
        if (!visited.has(ex.toKey) && !lockedKeys.includes(ex.toKey))
          lockedKeys.push(ex.toKey);
    const allKeys = [...visitedKeys, ...lockedKeys];
    const idx = new Map(allKeys.map((k, i) => [k, i]));

    // every known similarity relation — kinds and discovery don't matter here
    const rawEdges: { a: number; b: number; score: number; toLocked: boolean }[] = [];
    const seen = new Set<string>();
    for (const key of visitedKeys) {
      for (const ex of cells[key]?.exits ?? []) {
        const k = edgeKey(key, ex.toKey);
        if (seen.has(k)) continue;
        seen.add(k);
        rawEdges.push({
          a: idx.get(key)!,
          b: idx.get(ex.toKey)!,
          score: ex.score,
          toLocked: !visited.has(ex.toKey),
        });
      }
    }
    const positions = springLayout(
      allKeys,
      allKeys.map((k) => hashKey(cells[k]?.trackId ?? k)),
      rawEdges,
    );
    const nodes: NestNode[] = allKeys.map((key, i) => {
      const cell = cells[key];
      const track = tracks[cell.trackId];
      const locked = i >= visitedKeys.length;
      return {
        key,
        pos: positions[i],
        title: track?.title ?? cell.trackId,
        glow: paletteFor(track?.models).glow,
        mood: topMood(track?.models),
        genre: track?.models?.genre ?? null,
        bpm: track?.models?.bpm ?? null,
        isCurrent: key === currentKey,
        completeness: locked ? 0 : completenessOf(dwell[key]),
        locked,
      };
    });
    const tunnels = rawEdges.map((e) => ({ ...e, p1: positions[e.a], p2: positions[e.b] }));
    const unlocked = nodes.filter((n) => !n.locked);
    const moodCounts = new Map<string, number>();
    for (const n of unlocked)
      if (n.mood) moodCounts.set(n.mood, (moodCounts.get(n.mood) ?? 0) + 1);
    const avgC = unlocked.length
      ? unlocked.reduce((s, n) => s + n.completeness, 0) / unlocked.length
      : 0;
    return { nodes, tunnels, moodCounts, avgC };
  }, [cells, tracks, currentKey, visitedKeys, dwell]);

  const unlockedNodes = nodes.filter((n) => !n.locked);
  const attuned = unlockedNodes.filter((n) => n.completeness >= 1).length;

  return (
    <div
      ref={overlayRef}
      {...pointerHandlers}
      style={{
        position: "absolute",
        inset: 0,
        background: "radial-gradient(ellipse at center, #120e20, #05030c 80%)",
        overflow: "hidden",
        touchAction: "none",
        cursor: "grab",
      }}
    >
      <div style={{ position: "absolute", inset: 0, perspective: 900 }}>
      <div
        ref={sceneRef}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 0,
          height: 0,
          transformStyle: "preserve-3d",
          WebkitTransformStyle: "preserve-3d",
          willChange: "transform",
        }}
      >
        {/* similarity edges — one uniform style, weight ~ score. Not a map:
            no paths, no door kinds. Edges to locked previews are fainter. */}
        {tunnels.map((t, i) => {
          const width = 2 + (t.score - 0.7) * 6;
          let opacity = 0.4 + 0.5 * Math.max(0, Math.min(1, (t.score - 0.72) / 0.28));
          if (t.toLocked) opacity *= 0.45;
          const base = lineStyle(t.p1, t.p2, Math.max(2, width));
          return (
            <Fragment key={i}>
              <div style={{ ...base, background: "#5a4a8a", opacity }} />
              <div
                style={{
                  ...base,
                  background: "#5a4a8a",
                  opacity: opacity * 0.8,
                  transform: base.transform + " rotateX(90deg)",
                }}
              />
            </Fragment>
          );
        })}

        {/* nodes: real 3D gems (square bipyramids) that rotate with the scene.
            Liquid level is geometry — consistent from every viewing angle. */}
        {nodes.map((n) => (
          <Fragment key={n.key}>
            {!n.locked && (
              <div
                style={{
                  position: "absolute",
                  left: n.pos[0] - HALO / 2,
                  top: n.pos[1] - HALO / 2,
                  width: HALO,
                  height: HALO,
                  transform: `translateZ(${n.pos[2]}px)`,
                  background: `radial-gradient(circle, ${n.glow}40, transparent 70%)`,
                  opacity: 0.5 + 0.5 * n.completeness,
                  pointerEvents: "none",
                }}
              />
            )}
            <div
              style={{
                position: "absolute",
                left: n.pos[0],
                top: n.pos[1],
                width: 0,
                height: 0,
                transform: `translateZ(${n.pos[2]}px)`,
                transformStyle: "preserve-3d",
                WebkitTransformStyle: "preserve-3d",
              }}
            >
              <FillCube
                glow={n.glow}
                fill={n.completeness}
                locked={n.locked}
                size={n.locked ? 18 : 40}
              />
              {/* flat hit area for hover + current pulse ring */}
              <div
                onPointerEnter={() => setHover(n)}
                onPointerLeave={() => setHover((h) => (h?.key === n.key ? null : h))}
                className={n.isCurrent ? "map-current" : undefined}
                style={{
                  position: "absolute",
                  left: -26,
                  top: -26,
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  border: n.isCurrent ? "2px solid #ffffffa0" : "none",
                  pointerEvents: "auto",
                  cursor: "default",
                }}
              />
            </div>
          </Fragment>
        ))}
      </div>
      </div>

      {/* HUD */}
      <div style={{ position: "absolute", top: 62, left: 16, fontSize: 15, opacity: 0.8, lineHeight: 1.7, pointerEvents: "none" }}>
        🌳 ATTUNEMENT TREE — collect · attune · grow
        <br />
        {attuned} / {unlockedNodes.length} tracks attuned · avg {Math.round(avgC * 100)}%
        · {nodes.length - unlockedNodes.length} discovered but unvisited
        <br />
        drag rotate · right-drag / shift-drag pan · scroll zoom · double-click recenter
        <br />
        <span style={{ color: "#ffd700" }}>◼</span> cubes fill from the bottom as you stay with a track ·{" "}
        <span style={{ color: "#5a4a8a" }}>━</span> similarity (closer &amp; thicker = more alike) ·{" "}
        small grey cube = not yet visited
      </div>
      <div style={{ position: "absolute", top: 62, right: 16, fontSize: 14, opacity: 0.8, textAlign: "right", pointerEvents: "none", lineHeight: 1.7 }}>
        {[...moodCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([mood, count]) => (
            <div key={mood}>
              <span
                style={{
                  display: "inline-block", width: 10, height: 10, borderRadius: 2,
                  background: paletteFor({ moods: { [mood]: 1 }, bpm: null, genre: null }).glow,
                  marginRight: 6,
                }}
              />
              {mood} × {count}
            </div>
          ))}
      </div>
      {hover && (
        <div
          style={{
            position: "absolute", bottom: 16, left: 16,
            background: "#0c0a14ee", border: `2px solid ${hover.glow}90`,
            borderRadius: 4, padding: "8px 14px", fontSize: 15,
            pointerEvents: "none", boxShadow: `0 0 18px ${hover.glow}40`,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, color: hover.glow }}>
            {hover.locked ? "🔒" : "🎵"} {hover.title}
          </div>
          <div style={{ opacity: 0.8 }}>
            {hover.locked ? (
              "not yet visited — find it in the dungeon"
            ) : (
              <>
                {hover.mood && `${hover.mood} · `}
                {hover.genre && `${hover.genre} · `}
                {hover.bpm && `${hover.bpm} BPM · `}
                attuned {Math.round(hover.completeness * 100)}%
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
