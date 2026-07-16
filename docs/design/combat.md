# Combat Design

## Problem

Players can explore indefinitely with no risk or stakes. The dungeon needs gameplay tension that rewards engagement without undermining the core "listening = growth" principle.

## Room Types (deterministic via hashKey)

| Type | Frequency | Effect |
|---|---|---|
| **Combat** | 80% | 30-second exit lock on entry + enemies spawn |
| **Treasure** | 10% | No combat; dwell accumulates at 2× speed |
| **Rest** | 10% | No combat; HP restored to full on entry |

`hashKey(cellKey) % 10` keeps rooms identical across sessions — the same cell always has the same type, enabling strategic memory.

## Combat Style: Auto-Attack (Vampire Survivors-style)

- Player movement is the core skill (existing agility/stamina system)
- Auto-attack fires at the nearest enemy on a cooldown — no new input required
- Two enemy archetypes: **Charger** (melee, rushes the player), **Shooter** (maintains distance, fires projectiles)

## 30-Second Lock Mechanic

Combat rooms lock all exits for 30 seconds on entry. This:
- Forces engagement with enemies (can't immediately flee)
- Guarantees minimum dwell time (supports attunement)
- Resolves automatically — no "clear all enemies" requirement, reducing frustration

## Stats Integration

Combat numbers derived from existing attunement axes — no new stat categories:

```
maxHP       = 50 + stamina × 10
attackRate  = max(0.3s, 0.8s − agility × 0.04s)
attackDmg   = 10 + (agility + stamina) × 1.25
```

See `docs/design/attunement.md` for the full stat model.

## State Architecture

Enemies and projectiles live in `useRef` inside `useGameLoop` — not in the Zustand store. At 60fps, store writes flood React with re-renders and localStorage writes. Only `gameOver` (boolean) is dispatched to the store as an event.

## Meta-Progression: totalDwell

On `resetDungeon()`, the current run's `dwell[cellKey]` values are snapshotted into `totalDwell[trackId]` (persisted). The next run's `derivePlayerStats` uses `Math.max(currentDwell, historicDwell)` — attunements from past runs contribute to stats even if those cells don't reappear.

## Game Over

Death triggers `gameOver = true` in the store. `GameOver.tsx` shows:
- Rooms explored
- Newly attuned tracks this run
- **Echoes** — tracks with >50% dwell but not yet fully attuned (the regret mechanic)

"Descend again" calls `resetDungeon()`, which preserves `totalDwell` and returns to the entrance screen.

## Initial Difficulty: Scaling to Player Strength

### Problem

`dungeonMs` resets to 0 on every new dungeon — veteran players always face beginner difficulty.

### Formula

Geometric mean of four difficulty axes, damped slightly below "perfect parity" to give a grace period:

```
d_attack  = BALANCE_HITS_TO_KILL × attackDmg / CHARGER_BASE_HP
d_hp      = maxHP / (BALANCE_HITS_TO_DIE × CHARGER_BASE_DMG)
d_speed   = (250 × sprintMultiplier(agility) / CHARGE_SPEED)²
d_sustain = max(1, hpRegenRate(stamina) / REGEN_BASE)

initialDifficulty = INITIAL_DIFFICULTY_DAMPING × (d_attack × d_hp × d_speed × d_sustain)^(1/4)
initialDungeonMs  = max(0, (initialDifficulty − 1) × DIFFICULTY_SCALE_MS)
```

### Named Constants (all in `combat.ts`)

| Constant | Value | Purpose |
|---|---|---|
| `BALANCE_HITS_TO_KILL` | 3 | Target hits for player to kill a Charger |
| `BALANCE_HITS_TO_DIE` | 3 | Target hits for Charger to kill the player |
| `CHARGER_BASE_HP` | 20 | Charger base HP in `spawnEnemies` |
| `CHARGER_BASE_DMG` | 28 | Charger base damage in `spawnEnemies` |
| `INITIAL_DIFFICULTY_DAMPING` | 0.8 | Keeps initial difficulty slightly below perfect parity |

### New Player Sanity Check (base stats)

d_attack ≈ 1.50, d_hp ≈ 0.60, d_speed ≈ 0.65, d_sustain = 1.00
→ initialDifficulty ≈ 0.70 → initialDungeonMs = **0** ✓ (no offset for new players)

## Rejected Options

- **Music-driven difficulty** (BPM/valence affecting enemy count): async dependency on models adds complexity; deferred, can layer on top of this foundation.
- **Global HP in Zustand:** Charger contact damage is per-frame continuous; storing it in the store is chatty. Local ref pattern used instead.
- **"Clear all enemies" unlock:** frustrating when enemies are numerous or fast. Timer-based unlock is more forgiving.
- **New stat categories for combat:** keeping combat derived from existing agility/stamina avoids UI sprawl and maintains a single-source stats model.
