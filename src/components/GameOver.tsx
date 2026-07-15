// Results screen shown when playerHP hits 0. Attunement data is preserved in
// the store; "play again" calls resetDungeon() which snapshots it into totalDwell.
import { useMemo } from "react";
import { useDungeon } from "../store";
import { DWELL_TARGET, completenessOf } from "../stats";

export default function GameOver() {
  const { dwell, placed, tracks, durations, totalDwell, visitedKeys, resetDungeon } =
    useDungeon();

  const { newlyAttuned, echoCount } = useMemo(() => {
    const newlyAttuned: Array<{ title: string; bpm: number | null | undefined }> = [];
    let echoCount = 0;
    for (const [trackId, cellKey] of Object.entries(placed)) {
      const target = durations[trackId] ?? DWELL_TARGET;
      const current = dwell[cellKey] ?? 0;
      const historic = totalDwell[trackId] ?? 0;
      const wasAlreadyAttuned = historic >= target;
      const isNowAttuned = current >= target;
      const completeness = completenessOf(current, target);
      if (isNowAttuned && !wasAlreadyAttuned) {
        newlyAttuned.push({
          title: tracks[trackId]?.title ?? trackId,
          bpm: tracks[trackId]?.models?.bpm,
        });
      } else if (!isNowAttuned && completeness > 0.5) {
        echoCount++;
      }
    }
    return { newlyAttuned, echoCount };
  }, [dwell, placed, tracks, durations, totalDwell]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#0c0a14f0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        zIndex: 100,
        fontFamily: "inherit",
        color: "#e0d8f0",
      }}
    >
      <div style={{ fontSize: 48, fontWeight: 800, color: "#cc4444", letterSpacing: 4 }}>
        FALLEN
      </div>

      <div style={{ fontSize: 18, opacity: 0.7 }}>
        {visitedKeys.length} {visitedKeys.length === 1 ? "room" : "rooms"} explored
      </div>

      {newlyAttuned.length > 0 && (
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <div style={{ fontSize: 14, opacity: 0.6, marginBottom: 8, letterSpacing: 1 }}>
            NEWLY ATTUNED
          </div>
          {newlyAttuned.map((t) => (
            <div key={t.title} style={{ fontSize: 16, color: "#88ddff", margin: "4px 0" }}>
              ♪ {t.title}{t.bpm ? ` · ${t.bpm} BPM` : ""}
            </div>
          ))}
        </div>
      )}

      {echoCount > 0 && (
        <div style={{ fontSize: 14, opacity: 0.5, fontStyle: "italic" }}>
          {echoCount} {echoCount === 1 ? "melody" : "melodies"} left as echoes — unfinished, but not forgotten
        </div>
      )}

      <div style={{ fontSize: 13, opacity: 0.5, textAlign: "center", maxWidth: 360 }}>
        Attunement carries forward — your music lives on.
      </div>

      <button
        onClick={resetDungeon}
        style={{
          marginTop: 8,
          padding: "12px 32px",
          fontSize: 18,
          fontWeight: 700,
          borderRadius: 6,
          border: "2px solid #7b4fc8",
          background: "#2a1a4a",
          color: "#d0b8ff",
          cursor: "pointer",
          letterSpacing: 1,
        }}
      >
        ↩ descend again
      </button>
    </div>
  );
}
