import { paletteFor } from "../theme";
import type { TrackInfo } from "../dungeon";

interface Props {
  track: TrackInfo;
  duration?: number;
  attunement?: number;
}

const MOOD_LABELS: Record<string, string> = {
  aggressive: "Aggressive", calm: "Calm", dark: "Dark",
  energetic: "Energetic", epic: "Epic", ethereal: "Ethereal",
  happy: "Happy", romantic: "Romantic", sad: "Sad", sexy: "Sexy", uplifting: "Uplifting",
};

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TrackDetail({ track, duration, attunement }: Props) {
  const { glow } = paletteFor(track.models);
  const moods = track.models?.moods;
  const sortedMoods = moods ? Object.entries(moods).sort((a, b) => b[1] - a[1]) : [];
  const meta = [
    track.models?.genre,
    track.models?.bpm && `${track.models.bpm} BPM`,
    duration != null && fmtDuration(duration),
  ].filter(Boolean).join(" · ");

  return (
    <div style={{ color: "#e0d8ff" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: glow, marginBottom: 4 }}>
        🎵 {track.title}
      </div>
      {meta && (
        <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 10 }}>{meta}</div>
      )}
      {attunement != null && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, opacity: 0.5, letterSpacing: 1, marginBottom: 4 }}>ATTUNEMENT</div>
          <div style={{ height: 5, background: "#2a2040", borderRadius: 3 }}>
            <div style={{ height: "100%", width: `${Math.min(100, attunement * 100).toFixed(1)}%`, background: glow, borderRadius: 3, transition: "width 0.4s" }} />
          </div>
          <div style={{ fontSize: 12, opacity: 0.55, marginTop: 3 }}>{Math.round(attunement * 100)}%</div>
        </div>
      )}
      {sortedMoods.length > 0 && (
        <div>
          <div style={{ fontSize: 11, opacity: 0.5, letterSpacing: 1, marginBottom: 6 }}>MOOD ANALYSIS</div>
          {sortedMoods.map(([mood, val]) => (
            <div key={mood} style={{ marginBottom: 5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.8, marginBottom: 2 }}>
                <span>{MOOD_LABELS[mood] ?? mood}</span>
                <span>{Math.round(val * 100)}%</span>
              </div>
              <div style={{ height: 3, background: "#2a2040", borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${(val * 100).toFixed(1)}%`, background: glow, borderRadius: 2, opacity: 0.75 }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {!moods && (
        <div style={{ fontSize: 13, opacity: 0.4 }}>sensing the aura…</div>
      )}
    </div>
  );
}
