// PLAYER STATS — the 4th map tab. Read-only view of attunement-derived stats:
// what listening has earned, and which tracks fed which stat.
import { useDungeon } from "../store";
import {
  agilityShare,
  derivePlayerStats,
  DWELL_TARGET,
  sprintMultiplier,
} from "../stats";
import { paletteFor } from "../theme";

const CLR = {
  hp:      "#ff6b6b",
  attack:  "#ff9a3c",
  agility: "#ffd700",
  stamina: "#7bd88f",
  sprint:  "#a0c4ff",
  rate:    "#c09fff",
};

export default function StatsPanel() {
  const { placed, tracks, dwell, durations, totalDwell, treeNodes } = useDungeon();
  const s = derivePlayerStats(dwell, placed, tracks, durations, totalDwell, treeNodes);

  const trackEntries: {
    id: string; title: string; bpm: number | null | undefined; glow: string;
    pts: number; agility: number; stamina: number;
  }[] = [];

  function pushEntry(trackId: string, t: { title: string; models?: { bpm?: number | null } | null }, effective: number) {
    const target = durations[trackId] ?? DWELL_TARGET;
    const listened = Math.min(effective, target);
    if (listened === 0) return;
    const pts = listened / DWELL_TARGET + (effective >= target ? target / DWELL_TARGET : 0);
    const f = agilityShare(t.models?.bpm);
    trackEntries.push({
      id: trackId, title: t.title, bpm: t.models?.bpm,
      glow: paletteFor(t.models as Parameters<typeof paletteFor>[0]).glow,
      pts,                   // goes to both maxHP and attackDmg
      agility: pts * f,
      stamina: pts * (1 - f),
    });
  }

  for (const [trackId, cellKey] of Object.entries(placed)) {
    const t = tracks[trackId];
    if (t) pushEntry(trackId, t, Math.max(dwell[cellKey] ?? 0, totalDwell[trackId] ?? 0));
  }
  for (const [trackId, t] of Object.entries(treeNodes)) {
    if (!placed[trackId]) pushEntry(trackId, t, totalDwell[trackId] ?? 0);
  }

  trackEntries.sort((a, b) => (b.pts + b.agility + b.stamina) - (a.pts + a.agility + a.stamina));

  const card = (color: string, icon: string, name: string, value: string, hint: string) => (
    <div key={name} style={{ background: "#0c0a14ee", border: `1px solid ${color}50`, borderRadius: 4, padding: "12px 14px", boxShadow: `0 0 10px ${color}18` }}>
      <div style={{ fontSize: 12, letterSpacing: 1, color, marginBottom: 4 }}>{icon} {name}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>{hint}</div>
    </div>
  );

  return (
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, #120e20, #05030c 80%)", overflow: "auto", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "min(580px, 92%)", padding: "80px 0 40px" }}>
        <div style={{ fontSize: 15, opacity: 0.8, marginBottom: 16 }}>🧙 PLAYER STATS — grown by listening</div>

        {/* Core stats: HP, Attack, Agility, Stamina — all equal weight, 2×2 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          {card(CLR.hp,      "❤️", "HP",      s.maxHP.toFixed(1),    "all listening (base 50)")}
          {card(CLR.attack,  "⚔️", "ATTACK",  s.attackDmg.toFixed(1),"all listening (base 10)")}
          {card(CLR.agility, "⚡", "AGILITY", s.agility.toFixed(1),  "from fast tracks (high BPM)")}
          {card(CLR.stamina, "🫀", "STAMINA", s.stamina.toFixed(1),  "from slow tracks (low BPM)")}
        </div>

        {/* Derived: Sprint Speed, Attack Rate — show formula */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
          {card(CLR.sprint, "🏃", "SPRINT SPEED", `×${sprintMultiplier(s.agility).toFixed(1)}`, `agility × 0.1 + 2`)}
          {card(CLR.rate,   "🔫", "ATTACK RATE",  `${s.attackRate.toFixed(1)}s`,                `0.8 − agility × 0.04`)}
        </div>

        {/* Track contributions */}
        <div style={{ fontSize: 13, opacity: 0.5, marginBottom: 8, letterSpacing: 1 }}>TRACK CONTRIBUTIONS</div>
        {trackEntries.length === 0 && <div style={{ fontSize: 14, opacity: 0.5 }}>none yet — stay in a room to earn stat points</div>}
        {trackEntries.map((t) => (
          <div key={t.id} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "6px 10px", borderLeft: `3px solid ${t.glow}`, background: "#0c0a1480", marginBottom: 4, fontSize: 13 }}>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🎵 {t.title}</span>
            <span style={{ opacity: 0.4, fontSize: 11 }}>{t.bpm ? `${t.bpm}bpm` : "?bpm"}</span>
            <span style={{ color: CLR.hp }}>+{t.pts.toFixed(1)}❤️</span>
            <span style={{ color: CLR.attack }}>+{t.pts.toFixed(1)}⚔️</span>
            <span style={{ color: CLR.agility }}>+{t.agility.toFixed(1)}⚡</span>
            <span style={{ color: CLR.stamina }}>+{t.stamina.toFixed(1)}🫀</span>
          </div>
        ))}
      </div>
    </div>
  );
}
