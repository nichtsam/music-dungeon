import { useState, useMemo } from "react";
import { useDungeon } from "../store";
import { DWELL_TARGET, completenessOf } from "../stats";
import { paletteFor } from "../theme";
import TrackDetail from "./TrackDetail";

export default function GameOver() {
  const { dwell, tracks, cells, durations, visitedKeys, resetDungeon } = useDungeon();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const entries = useMemo(() => {
    return visitedKeys
      .map((cellKey) => {
        const trackId = cells[cellKey]?.trackId;
        if (!trackId) return null;
        const track = tracks[trackId];
        if (!track) return null;
        const target = durations[trackId] ?? DWELL_TARGET;
        const dwellSec = dwell[cellKey] ?? 0;
        const attunement = completenessOf(dwellSec, target);
        return { cellKey, trackId, track, attunement };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .sort((a, b) => b.attunement - a.attunement);
  }, [visitedKeys, cells, tracks, dwell, durations]);

  const attuned = entries.filter((e) => e.attunement >= 1).length;

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "#0c0a14",
        display: "flex", flexDirection: "column", alignItems: "center",
        fontFamily: "inherit", color: "#e0d8f0",
        overflowY: "auto",
      }}
    >
      {/* header */}
      <div style={{ textAlign: "center", padding: "48px 24px 24px" }}>
        <div style={{ fontSize: 48, fontWeight: 800, color: "#cc4444", letterSpacing: 4 }}>
          FALLEN
        </div>
        <div style={{ fontSize: 16, opacity: 0.6, marginTop: 8 }}>
          {visitedKeys.length} {visitedKeys.length === 1 ? "room" : "rooms"} explored
          {attuned > 0 && ` · ${attuned} attuned`}
        </div>
      </div>

      {/* track list */}
      <div style={{ width: "100%", maxWidth: 520, padding: "0 16px", display: "flex", flexDirection: "column", gap: 6 }}>
        {entries.map(({ cellKey, trackId, track, attunement }) => {
          const { glow } = paletteFor(track.models);
          const isAttuned = attunement >= 1;
          const isOpen = expandedKey === cellKey;

          return (
            <div
              key={cellKey}
              style={{
                background: "#171226",
                border: `1px solid ${isAttuned ? glow + "60" : "#3a3050"}`,
                borderRadius: 6,
                overflow: "hidden",
              }}
            >
              {/* collapsed row */}
              <div
                onClick={() => setExpandedKey(isOpen ? null : cellKey)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 14px", cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <span style={{ fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {track.title}
                </span>
                {isAttuned && (
                  <span style={{ fontSize: 10, letterSpacing: 1, color: glow, border: `1px solid ${glow}80`, borderRadius: 3, padding: "1px 5px", flexShrink: 0 }}>
                    ATTUNED
                  </span>
                )}
                {/* mini progress bar */}
                <div style={{ width: 60, height: 4, background: "#2a2040", borderRadius: 2, flexShrink: 0 }}>
                  <div style={{ height: "100%", width: `${Math.min(100, attunement * 100)}%`, background: glow, borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 11, opacity: 0.4, flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</span>
              </div>

              {/* expanded detail */}
              {isOpen && (
                <div style={{ padding: "0 14px 14px", borderTop: "1px solid #2a2040" }}>
                  <TrackDetail
                    track={track}
                    duration={durations[trackId]}
                    attunement={attunement}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{ padding: "32px 24px 48px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 13, opacity: 0.4 }}>
          Attunement carries forward — your music lives on.
        </div>
        <button
          onClick={resetDungeon}
          style={{
            padding: "12px 32px", fontSize: 18, fontWeight: 700,
            borderRadius: 6, border: "2px solid #7b4fc8",
            background: "#2a1a4a", color: "#d0b8ff",
            cursor: "pointer", letterSpacing: 1,
          }}
        >
          ↩ descend again
        </button>
      </div>
    </div>
  );
}
