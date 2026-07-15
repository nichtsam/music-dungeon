import { useEffect } from "react";
import { useDungeon } from "../store";
import { completenessOf, DWELL_TARGET } from "../stats";
import { paletteFor } from "../theme";
import TrackDetail from "./TrackDetail";

interface Props {
  trackId: string;
  onClose: () => void;
}

export default function TrackDetailPanel({ trackId, onClose }: Props) {
  const { tracks, treeNodes, placed, dwell, totalDwell, durations, visitedKeys } = useDungeon();
  const track = treeNodes[trackId] ?? tracks[trackId];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!track) return null;

  const { glow } = paletteFor(track.models);
  const cellKey = placed[trackId];
  const visitedThisRun = cellKey ? visitedKeys.includes(cellKey) : false;
  const duration = durations[trackId];
  const effectiveDwell = Math.max(dwell[cellKey] ?? 0, totalDwell[trackId] ?? 0);
  const attunement = (visitedThisRun || totalDwell[trackId])
    ? completenessOf(effectiveDwell, duration ?? DWELL_TARGET)
    : undefined;

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, zIndex: 12 }}
      />
      <div
        style={{
          position: "absolute",
          right: 16,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 13,
          background: "#0c0a14f2",
          border: `2px solid ${glow}90`,
          borderRadius: 6,
          padding: "18px 20px",
          width: 300,
          boxShadow: `0 0 30px ${glow}30`,
          maxHeight: "80vh",
          overflowY: "auto",
        }}
      >
        {!visitedThisRun && !totalDwell[trackId] ? (
          <div style={{ color: "#b0a8d0" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#8a7ab8", marginBottom: 8 }}>
              🔒 {track.title}
            </div>
            <div style={{ opacity: 0.55, fontSize: 13 }}>Not yet visited — find it in the dungeon</div>
          </div>
        ) : (
          <TrackDetail track={track} duration={duration} attunement={attunement} />
        )}
      </div>
    </>
  );
}
