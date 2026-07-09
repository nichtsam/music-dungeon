// Fullscreen map overlay with three switchable modes:
// 1 FLOOR (2D plan) · 2 STRUCTURE (3D lattice, game-true directions) ·
// 3 NEST (similarity graph / attunement). Tab still closes (handled in App).
import { useEffect } from "react";
import { useDungeon, type MapMode } from "../store";
import FloorMap from "./FloorMap";
import Structure3D from "./Structure3D";
import Nest3D from "./Nest3D";

const MODES: { mode: MapMode; label: string }[] = [
  { mode: "floor", label: "1 FLOOR" },
  { mode: "structure", label: "2 STRUCTURE" },
  { mode: "nest", label: "3 NEST" },
];

export default function MapOverlay() {
  const mapMode = useDungeon((s) => s.mapMode);
  const setMapMode = useDungeon((s) => s.setMapMode);
  const setView = useDungeon((s) => s.setView);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "1") setMapMode("floor");
      else if (e.key === "2") setMapMode("structure");
      else if (e.key === "3") setMapMode("nest");
      else if (e.key === "Escape") setView("dungeon");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setMapMode, setView]);

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 10, background: "#05030c" }}>
      {mapMode === "floor" && <FloorMap />}
      {mapMode === "structure" && <Structure3D />}
      {mapMode === "nest" && <Nest3D />}

      {/* tab bar */}
      <div
        style={{
          position: "absolute",
          top: 14,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: 8,
          zIndex: 11,
        }}
      >
        {MODES.map((m) => (
          <button
            key={m.mode}
            onClick={() => setMapMode(m.mode)}
            style={{
              padding: "6px 16px",
              borderRadius: 4,
              fontSize: 15,
              letterSpacing: 1,
              border: mapMode === m.mode ? "1px solid #ffd700" : "1px solid #3a3060",
              background: mapMode === m.mode ? "#ffd70022" : "#171226cc",
              color: mapMode === m.mode ? "#ffd700" : "#b0a8d0",
            }}
          >
            {m.label}
          </button>
        ))}
        <span style={{ alignSelf: "center", fontSize: 13, opacity: 0.5, marginLeft: 6 }}>
          Tab / Esc to return
        </span>
      </div>
    </div>
  );
}
