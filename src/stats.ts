// Player stats derived from attunement. Nothing here is persisted — stats are
// recomputed from dwell + tracks so old saves work and state can't drift.
// Design + rationale: docs/design/2026-07-12-attunement-stats.md
import type { TrackInfo } from "./dungeon";

// fallback when audio duration is unavailable (mock tracks, not-yet-loaded)
export const DWELL_TARGET = 30;
export const completenessOf = (dwell: number | undefined, target = DWELL_TARGET) =>
  Math.min(1, (dwell ?? 0) / target);

export interface PlayerStats {
  agility: number;
  stamina: number;
  maxHP: number;
  attackRate: number; // seconds between auto-attack shots
  attackDmg: number;
}

// Fast tracks feed agility, slow tracks feed stamina; unknown bpm splits evenly.
export const agilityShare = (bpm: number | null | undefined) =>
  bpm == null ? 0.5 : Math.max(0, Math.min(1, (bpm - 60) / 120));

// 1 point of total stats per attuned track (dwell >= target).
// totalDwell: trackId → cumulative dwell across past runs (meta-progression).
export function derivePlayerStats(
  dwell: Record<string, number>,
  placed: Record<string, string>,
  tracks: Record<string, TrackInfo>,
  durations: Record<string, number> = {},
  totalDwell: Record<string, number> = {},
): PlayerStats {
  let agility = 0;
  let stamina = 0;
  for (const [trackId, cellKey] of Object.entries(placed)) {
    const target = durations[trackId] ?? DWELL_TARGET;
    const effective = Math.max(dwell[cellKey] ?? 0, totalDwell[trackId] ?? 0);
    if (effective < target) continue;
    const share = agilityShare(tracks[trackId]?.models?.bpm);
    agility += share;
    stamina += 1 - share;
  }
  return {
    agility,
    stamina,
    maxHP: 50 + stamina * 10,
    attackRate: Math.max(0.3, 0.8 - agility * 0.04),
    attackDmg: 10 + (agility + stamina) * 2,
  };
}

export const sprintMultiplier = (agility: number) => 2 + agility * 0.1;
export const sprintMaxSeconds = (stamina: number) => 1.5 + stamina * 0.5;
