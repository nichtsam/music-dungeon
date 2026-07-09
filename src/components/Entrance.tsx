import { useState } from "react";
import { useDungeon } from "../store";

const PLACEHOLDER =
  "music for walking alone through a rainy city at night…";

const SUGGESTIONS = [
  "walking alone through a rainy city at night",
  "epic sci-fi movie ending, but lonely",
  "coding with energy, no vocals",
  "a warm summer porch afternoon",
];

export default function Entrance() {
  const [query, setQuery] = useState("");
  const { enterDungeon, loading, error } = useDungeon();

  const go = () => query.trim() && enterDungeon(query.trim());

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: 24,
      }}
    >
      <h1 style={{ fontSize: 28, letterSpacing: 2, lineHeight: 1.5 }}>🏰 MUSIC DUNGEON</h1>
      <p style={{ opacity: 0.7, maxWidth: 480, textAlign: "center" }}>
        Describe a feeling, a scene, a moment. We'll find the track that
        matches — and it becomes the entrance to your dungeon.
      </p>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && go()}
        placeholder={PLACEHOLDER}
        style={{
          width: "min(560px, 90vw)",
          padding: "14px 18px",
          fontSize: 16,
          borderRadius: 10,
          border: "1px solid #5a4a8a",
          background: "#171226",
          color: "inherit",
          outline: "none",
        }}
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", maxWidth: 640 }}>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setQuery(s)}
            style={{
              padding: "6px 12px",
              fontSize: 16,
              borderRadius: 999,
              border: "1px solid #3a3060",
              background: "transparent",
              color: "#b0a8d0",
            }}
          >
            {s}
          </button>
        ))}
      </div>
      <button
        onClick={go}
        disabled={loading || !query.trim()}
        style={{
          padding: "12px 32px",
          fontSize: 18,
          borderRadius: 10,
          border: "none",
          background: loading ? "#3a3060" : "#7b4dff",
          color: "#fff",
        }}
      >
        {loading ? "Descending…" : "Enter the Dungeon"}
      </button>
      {error && <p style={{ color: "#ff8080" }}>{error}</p>}
    </div>
  );
}
