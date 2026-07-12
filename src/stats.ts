// Player stats derived from attunement. Nothing here is persisted — stats are
// recomputed from dwell + tracks so old saves work and state can't drift.
// Design + rationale: docs/design/2026-07-12-attunement-stats.md
import type { TrackInfo } from "./dungeon";

// ponytail: 30s dwell = "fully listened" placeholder; swap in real track
// duration once M4 wires the API
export const DWELL_TARGET = 30;
export const completenessOf = (dwell: number | undefined) =>
  Math.min(1, (dwell ?? 0) / DWELL_TARGET);

export interface PlayerStats {
  agility: number;
  stamina: number;
}

// Fast tracks feed agility, slow tracks feed stamina; unknown bpm splits evenly.
export const agilityShare = (bpm: number | null | undefined) =>
  bpm == null ? 0.5 : Math.max(0, Math.min(1, (bpm - 60) / 120));

// 1 point of total stats per attuned track (dwell >= DWELL_TARGET).
export function derivePlayerStats(
  dwell: Record<string, number>,
  placed: Record<string, string>,
  tracks: Record<string, TrackInfo>,
): PlayerStats {
  let agility = 0;
  let stamina = 0;
  for (const [trackId, cellKey] of Object.entries(placed)) {
    if ((dwell[cellKey] ?? 0) < DWELL_TARGET) continue;
    const share = agilityShare(tracks[trackId]?.models?.bpm);
    agility += share;
    stamina += 1 - share;
  }
  return { agility, stamina };
}

export const sprintMultiplier = (agility: number) => 2 + agility * 0.1;
export const sprintMaxSeconds = (stamina: number) => 1.5 + stamina * 0.5;
