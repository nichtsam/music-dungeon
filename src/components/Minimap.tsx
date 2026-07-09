// Bottom-right minimap: current-floor projection of explored rooms.
// Mood-colored cells, door connectors, discovered secret passages as dots.
// Undiscovered portals stay invisible — no spoilers.
import { useDungeon } from "../store";
import { paletteFor } from "../theme";

const CELL = 18;
const STEP = 26; // cell + gap

export default function Minimap() {
  const { cells, tracks, currentKey, visitedKeys, discovered } = useDungeon();
  if (!currentKey || !cells[currentKey]) return null;
  const floor = cells[currentKey].pos[2];
  const onFloor = visitedKeys.filter((k) => cells[k]?.pos[2] === floor);
  if (!onFloor.length) return null;

  const xs = onFloor.map((k) => cells[k].pos[0]);
  const ys = onFloor.map((k) => cells[k].pos[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const w = (Math.max(...xs) - minX + 1) * STEP;
  const h = (Math.max(...ys) - minY + 1) * STEP;
  const visited = new Set(visitedKeys);

  return (
    <div
      style={{
        position: "absolute",
        right: 16,
        bottom: 16,
        pointerEvents: "none",
        zIndex: 6,
        textAlign: "right",
      }}
    >
      <div style={{ fontSize: 14, opacity: 0.75, marginBottom: 6, letterSpacing: 2 }}>
        FLOOR {floor >= 0 ? `+${floor}` : floor}
      </div>
      <div
        style={{
          position: "relative",
          width: w,
          height: h,
          background: "#0c0a14cc",
          border: "1px solid #3a3060",
          borderRadius: 4,
          padding: 6,
          boxSizing: "content-box",
        }}
      >
        {onFloor.map((k) => {
          const cell = cells[k];
          const [x, y] = cell.pos;
          const pal = paletteFor(tracks[cell.trackId]?.models);
          const left = (x - minX) * STEP + 6;
          const top = (y - minY) * STEP + 6;
          const hasSecret = (discovered[k] ?? []).length > 0;
          return (
            <div key={k}>
              {/* door connectors: draw east/south only (dedups the pair) */}
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
                        ? { left: left + CELL, top: top + CELL / 2 - 1, width: STEP - CELL, height: 2 }
                        : { left: left + CELL / 2 - 1, top: top + CELL, width: 2, height: STEP - CELL }),
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
                  opacity: k === currentKey ? 1 : 0.55,
                  borderRadius: 3,
                  border: k === currentKey ? "2px solid #fff" : "2px solid transparent",
                  boxSizing: "border-box",
                }}
              >
                {hasSecret && (
                  <div style={{ position: "absolute", right: -2, top: -2, width: 6, height: 6, borderRadius: "50%", background: "#c890ff" }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
