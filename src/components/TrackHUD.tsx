import { useEffect, useState } from "react";
import { useDungeon } from "../store";
import { completenessOf, DWELL_TARGET } from "../stats";
import { paletteFor, topMood } from "../theme";
import TrackDetail from "./TrackDetail";

export default function TrackHUD() {
  const [expanded, setExpanded] = useState(false);
  const { cells, tracks, currentKey, dwell, durations } = useDungeon();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "i" || e.key === "I") setExpanded((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const cell = currentKey ? cells[currentKey] : null;
  const track = cell ? tracks[cell.trackId] : null;
  if (!track) return null;

  const { glow } = paletteFor(track.models);
  const mood = topMood(track.models);
  const duration = track.id ? durations[track.id] : undefined;
  const attunement = completenessOf(currentKey ? dwell[currentKey] : undefined, duration ?? DWELL_TARGET);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: 16,
        background: "#0c0a14ee",
        border: `2px solid ${glow}60`,
        borderRadius: 4,
        padding: "8px 14px",
        fontSize: 14,
        zIndex: 5,
        pointerEvents: "none",
        maxWidth: 300,
        boxShadow: `0 0 16px ${glow}20`,
      }}
    >
      {expanded ? (
        <>
          <TrackDetail track={track} duration={duration} attunement={attunement} />
          <div style={{ opacity: 0.35, fontSize: 11, marginTop: 8, letterSpacing: 0.5 }}>I · close</div>
        </>
      ) : (
        <>
          <div style={{ fontWeight: 700, color: glow, fontSize: 15, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            🎵 {track.title}
          </div>
          <div style={{ opacity: 0.7, fontSize: 13 }}>
            {[mood, track.models?.genre, track.models?.bpm && `${track.models.bpm} BPM`].filter(Boolean).join(" · ")}
          </div>
          <div style={{ opacity: 0.4, fontSize: 12, marginTop: 3 }}>
            {Math.round(attunement * 100)}% attuned · I for details
          </div>
        </>
      )}
    </div>
  );
}
