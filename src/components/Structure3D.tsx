// DUNGEON STRUCTURE — the explored dungeon at its true lattice coordinates.
// Directions match the game exactly: a room entered through the east door sits
// to the east. Each occupied floor gets a translucent ground slab; same-floor
// rooms sit on the same ground. Compass letters lie on the bottom slab.
import { Fragment, useMemo, useState } from "react";
import { useDungeon } from "../store";
import { paletteFor, topMood } from "../theme";
import { CUBE_FACES, edgeKey, lineStyle, shade, useOrbitCamera, type V3 } from "./map3d";

const STEP = 150; // px per lattice cell (x/y)
const GAP = 190; // px per floor (z)
const CELL = 40;

interface StructNode {
  key: string;
  pos: V3; // scene coords; z = floor plane, cube sits ON it
  title: string;
  glow: string;
  mood: string | null;
  genre: string | null;
  bpm: number | null;
  floor: number;
  isCurrent: boolean;
}

export default function Structure3D() {
  const { cells, tracks, currentKey, visitedKeys, discovered } = useDungeon();
  const [hover, setHover] = useState<StructNode | null>(null);
  const { overlayRef, sceneRef, pointerHandlers } = useOrbitCamera({
    yaw: 25,
    pitch: 60,
    zoom: 0.9,
  });

  const { nodes, links, slabs, slabW, slabH } = useMemo(() => {
    const visited = new Set(visitedKeys);
    const trail = new Set(
      visitedKeys.slice(1).map((k, i) => edgeKey(visitedKeys[i], k)),
    );
    // center on the global bbox
    const ps = visitedKeys.map((k) => cells[k].pos);
    const mid = (axis: number) => {
      const vals = ps.map((p) => p[axis]);
      return (Math.min(...vals) + Math.max(...vals)) / 2;
    };
    const cx = mid(0), cy = mid(1), cz = mid(2);
    const toScene = (p: [number, number, number]): V3 => [
      (p[0] - cx) * STEP,
      (p[1] - cy) * STEP,
      (p[2] - cz) * GAP,
    ];
    const nodes: StructNode[] = visitedKeys.map((key) => {
      const cell = cells[key];
      const track = tracks[cell.trackId];
      return {
        key,
        pos: toScene(cell.pos),
        title: track?.title ?? cell.trackId,
        glow: paletteFor(track?.models).glow,
        mood: topMood(track?.models),
        genre: track?.models?.genre ?? null,
        bpm: track?.models?.bpm ?? null,
        floor: cell.pos[2],
        isCurrent: key === currentKey,
      };
    });
    const byKey = new Map(nodes.map((n) => [n.key, n]));
    const seen = new Set<string>();
    const links: { p1: V3; p2: V3; portal: boolean; onTrail: boolean }[] = [];
    for (const key of visitedKeys) {
      for (const ex of cells[key]?.exits ?? []) {
        if (!visited.has(ex.toKey)) continue;
        if (ex.kind === "portal" && !(discovered[key] ?? []).includes(ex.toKey))
          continue;
        const k = edgeKey(key, ex.toKey);
        if (seen.has(k)) continue;
        seen.add(k);
        links.push({
          p1: byKey.get(key)!.pos,
          p2: byKey.get(ex.toKey)!.pos,
          portal: ex.kind === "portal",
          onTrail: ex.kind === "door" && trail.has(k),
        });
      }
    }
    const xs = ps.map((p) => p[0]), ys = ps.map((p) => p[1]);
    const slabW = (Math.max(...xs) - Math.min(...xs) + 2) * STEP + 60;
    const slabH = (Math.max(...ys) - Math.min(...ys) + 2) * STEP + 60;
    const slabs = [...new Set(ps.map((p) => p[2]))]
      .sort((a, b) => a - b)
      .map((floor) => ({ floor, z: (floor - cz) * GAP }));
    return { nodes, links, slabs, slabW, slabH };
  }, [cells, tracks, currentKey, visitedKeys, discovered]);

  const bottomSlab = slabs[0];
  // compass letters on the bottom slab edges; game north = -y in scene coords
  const compass: { txt: string; x: number; y: number }[] = [
    { txt: "N", x: 0, y: -slabH / 2 - 30 },
    { txt: "S", x: 0, y: slabH / 2 + 30 },
    { txt: "E", x: slabW / 2 + 30, y: 0 },
    { txt: "W", x: -slabW / 2 - 30, y: 0 },
  ];

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
        {/* one ground slab per occupied floor — same floor, same ground */}
        {slabs.map((s) => (
          <div
            key={s.floor}
            style={{
              position: "absolute",
              left: -slabW / 2,
              top: -slabH / 2,
              width: slabW,
              height: slabH,
              transform: `translateZ(${s.z - CELL / 2 - 4}px)`,
              background:
                "linear-gradient(#241c3028, #241c3028)," +
                `repeating-linear-gradient(0deg, #5a4a8a38 0 1px, transparent 1px ${STEP}px),` +
                `repeating-linear-gradient(90deg, #5a4a8a38 0 1px, transparent 1px ${STEP}px)`,
              border: "1px solid #5a4a8a60",
              pointerEvents: "none",
            }}
          />
        ))}

        {/* compass letters lying on the bottom slab (rotate with the scene,
            so they always point true) */}
        {bottomSlab &&
          compass.map((c) => (
            <div
              key={c.txt}
              style={{
                position: "absolute",
                left: c.x - 20,
                top: c.y - 20,
                width: 40,
                height: 40,
                transform: `translateZ(${bottomSlab.z - CELL / 2 - 3}px)`,
                display: "grid",
                placeItems: "center",
                fontSize: 30,
                fontFamily: '"Press Start 2P", monospace',
                color: c.txt === "N" ? "#ffd700" : "#8a7ab8",
                pointerEvents: "none",
              }}
            >
              {c.txt}
            </div>
          ))}

        {/* links: doors are axis-aligned by construction; portals dashed */}
        {links.map((l, i) => {
          const color = l.portal
            ? "repeating-linear-gradient(90deg, #c890ff 0 6px, transparent 6px 12px)"
            : l.onTrail
              ? "linear-gradient(90deg, #ffd700, #ffb700)"
              : "#5a4a8a";
          const base = lineStyle(l.p1, l.p2, l.onTrail ? 4 : 2.5);
          return (
            <Fragment key={i}>
              <div style={{ ...base, background: color, opacity: l.onTrail ? 0.95 : 0.6 }} />
              <div
                style={{
                  ...base,
                  background: color,
                  opacity: (l.onTrail ? 0.95 : 0.6) * 0.8,
                  transform: base.transform + " rotateX(90deg)",
                }}
              />
            </Fragment>
          );
        })}

        {/* room cubes sitting on their floor slab */}
        {nodes.map((n) => {
          const s = n.isCurrent ? CELL + 8 : CELL;
          return (
            <div
              key={n.key}
              className={n.isCurrent ? "map-current" : undefined}
              onPointerEnter={() => setHover(n)}
              onPointerLeave={() => setHover((h) => (h?.key === n.key ? null : h))}
              style={{
                position: "absolute",
                left: n.pos[0] - s / 2,
                top: n.pos[1] - s / 2,
                width: s,
                height: s,
                transform: `translateZ(${n.pos[2]}px)`,
                transformStyle: "preserve-3d",
                WebkitTransformStyle: "preserve-3d",
                pointerEvents: "auto",
                cursor: "default",
              }}
            >
              {CUBE_FACES.map((f) => (
                <div
                  key={f.t}
                  style={{
                    position: "absolute",
                    inset: 0,
                    transform: `${f.t} translateZ(${s / 2}px)`,
                    background: shade(n.glow, f.b),
                    border: n.isCurrent ? "2px solid #fff" : "2px solid #0c0a14",
                    borderRadius: 4,
                    boxShadow: n.isCurrent ? `0 0 22px ${n.glow}` : `0 0 8px ${n.glow}80`,
                    opacity: 0.95,
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>
      </div>

      {/* HUD */}
      <div style={{ position: "absolute", top: 62, left: 16, fontSize: 15, opacity: 0.8, lineHeight: 1.7, pointerEvents: "none" }}>
        🏰 DUNGEON STRUCTURE — directions match the game
        <br />
        <span style={{ color: "#ffd700" }}>N</span> gold on the ground ·{" "}
        floors stack vertically · <span style={{ color: "#ffd700" }}>━</span> your path ·{" "}
        <span style={{ color: "#c890ff" }}>┅</span> secret passage
        <br />
        drag rotate · right-drag / shift-drag pan · scroll zoom · double-click recenter
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
            🎵 {hover.title}
          </div>
          <div style={{ opacity: 0.8 }}>
            {hover.mood && `${hover.mood} · `}
            {hover.genre && `${hover.genre} · `}
            {hover.bpm && `${hover.bpm} BPM · `}
            floor {hover.floor >= 0 ? `+${hover.floor}` : hover.floor}
          </div>
        </div>
      )}
    </div>
  );
}
