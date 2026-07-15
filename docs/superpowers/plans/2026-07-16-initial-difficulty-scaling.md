# Initial Difficulty Scaling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New dungeon's starting difficulty scales with player's accumulated strength (totalDwell meta-progression) instead of always starting at difficulty 1.

**Architecture:** Add a pure `initialDifficultyFromStats(stats: PlayerStats): number` function to `combat.ts` using a 4-axis geometric mean (attack/HP/speed/sustain), then wire it into `resetDungeon()` in `store.ts` to compute an initial `dungeonMs` offset instead of 0.

**Tech Stack:** TypeScript, Vitest (tests), Zustand (store)

## Global Constraints

- `npm test` must pass at all times
- No new store state fields — `dungeonMs` is the only thing that changes
- No changes to dungeon structure, room generation, or dwell mechanics
- All numeric balance values must be named constants — no inline magic numbers

---

### Task 1: Extract charger base stats as named constants in combat.ts and add `initialDifficultyFromStats`

**Files:**
- Modify: `src/combat.ts`
- Modify: `src/__tests__/combat.test.ts`

**Interfaces:**
- Produces: `export const CHARGER_BASE_HP = 20`, `export const CHARGER_BASE_DMG = 28`, `export const BALANCE_HITS_TO_KILL = 3`, `export const BALANCE_HITS_TO_DIE = 3`, `export const INITIAL_DIFFICULTY_DAMPING = 0.8`
- Produces: `export function initialDifficultyFromStats(stats: PlayerStats): number`
- Consumes: `PlayerStats` from `./stats` (already exported), `hpRegenRate`, `sprintMultiplier`, `REGEN_BASE` from `./stats`

- [ ] **Step 1: Write failing tests for `initialDifficultyFromStats`**

Add to `src/__tests__/combat.test.ts` — append after the last `describe` block:

```ts
import {
  roomTypeFor, spawnEnemies, moveEnemies,
  isOutOfBounds, checkCollisions, tickShooters,
  initialDifficultyFromStats,
  type Enemy, type Projectile,
} from "../combat";
import { BASE_HP, BASE_ATTACK } from "../stats";
```

Replace existing import line at top with the above (adds `initialDifficultyFromStats`, `BASE_HP`, `BASE_ATTACK`).

Then append at the end of the file:

```ts
// --- initialDifficultyFromStats --------------------------------------------

describe("initialDifficultyFromStats", () => {
  const baseStats = {
    maxHP: BASE_HP,
    attackDmg: BASE_ATTACK,
    agility: 0,
    stamina: 0,
    attackRate: 0.8,
  };

  it("returns ≤ 1 for base stats (no initial offset)", () => {
    expect(initialDifficultyFromStats(baseStats)).toBeLessThanOrEqual(1);
  });

  it("returns > 1 for a strong player", () => {
    const strong = { ...baseStats, maxHP: 200, attackDmg: 40, agility: 10, stamina: 10, attackRate: 0.4 };
    expect(initialDifficultyFromStats(strong)).toBeGreaterThan(1);
  });

  it("returns a finite positive number", () => {
    const result = initialDifficultyFromStats(baseStats);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThan(0);
  });

  it("increases monotonically as stats grow", () => {
    const mid = { ...baseStats, maxHP: 100, attackDmg: 20, agility: 5, stamina: 5, attackRate: 0.6 };
    const high = { ...baseStats, maxHP: 200, attackDmg: 40, agility: 10, stamina: 10, attackRate: 0.4 };
    expect(initialDifficultyFromStats(mid)).toBeLessThan(initialDifficultyFromStats(high));
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run src/__tests__/combat.test.ts
```

Expected: FAIL — `initialDifficultyFromStats` not exported from `../combat`.

- [ ] **Step 3: Add constants and function to `combat.ts`**

Add import at the top of `src/combat.ts` (after existing imports):

```ts
import { hpRegenRate, sprintMultiplier, REGEN_BASE, type PlayerStats } from "./stats";
```

Add the following constants near the top of `src/combat.ts`, just below the existing `export const DIFFICULTY_SCALE_MS` line:

