// Top mood tag -> room palette, applied as CSS custom properties.
import type { TrackModels } from "./api";

export interface Palette {
  wall: string;
  floor: string;
  glow: string;
  accent: string;
}

const PALETTES: Record<string, Palette> = {
  dark:       { wall: "#1a1030", floor: "#241640", glow: "#7b4dff", accent: "#b388ff" },
  sad:        { wall: "#16222e", floor: "#1e2f3e", glow: "#4f81a8", accent: "#8fb8d8" },
  calm:       { wall: "#182830", floor: "#20353d", glow: "#4da8a0", accent: "#9adcd4" },
  ethereal:   { wall: "#201a38", floor: "#2a2348", glow: "#9d7bff", accent: "#d0bfff" },
  happy:      { wall: "#2e2410", floor: "#3d3016", glow: "#ffb84d", accent: "#ffd88f" },
  uplifting:  { wall: "#2a2012", floor: "#382b18", glow: "#ffa040", accent: "#ffc98a" },
  energetic:  { wall: "#2a1020", floor: "#38162a", glow: "#ff4da6", accent: "#ff9ad0" },
  aggressive: { wall: "#2e1010", floor: "#3d1616", glow: "#ff4d4d", accent: "#ff9a9a" },
  epic:       { wall: "#1a1a2e", floor: "#22223d", glow: "#ffd700", accent: "#ffe97a" },
  romantic:   { wall: "#2a1420", floor: "#381c2a", glow: "#ff6b9d", accent: "#ffb3cd" },
  sexy:       { wall: "#241018", floor: "#301620", glow: "#e0508a", accent: "#f0a0c0" },
};

const FALLBACK: Palette = PALETTES.calm;

const MOOD_EFFECTS: Record<string, string> = {
  aggressive: "Enemies faster & shoot more often",
  happy:      "Enemy count ×3",
  sad:        "Player speed reduced",
  calm:       "Sprint disabled",
  chill:      "Attack speed halved, damage −60% · Stamina & HP regen ×3",
  dark:       "Enemy HP ×2",
  ethereal:   "50% chance to miss on attack",
  uplifting:  "Player speed boosted",
  energetic:  "Everything moves faster",
  epic:       "Enemy damage increased",
  romantic:   "Fewer enemies",
  scary:      "Enemies are tough and hit hard",
  sexy:       "Enemies slow but hit hard",
};

export const moodEffect = (mood: string | null): string | null =>
  (mood && MOOD_EFFECTS[mood]) || null;

export function topMood(models?: TrackModels | null): string | null {
  if (!models) return null;
  const sorted = Object.entries(models.moods).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? null;
}

export function paletteFor(models?: TrackModels | null): Palette {
  const mood = topMood(models);
  return (mood && PALETTES[mood]) || FALLBACK;
}
