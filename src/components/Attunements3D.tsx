// ATTUNEMENT TREE — the music you've collected, as a knowledge-tree graph.
// Deliberately NOT a map: no paths, no floors, no door kinds. Nodes are
// tracks, edges are similarity relations (spring layout on the similarity
// model's real scores, length ~ 1 - score), mood only colors the nodes.
// Tracks referenced by exits but not yet visited appear as locked previews —
// the "next unlockable skill" of the tree. Ground rings fill with dwell-time
// completeness (attunement).
import { Fragment, useMemo, useRef, useState } from "react";
import { useDungeon } from "../store";
import {
  completenessOf,
  derivePlayerStats,
  DWELL_TARGET,
  sprintMaxSeconds,
  sprintMultiplier,
} from "../stats";
import { paletteFor, topMood } from "../theme";
import { hashKey } from "../dungeon";
import { CUBE_FACES, lineStyle, shade, useOrbitCamera, type V3 } from "./map3d";
import { springLayout } from "../lib/springLayout";

const HALO = 70;
// liquid-fill direction per CUBE_FACES face order: top/bottom/sides
const FILL_DIR = ["top", "bottom", "to left", "to right", "to bottom", "to top"] as const;


interface NestNode {
  key: string;
  trackId: string;
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

export default function Attunements3D({ onNodeClick }: { onNodeClick?: (trackId: string) => void }) {
  const { cells, tracks, currentKey, visitedKeys, dwell, placed, durations, totalDwell, treeNodes, treeEdges } = useDungeon();
  const [hover, setHover] = useState<NestNode | null>(null);
  const clickOrigin = useRef<{ x: number; y: number } | null>(null);
  const { overlayRef, sceneRef, pointerHandlers, zoom } = useOrbitCamera();

  const { nodes, tunnels, moodCounts, avgC } = useMemo(() => {
    // Unified node set: all treeNodes (ever-visited) + current-run locked previews.
    // All nodes are keyed by trackId for stability across runs.
    const lockedIds = new Set<string>();
    for (const key of visitedKeys)
      for (const ex of cells[key]?.exits ?? []) {
        const toTrackId = cells[ex.toKey]?.trackId;
        if (toTrackId && !treeNodes[toTrackId]) lockedIds.add(toTrackId);
      }

    const treeTrackIds = Object.keys(treeNodes);
    const allTrackIds = [...treeTrackIds, ...lockedIds];
    const idx = new Map(allTrackIds.map((id, i) => [id, i]));

    // Edges: persistent treeEdges + current-run exits to locked previews.
    const rawEdges: { a: number; b: number; score: number; toLocked: boolean }[] = [];
    const seenPairs = new Set<string>();
    const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

    for (const e of treeEdges) {
      if (!idx.has(e.fromTrackId) || !idx.has(e.toTrackId)) continue;
      const pk = pairKey(e.fromTrackId, e.toTrackId);
      if (seenPairs.has(pk)) continue;
      seenPairs.add(pk);
      rawEdges.push({ a: idx.get(e.fromTrackId)!, b: idx.get(e.toTrackId)!, score: e.score, toLocked: false });
    }
    for (const key of visitedKeys) {
      const fromId = cells[key]?.trackId;
      if (!fromId || !idx.has(fromId)) continue;
      for (const ex of cells[key]?.exits ?? []) {
        const toId = cells[ex.toKey]?.trackId;
        if (!toId || !idx.has(toId)) continue;
        const pk = pairKey(fromId, toId);
        if (seenPairs.has(pk)) continue;
        seenPairs.add(pk);
        rawEdges.push({ a: idx.get(fromId)!, b: idx.get(toId)!, score: ex.score, toLocked: lockedIds.has(toId) });
      }
    }

    const positions = springLayout(
      allTrackIds,
      allTrackIds.map((id) => hashKey(id)),
      rawEdges,
    );

    // Shift so the current room's node is at origin (scene center = viewport center).
    const currentTrackId = cells[currentKey ?? ""]?.trackId;
    const currentIdx = currentTrackId ? allTrackIds.indexOf(currentTrackId) : -1;
    if (currentIdx >= 0) {
      const cx = positions[currentIdx][0], cy = positions[currentIdx][1], cz = positions[currentIdx][2];
      for (const p of positions) { p[0] -= cx; p[1] -= cy; p[2] -= cz; }
    }

    const nodes: NestNode[] = allTrackIds.map((trackId, i) => {
      const locked = lockedIds.has(trackId);
      const track = treeNodes[trackId] ?? tracks[trackId];
      const cellKey = placed[trackId];
      const dwellVal = dwell[cellKey] ?? 0;
      return {
        key: trackId,
        trackId,
        pos: positions[i],
        title: track?.title ?? trackId,
        glow: paletteFor(track?.models).glow,
        mood: topMood(track?.models),
        genre: track?.models?.genre ?? null,
        bpm: track?.models?.bpm ?? null,
        isCurrent: cellKey === currentKey,
        completeness: locked ? 0 : completenessOf(
          Math.max(dwellVal, totalDwell[trackId] ?? 0),
          durations[trackId] ?? DWELL_TARGET,
        ),
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
  }, [cells, tracks, currentKey, visitedKeys, dwell, durations, totalDwell, treeNodes, treeEdges, placed]);

  const unlockedNodes = nodes.filter((n) => !n.locked);
  const attuned = unlockedNodes.filter((n) => n.completeness >= 1).length;
  const stats = derivePlayerStats(dwell, placed, tracks, durations);

  return (
    <div
      ref={overlayRef}
      {...pointerHandlers}
      onPointerDown={(e) => {
        pointerHandlers.onPointerDown(e);
        clickOrigin.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        pointerHandlers.onPointerUp();
        const o = clickOrigin.current;
        if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) < 5 && hover && onNodeClick) {
          onNodeClick(hover.trackId);
        }
        clickOrigin.current = null;
      }}
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

        {/* nodes: shaded cubes matching Structure3D style; counter-scaled so zoom
            changes perspective depth but not apparent node size */}
        {nodes.map((n) => {
          const s = n.isCurrent ? 32 : n.locked ? 14 : 24;
          const cs = 1 / zoom;
          return (
            <Fragment key={n.key}>
              {!n.locked && (
                <div
                  style={{
                    position: "absolute",
                    left: n.pos[0] - HALO / 2,
                    top: n.pos[1] - HALO / 2,
                    width: HALO,
                    height: HALO,
                    transform: `translateZ(${n.pos[2]}px) scale3d(${cs}, ${cs}, ${cs})`,
                    background: `radial-gradient(circle, ${n.glow}40, transparent 70%)`,
                    opacity: 0.6,
                    pointerEvents: "none",
                  }}
                />
              )}
              <div
                onPointerEnter={() => setHover(n)}
                onPointerLeave={() => setHover((h) => (h?.key === n.key ? null : h))}
                className={n.isCurrent ? "map-current" : undefined}
                style={{
                  position: "absolute",
                  left: n.pos[0] - s / 2,
                  top: n.pos[1] - s / 2,
                  width: s,
                  height: s,
                  transform: `translateZ(${n.pos[2]}px) scale3d(${cs}, ${cs}, ${cs})`,
                  transformStyle: "preserve-3d",
                  WebkitTransformStyle: "preserve-3d",
                  pointerEvents: "auto",
                  cursor: "default",
                }}
              >
                {CUBE_FACES.map((f, fi) => {
                  const pct = Math.round(n.completeness * 100);
                  const liquid = shade(n.glow, Math.min(1.6, f.b + 0.5));
                  const shell = n.locked ? shade("#8a84a8", f.b * 0.6) : shade(n.glow, f.b * 0.38);
                  const dir = FILL_DIR[fi];
                  let bg: string;
                  if (n.locked || pct <= 0) bg = shell;
                  else if (dir === "top") bg = pct >= 100 ? liquid : shell;
                  else if (dir === "bottom") bg = liquid;
                  else if (pct >= 100) bg = liquid;
                  else bg = `linear-gradient(${dir}, ${liquid} 0 ${pct}%, ${shell} ${pct}% 100%)`;
                  return (
                    <div
                      key={f.t}
                      style={{
                        position: "absolute",
                        inset: 0,
                        transform: `${f.t} translateZ(${s / 2}px)`,
                        background: bg,
                        border: n.isCurrent ? "2px solid #fff" : "2px solid #0c0a14",
                        borderRadius: 4,
                        boxShadow: n.isCurrent ? `0 0 22px ${n.glow}` : `0 0 8px ${n.glow}80`,
                        opacity: n.locked ? 0.55 : 0.95,
                        backfaceVisibility: "hidden",
                        WebkitBackfaceVisibility: "hidden",
                      }}
                    />
                  );
                })}
              </div>
            </Fragment>
          );
        })}
      </div>
      </div>

      {/* HUD */}
      <div style={{ position: "absolute", top: 62, left: 16, fontSize: 15, opacity: 0.8, lineHeight: 1.7, pointerEvents: "none" }}>
        🌳 ATTUNEMENT TREE — collect · attune · grow
        <br />
        {attuned} / {unlockedNodes.length} tracks attuned · avg {Math.round(avgC * 100)}%
        · {nodes.length - unlockedNodes.length} discovered but unvisited
        <br />
        ⚡ agility {stats.agility.toFixed(1)} (sprint ×{sprintMultiplier(stats.agility).toFixed(1)})
        · 🫀 stamina {stats.stamina.toFixed(1)} ({sprintMaxSeconds(stats.stamina).toFixed(1)}s sprint)
        <br />
        drag rotate · right-drag / shift-drag pan · scroll zoom · double-click recenter
        <br />
        <span style={{ color: "#ffd700" }}>◼</span> cubes fill as you attune ·{" "}
        <span style={{ color: "#8a84a8" }}>◼</span> not yet visited ·{" "}
        <span style={{ color: "#5a4a8a" }}>━</span> similarity (closer &amp; thicker = more alike)
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
