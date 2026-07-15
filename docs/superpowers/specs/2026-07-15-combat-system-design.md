# Combat System Design

**Date:** 2026-07-15  
**Status:** Implemented

## Problem

Players can explore indefinitely with no risk or stakes. The dungeon needs gameplay tension that rewards engagement without undermining the core "listening = growth" principle.

## Design Decisions

### Room Types (deterministic via hashKey)

| Type | Probability | Effect |
|------|-------------|--------|
| combat | 70% | 30-second exit lock + enemies spawn |
| treasure | 20% | No combat · dwell accumulates 2× |
| rest | 10% | No combat · HP restored to full |

Using `hashKey(cellKey) % 10` keeps rooms identical across sessions — same cell always has the same type, enabling strategic memory.

### Combat Style: Vampire Survivors-style auto-attack

- Player movement is the core skill (existing agility/stamina system)
- Auto-attack fires at nearest enemy on a cooldown — no new input required
- Two enemy archetypes: **Charger** (melee, rushes player) and **Shooter** (maintains distance, fires projectiles)

### 30-Second Lock Mechanic

Combat rooms lock exits for 30 seconds on entry. This:
- Forces engagement with enemies (can't immediately flee)
- Guarantees minimum dwell time (supports attunement)
- Resolves automatically — no "clear all enemies" requirement, reducing frustration

### Stats Integration

Combat numbers derived from existing attunement axes — no new stat categories:

```
maxHP       = 50 + stamina × 10
attackRate  = max(0.5s, 1.5s − agility × 0.05s)
attackDmg   = 10 + (agility + stamina) × 2
```

The more music you've attuned to, the tankier and faster-attacking you become.

### State Architecture

Enemies and projectiles live in `useRef` inside `useGameLoop` — not in Zustand store. At 60fps, store writes would flood React with re-renders and localStorage writes. Only `gameOver` (boolean) is dispatched to the store as an event.

### Meta-Progression: `totalDwell`

On `resetDungeon()`, current run's `dwell[cellKey]` values are snapped into `totalDwell[trackId]` (persisted). Next run's `derivePlayerStats` uses `Math.max(currentDwell, historicDwell)` — so attunements from past runs contribute stats even if those specific cells don't appear again.

### Game Over

Death triggers `gameOver = true` in store. `GameOver.tsx` shows:
- Rooms explored
- Newly attuned tracks this run
- "Echoes" — tracks with >50% dwell but not yet attuned (the 遺憾/regret mechanic)

"Descend again" calls `resetDungeon()` which preserves `totalDwell` and returns to the entrance screen.

## Rejected Options

- **音樂驅動難度** (B): BPM/valence driving enemy count — deferred, async dependency on models adds complexity. Can overlay on top of this foundation.
- **Global game state HP in Zustand**: Chatty — charger contact damage is per-frame continuous. Local ref pattern used instead.
- **"Clear all enemies" unlock condition**: Frustrating when enemies are numerous or fast. Timer-based unlock is gentler.
- **Per-stat-category combat stats**: Keeping combat derived from existing agility/stamina avoids UI sprawl and maintains single-source stats model.

## Files Changed

- `src/combat.ts` (new) — pure model: roomTypeFor, spawnEnemies, moveEnemies, tickShooters, checkCollisions
- `src/stats.ts` — PlayerStats extended with maxHP, attackRate, attackDmg; totalDwell param added
- `src/store.ts` — lockUntil, gameOver, attunementBonus, totalDwell state + resetDungeon action
- `src/hooks/useGameLoop.ts` — combat tick integrated; returns enemiesRef, projectilesRef, playerHPRef
- `src/components/CombatOverlay.tsx` (new) — canvas drawing enemies + projectiles in world space
- `src/components/GameOver.tsx` (new) — death results screen
- `src/components/Room2D.tsx` — room-type effects on entry, HP bar, lock timer, overlay rendering
- `src/__tests__/combat.test.ts` (new) — 18 tests covering pure combat functions
