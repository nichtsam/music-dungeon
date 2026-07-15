// Player stats derived from attunement. Nothing here is persisted — stats are
// recomputed from dwell + tracks so old saves work and state can't drift.
// Design + rationale: docs/design/2026-07-12-attunement-stats.md
import type { TrackInfo } from "./dungeon";

// fallback when audio duration is unavailable (mock tracks, not-yet-loaded)
export const DWELL_TARGET = 30;
export const completenessOf = (dwell: number | undefined, target = DWELL_TARGET) =>
  Math.min(1, (dwell ?? 0) / target);

// Stat scaling constants — one place to tune all progression rates.
export const BASE_HP       = 50;
export const BASE_ATTACK   = 10;
export const HP_PER_PT     = 5;
export const ATTACK_PER_PT = 1.25;

export const ATTACK_RATE_BASE  = 0.8;   // seconds between shots at agility=0
export const ATTACK_RATE_SLOPE = 0.04;  // reduction per agility point
export const ATTACK_RATE_MIN   = 0.3;

export const SPRINT_SPEED_BASE  = 2;    // multiplier at agility=0
export const SPRINT_SPEED_SLOPE = 0.1;  // added per agility point

export const SPRINT_DUR_BASE  = 1.5;   // seconds at stamina=0
export const SPRINT_DUR_SLOPE = 0.5;   // added per stamina point

export const REGEN_BASE  = 0.5;   // HP/s at stamina=0
export const REGEN_SLOPE = 0.4;   // HP/s per stamina point

export interface PlayerStats {
  maxHP: number;      // accumulated from all listening + BASE_HP
  attackDmg: number;  // accumulated from all listening + BASE_ATTACK
  agility: number;    // from fast tracks (high BPM) → sprint speed + attack rate
  stamina: number;    // from slow tracks (low BPM) → sprint duration + regen
  attackRate: number; // seconds between auto-attack shots (derived from agility)
}

// Fast BPM (high) → agility; slow BPM (low) → stamina; unknown → even split.
export const agilityShare = (bpm: number | null | undefined) =>
  bpm == null ? 0.5 : Math.max(0, Math.min(1, (bpm - 60) / 120));

// Each stat has its own independent calculation from listening time:
//   hp, attack  → all listening seconds, BPM-agnostic
//   agility     → listening seconds × agilityShare(BPM)   (high BPM gives more)
//   stamina     → listening seconds × (1 − agilityShare)  (low BPM gives more)
// Completion bonus (track/DWELL_TARGET extra) applies to each independently.
// pastTracks: track info from treeNodes for historical runs (BPM source).
export function derivePlayerStats(
  dwell: Record<string, number>,
  placed: Record<string, string>,
  tracks: Record<string, TrackInfo>,
  durations: Record<string, number> = {},
  totalDwell: Record<string, number> = {},
  pastTracks: Record<string, TrackInfo> = {},
): PlayerStats {
  let maxHP = 0, attackDmg = 0, agility = 0, stamina = 0;

  function accumulate(trackId: string, effective: number) {
    const target = durations[trackId] ?? DWELL_TARGET;
    const listened = Math.min(effective, target);
    if (listened === 0) return;
    // ponytail: bonus doubles points on full listen; long tracks earn more than short ones
    const pts = listened / DWELL_TARGET + (effective >= target ? target / DWELL_TARGET : 0);
    const bpm = (tracks[trackId] ?? pastTracks[trackId])?.models?.bpm;
    const f = agilityShare(bpm);
    maxHP     += pts * HP_PER_PT;
    attackDmg += pts * ATTACK_PER_PT;
    agility   += pts * f;
    stamina   += pts * (1 - f);
  }

  for (const [trackId, cellKey] of Object.entries(placed)) {
    accumulate(trackId, Math.max(dwell[cellKey] ?? 0, totalDwell[trackId] ?? 0));
  }
  for (const [trackId, effective] of Object.entries(totalDwell)) {
    if (!placed[trackId]) accumulate(trackId, effective);
  }

  return {
    maxHP: BASE_HP + maxHP,
    attackDmg: BASE_ATTACK + attackDmg,
    agility,
    stamina,
    attackRate: Math.max(ATTACK_RATE_MIN, ATTACK_RATE_BASE - agility * ATTACK_RATE_SLOPE),
  };
}

export const sprintMultiplier = (agility: number) => SPRINT_SPEED_BASE + agility * SPRINT_SPEED_SLOPE;
export const sprintMaxSeconds = (stamina: number) => SPRINT_DUR_BASE + stamina * SPRINT_DUR_SLOPE;
export const hpRegenRate      = (stamina: number) => REGEN_BASE + stamina * REGEN_SLOPE;
