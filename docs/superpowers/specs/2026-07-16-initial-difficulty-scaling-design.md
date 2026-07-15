# 初始地城難度對應玩家強度

**日期**：2026-07-16  
**狀態**：已核准，待實作

## 問題

每次開啟新地城，`dungeonMs` 歸零，敵人永遠從 difficulty = 1 開始。
老玩家（有大量 `totalDwell` 積累）面對的是新手難度，毫無挑戰感。

## 設計目標

- 新地城初始難度與玩家當前強度對應
- 目標感覺：約 3 擊殺一隻 charger；敵人速度/攻速讓有敏捷/耐力的玩家感受到壓力
- 新手玩家（base stats）不受影響，偏移量為 0
- 不縮短聆聽/dwell 需求（設計原則硬規定）

## 公式

### 四個難度軸

```
d_attack  = BALANCE_HITS_TO_KILL × attackDmg / CHARGER_BASE_HP
           = 3 × attackDmg / 20

d_hp      = maxHP / (BALANCE_HITS_TO_DIE × CHARGER_BASE_DMG)
           = maxHP / 84

d_speed   = (250 × (2 + 0.1 × agility) / CHARGE_SPEED)²
           ─ 讓 charger 速度剛好需要衝刺才能脫身

d_sustain = max(1, hpRegenRate(stamina) / REGEN_BASE)
           = max(1, (0.5 + 0.4 × stamina) / 0.5)
           ─ 回復越高 → 敵人施壓越重
```

### 合併

```
initialDifficulty = INITIAL_DIFFICULTY_DAMPING
                  × (d_attack × d_hp × d_speed × d_sustain)^(1/4)

initialDungeonMs  = max(0, (initialDifficulty − 1) × DIFFICULTY_SCALE_MS)
```

### 具名常數（全部放 combat.ts）

| 常數 | 值 | 說明 |
|------|----|------|
| `BALANCE_HITS_TO_KILL` | 3 | 玩家擊殺 charger 目標次數 |
| `BALANCE_HITS_TO_DIE` | 3 | charger 擊殺玩家目標次數 |
| `CHARGER_BASE_HP` | 20 | `spawnEnemies` charger 底部 HP（同步維護） |
| `CHARGER_BASE_DMG` | 28 | `spawnEnemies` charger 底部傷害（同步維護） |
| `INITIAL_DIFFICULTY_DAMPING` | 0.8 | 讓初始難度比「完美對等」略低，提供緩衝期 |

### 新手玩家驗算（base stats）

- d_attack ≈ 1.50, d_hp ≈ 0.60, d_speed ≈ 0.65, d_sustain = 1.00
- initialDifficulty = 0.8 × (1.50 × 0.60 × 0.65 × 1.00)^0.25 ≈ 0.70
- initialDungeonMs = max(0, (0.70 − 1) × 300_000) = **0** ✓

## 實作位置

### `combat.ts`

新增純函數 `initialDifficultyFromStats(stats: PlayerStats): number`，放在 `difficultyFor` 旁邊。引入上方具名常數。

### `store.ts` — `resetDungeon()`

```ts
// 現有
set({ ...EMPTY, ..., dungeonMs: 0, ... });

// 改為
const stats = derivePlayerStats(snapshot, {}, s.treeNodes, s.durations, snapshot, s.treeNodes);
const initDifficulty = initialDifficultyFromStats(stats);
const initDungeonMs = Math.max(0, (initDifficulty - 1) * DIFFICULTY_SCALE_MS);
set({ ...EMPTY, ..., dungeonMs: initDungeonMs, ... });
```

`derivePlayerStats` 已支援 `totalDwell` 作為 `pastTracks` 來源，不需改動。

## 不做的事

- 不修改 `dungeon.ts`、房間結構、出口生成
- 不修改 `enterDungeon()`（只有 `resetDungeon` 需要偏移）
- 不加新的 store state 欄位

## 測試

在 `combat.test.ts` 新增：
- `initialDifficultyFromStats` 帶 base stats → 回傳 ≤ 1（初始偏移為 0）
- 帶高強度 stats → 回傳 > 1
- 回傳值為有限正數