```ts
export const BALANCE_HITS_TO_KILL     = 3;
export const BALANCE_HITS_TO_DIE      = 3;
export const CHARGER_BASE_HP          = 20;  // must match spawnEnemies charger hp literal
export const CHARGER_BASE_DMG         = 28;  // must match spawnEnemies charger dmg literal
export const INITIAL_DIFFICULTY_DAMPING = 0.8;
const PLAYER_BASE_SPEED               = 250; // px/s, matches SPEED in useGameLoop
const SHOOTER_BASE_HP                 = 15;
const SHOOTER_BASE_DMG                = 15;
```

Add the function just below `difficultyFor`:

```ts
// Derives an initial difficulty scalar from player's accumulated stats so that
// new dungeons start at appropriate challenge instead of always at difficulty 1.
// Each axis targets a specific feel; geometric mean balances all four.
export function initialDifficultyFromStats(stats: PlayerStats): number {
  const d_attack  = (BALANCE_HITS_TO_KILL * stats.attackDmg) / CHARGER_BASE_HP;
  const d_hp      = stats.maxHP / (BALANCE_HITS_TO_DIE * CHARGER_BASE_DMG);
  const d_speed   = Math.pow(
    (PLAYER_BASE_SPEED * sprintMultiplier(stats.agility)) / CHARGE_SPEED,
    2,
  );
  const d_sustain = Math.max(1, hpRegenRate(stats.stamina) / REGEN_BASE);
  return INITIAL_DIFFICULTY_DAMPING * Math.pow(d_attack * d_hp * d_speed * d_sustain, 0.25);
}
```

Replace the existing inline literals in `spawnEnemies` (two lines):

```ts
// Before:
const hp = Math.round((kind === "charger" ? 20 : 15) * difficulty * modifier.enemyHPMult);
const dmg = Math.round((kind === "charger" ? 28 : 15) * difficulty * modifier.enemyDmgMult);

// After:
const hp = Math.round((kind === "charger" ? CHARGER_BASE_HP : SHOOTER_BASE_HP) * difficulty * modifier.enemyHPMult);
const dmg = Math.round((kind === "charger" ? CHARGER_BASE_DMG : SHOOTER_BASE_DMG) * difficulty * modifier.enemyDmgMult);
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run src/__tests__/combat.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/combat.ts src/__tests__/combat.test.ts
git commit -m "feat: add initialDifficultyFromStats with named charger base constants"
```

---

### Task 2: Wire initial difficulty into `resetDungeon()` in store.ts

**Files:**
- Modify: `src/store.ts`

**Interfaces:**
- Consumes: `initialDifficultyFromStats` from `./combat`, `DIFFICULTY_SCALE_MS` from `./combat`
- Consumes: `derivePlayerStats` from `./stats`

- [ ] **Step 1: Add imports to `store.ts`**

In `src/store.ts`, update the import from `./combat` (currently not imported — add a new import line after the existing imports):

```ts
import { initialDifficultyFromStats, DIFFICULTY_SCALE_MS } from "./combat";
import { derivePlayerStats } from "./stats";
```

- [ ] **Step 2: Update `resetDungeon()` to compute initial `dungeonMs`**

In `src/store.ts`, find the `resetDungeon` function. Replace the `set(...)` call:

```ts
// Before:
set({ ...EMPTY, totalDwell: snapshot, treeNodes: s.treeNodes, treeEdges: s.treeEdges, view: "entrance" as View, savedHP: null, savedStamina: null, dungeonMs: 0, lockUntil: {} });

// After:
const stats = derivePlayerStats({}, {}, {}, {}, snapshot, s.treeNodes);
const initDifficulty = initialDifficultyFromStats(stats);
const initDungeonMs = Math.max(0, (initDifficulty - 1) * DIFFICULTY_SCALE_MS);
set({ ...EMPTY, totalDwell: snapshot, treeNodes: s.treeNodes, treeEdges: s.treeEdges, view: "entrance" as View, savedHP: null, savedStamina: null, dungeonMs: initDungeonMs, lockUntil: {} });
```

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: All tests pass. `store.ts` has no unit tests — the change is verified by the combat tests (function correctness) and manual play.

- [ ] **Step 4: Commit**

```bash
git add src/store.ts
git commit -m "feat: new dungeon starts at difficulty matching player strength"
```
