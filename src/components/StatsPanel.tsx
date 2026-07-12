// PLAYER STATS — the 4th map tab. Read-only view of attunement-derived stats:
// what listening has earned, and which tracks fed which stat.
import { useDungeon } from "../store";
import {
  agilityShare,
  completenessOf,
  derivePlayerStats,
  DWELL_TARGET,
  sprintMaxSeconds,
  sprintMultiplier,
} from "../stats";
import { paletteFor } from "../theme";

const AGI = "#ffd700";
const STAM = "#7bd88f";

export default function StatsPanel() {
  const { placed, tracks, dwell, visitedKeys } = useDungeon();
  const stats = derivePlayerStats(dwell, placed, tracks);

  const attuned = Object.entries(placed)
    .filter(([, cellKey]) => (dwell[cellKey] ?? 0) >= DWELL_TARGET)
    .map(([trackId]) => tracks[trackId])
    .filter(Boolean);
  const avgC = visitedKeys.length
    ? visitedKeys.reduce((s, k) => s + completenessOf(dwell[k]), 0) / visitedKeys.length
    : 0;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "radial-gradient(ellipse at center, #120e20, #05030c 80%)",
        overflow: "auto",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div style={{ width: "min(560px, 90%)", padding: "80px 0 40px" }}>
        <div style={{ fontSize: 15, opacity: 0.8, marginBottom: 16 }}>
          🧙 PLAYER STATS — grown by listening
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          {[
            {
              icon: "⚡", name: "AGILITY", color: AGI, value: stats.agility,
              detail: `sprint speed ×${sprintMultiplier(stats.agility).toFixed(2)}`,
              hint: "fed by fast tracks (high BPM)",
            },
            {
              icon: "🫀", name: "STAMINA", color: STAM, value: stats.stamina,
              detail: `sprint for ${sprintMaxSeconds(stats.stamina).toFixed(1)}s`,
              hint: "fed by slow tracks (low BPM)",
            },
          ].map((s) => (
            <div
              key={s.name}
              style={{
                flex: 1,
                background: "#0c0a14ee",
                border: `2px solid ${s.color}60`,
                borderRadius: 4,
                padding: "14px 18px",
                boxShadow: `0 0 18px ${s.color}20`,
              }}
            >
              <div style={{ fontSize: 15, letterSpacing: 1, color: s.color }}>
                {s.icon} {s.name}
              </div>
              <div style={{ fontSize: 34, fontWeight: 700, color: s.color }}>
                {s.value.toFixed(1)}
              </div>
              <div style={{ fontSize: 14, opacity: 0.85 }}>{s.detail}</div>
              <div style={{ fontSize: 13, opacity: 0.5 }}>{s.hint}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            background: "#0c0a14ee",
            border: "1px solid #5a4a8a",
            borderRadius: 4,
            padding: "12px 18px",
            fontSize: 14,
            marginBottom: 16,
            opacity: 0.9,
          }}
        >
          {attuned.length} / {visitedKeys.length} visited tracks attuned · avg
          attunement {Math.round(avgC * 100)}% · each attuned track grants 1
          stat point, split by its BPM
        </div>

        <div style={{ fontSize: 14, opacity: 0.6, marginBottom: 8 }}>
          ATTUNED TRACKS
        </div>
        {attuned.length === 0 && (
          <div style={{ fontSize: 14, opacity: 0.5 }}>
            none yet — stay with a track until its cube fills in the
            attunements view
          </div>
        )}
        {attuned.map((t) => {
          const share = agilityShare(t.models?.bpm);
          const glow = paletteFor(t.models).glow;
          return (
            <div
              key={t.id}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 10,
                padding: "6px 10px",
                borderLeft: `3px solid ${glow}`,
                background: "#0c0a1480",
                marginBottom: 4,
                fontSize: 14,
              }}
            >
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                🎵 {t.title}
              </span>
              <span style={{ opacity: 0.6 }}>
                {t.models?.bpm ? `${t.models.bpm} BPM` : "? BPM"}
              </span>
              <span style={{ color: AGI }}>+{share.toFixed(2)}⚡</span>
              <span style={{ color: STAM }}>+{(1 - share).toFixed(2)}🫀</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
