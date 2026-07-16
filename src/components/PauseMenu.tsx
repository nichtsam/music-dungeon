import { useDungeon } from "../store";

const CONTROLS = [
  ["WASD / arrows", "move"],
  ["Shift (hold)", "sprint"],
  ["Space", "interact / exit"],
  ["Tab / M", "map"],
  ["Esc", "menu"],
];

export default function PauseMenu() {
  const { setView, resetDungeon, tracks, cells, currentKey, volume, setVolume } = useDungeon();
  const track = currentKey ? tracks[cells[currentKey]?.trackId ?? ""] : undefined;
  const hasRun = !!currentKey;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 20,
        background: "#0c0a14d8",
        backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "#171226",
          border: "1px solid #5a4a8a",
          borderRadius: 8,
          padding: "36px 44px",
          minWidth: 360,
          display: "flex", flexDirection: "column", gap: 24,
          boxShadow: "0 0 60px #7b2dff30",
        }}
      >
        {/* title */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 3, color: "#c890ff" }}>
            ✦ MUSIC DUNGEON
          </div>
          {track && (
            <div style={{ fontSize: 14, opacity: 0.6, marginTop: 6 }}>
              ⛏ {track.title}
            </div>
          )}
        </div>

        {/* volume */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, opacity: 0.6, minWidth: 70 }}>
            {volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"} Volume
          </span>
          <input
            type="range" min={0} max={1} step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            style={{ flex: 1, accentColor: "#c890ff" }}
          />
          <span style={{ fontSize: 13, opacity: 0.45, minWidth: 32, textAlign: "right" }}>
            {Math.round(volume * 100)}%
          </span>
        </div>

        {/* actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {hasRun && (
            <button
              onClick={() => setView("dungeon")}
              style={btnStyle("#5a4a8a", "#c890ff")}
              autoFocus
            >
              ▶ Continue
            </button>
          )}
          <button
            onClick={resetDungeon}
            style={btnStyle("#2a1a1a", "#ff8080")}
          >
            ↩ New Dungeon
          </button>
        </div>

        {/* controls legend */}
        <div>
          <div style={{ fontSize: 12, opacity: 0.45, letterSpacing: 2, marginBottom: 10 }}>
            CONTROLS
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <tbody>
              {CONTROLS.map(([key, action]) => (
                <tr key={key}>
                  <td style={{ padding: "4px 0", opacity: 0.55, width: "45%" }}>{action}</td>
                  <td style={{ padding: "4px 0", textAlign: "right" }}>
                    <span style={{
                      background: "#0c0a14", border: "1px solid #5a4a8a44",
                      borderRadius: 3, padding: "1px 7px", fontSize: 13,
                      color: "#c890ffaa", fontFamily: "monospace",
                    }}>
                      {key}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function btnStyle(bg: string, color: string): React.CSSProperties {
  return {
    padding: "12px 0", fontSize: 16, fontWeight: 700,
    borderRadius: 5, border: `1px solid ${color}44`,
    background: bg, color, cursor: "pointer",
    letterSpacing: 1, transition: "filter 0.15s",
  };
}
