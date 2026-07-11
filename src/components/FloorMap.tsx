// FLOOR MAP — fullscreen 2D plan of one floor (the minimap, grown up).
// ArrowUp/ArrowDown switches between explored floors.
// Drag pans, wheel zooms, double-click recenters.
import { useEffect, useMemo, useRef, useState } from "react";
import { useDungeon } from "../store";
import { paletteFor } from "../theme";

const CELL = 48;
const STEP = 200;

// 2D pan/zoom (no rotation — plain drag pans)
function usePanZoom() {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const view = useRef({ x: 0, y: 0, zoom: 1 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  const apply = () => {
    const v = view.current;
    if (contentRef.current)
      contentRef.current.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
  };

  useEffect(() => {
    apply();
    const el = overlayRef.current;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      view.current.zoom = Math.min(
        3,
        Math.max(0.3, view.current.zoom * Math.exp(-e.deltaY * 0.001)),
      );
      apply();
    };
    el?.addEventListener("wheel", onWheel, { passive: false });
    return () => el?.removeEventListener("wheel", onWheel);
  }, []);

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      // pointer capture would steal the floor buttons' clicks
      if ((e.target as HTMLElement).closest("button")) return;
      drag.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      view.current.x += e.clientX - d.x;
      view.current.y += e.clientY - d.y;
      drag.current = { x: e.clientX, y: e.clientY };
      apply();
    },
    onPointerUp: () => (drag.current = null),
    onDoubleClick: () => {
      view.current = { x: 0, y: 0, zoom: 1 };
      apply();
    },
  };
  return { overlayRef, contentRef, handlers };
}

export default function FloorMap() {
  const { cells, tracks, currentKey, visitedKeys, discovered } = useDungeon();
  const currentFloor = currentKey ? cells[currentKey].pos[2] : 0;
  const [floor, setFloor] = useState(currentFloor);
  const { overlayRef, contentRef, handlers } = usePanZoom();

  const floors = useMemo(
    () =>
      [...new Set(visitedKeys.map((k) => cells[k].pos[2]))].sort((a, b) => b - a),
    [cells, visitedKeys],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = floors.indexOf(floor);
      if (e.key === "ArrowUp" && i > 0) { e.preventDefault(); setFloor(floors[i - 1]); }
      if (e.key === "ArrowDown" && i < floors.length - 1) { e.preventDefault(); setFloor(floors[i + 1]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [floors, floor]);

  const onFloor = visitedKeys.filter((k) => cells[k]?.pos[2] === floor);
  const visited = new Set(visitedKeys);
  const xs = onFloor.map((k) => cells[k].pos[0]);
  const ys = onFloor.map((k) => cells[k].pos[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const PAD_X = (STEP - CELL) / 2;       // center cell horizontally in STEP slot (label width = STEP)
  const LABEL_H = 4 + 20 * 1.3 * 2;      // marginTop + 2 lines @ fontSize 20
  const OFFSET_Y = (STEP - CELL - LABEL_H) / 2; // center cell+label vertically in STEP slot
  const w = (Math.max(...xs) - minX + 1) * STEP;
  const h = (Math.max(...ys) - minY + 1) * STEP;

  return (
    <div
      ref={overlayRef}
      {...handlers}
      style={{
        position: "absolute",
        inset: 0,
        background: "radial-gradient(ellipse at center, #120e20, #05030c 80%)",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        touchAction: "none",
        cursor: "grab",
      }}
    >
      <div ref={contentRef} style={{ position: "relative", width: w, height: h }}>
        {onFloor.map((k) => {
          const cell = cells[k];
          const track = tracks[cell.trackId];
          const [x, y] = cell.pos;
          const pal = paletteFor(track?.models);
          const left = (x - minX) * STEP + PAD_X;
          const top = (y - minY) * STEP + OFFSET_Y;
          const hasSecret = (discovered[k] ?? []).length > 0;
          return (
            <div key={k}>
              {cell.exits
                ?.filter(
                  (e) =>
                    e.kind === "door" &&
                    (e.slot === "east" || e.slot === "south") &&
                    visited.has(e.toKey) &&
                    cells[e.toKey]?.pos[2] === floor,
                )
                .map((e) => (
                  <div
                    key={e.toKey}
                    style={{
                      position: "absolute",
                      background: "#5a4a8a",
                      ...(e.slot === "east"
                        ? { left: left + CELL, top: top + CELL / 2 - 2, width: STEP - CELL, height: 4 }
                        : { left: left + CELL / 2 - 2, top: top + CELL, width: 4, height: STEP - CELL }),
                    }}
                  />
                ))}
              <div
                className={k === currentKey ? "minimap-current" : undefined}
                style={{
                  position: "absolute",
                  left,
                  top,
                  width: CELL,
                  height: CELL,
                  background: pal.glow,
                  opacity: k === currentKey ? 1 : 0.6,
                  borderRadius: 6,
                  border: k === currentKey ? "3px solid #fff" : "3px solid transparent",
                  boxSizing: "border-box",
                  boxShadow: `0 0 14px ${pal.glow}80`,
                }}
              >
                {hasSecret && (
                  <div style={{ position: "absolute", right: -3, top: -3, width: 9, height: 9, borderRadius: "50%", background: "#c890ff" }} />
                )}
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: "50%",
                    transform: "translateX(-50%)",
                    marginTop: 4,
                    fontSize: 20,
                    width: STEP,
                    textAlign: "center",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    color: pal.accent,
                    textShadow: "0 1px 3px #000",
                  }}
                >
                  {track?.title}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* floor switcher */}
      <div
        style={{
          position: "absolute",
          top: 62,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: 10,
          alignItems: "center",
          fontSize: 16,
        }}
      >
        {floors.map((f) => (
          <button
            key={f}
            onClick={() => setFloor(f)}
            style={{
              padding: "4px 12px",
              borderRadius: 4,
              border: f === floor ? "1px solid #ffd700" : "1px solid #3a3060",
              background: f === floor ? "#ffd70022" : "#171226aa",
              color: f === floor ? "#ffd700" : "#b0a8d0",
            }}
          >
            {f >= 0 ? `+${f}` : f}
          </button>
        ))}
        <span style={{ opacity: 0.5, fontSize: 13 }}>↑ / ↓</span>
      </div>
      <div style={{ position: "absolute", top: 62, left: 16, fontSize: 15, opacity: 0.8, pointerEvents: "none", lineHeight: 1.7 }}>
        🗺 FLOOR MAP — floor {floor >= 0 ? `+${floor}` : floor}
        <br />
        drag pan · scroll zoom · double-click recenter
      </div>
    </div>
  );
}
