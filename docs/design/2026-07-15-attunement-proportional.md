# Attunement: Per-Second Accumulation + Duration Bonus

**Date:** 2026-07-15  
**Status:** Implemented

## Problem

舊系統每首曲固定 1 stat point（binary gate：dwell < target = 0，否則 = 1）。
- 短曲（15s）和長曲（3分鐘）獲得相同點數——不公平
- 沒有途中獎勵，只有 binary 結果
- 不鼓勵長時間停留在一個房間

## Decision

點數改為按秒數線性累積，完整聽完再加上等比 bonus：

```
basePoints = min(listened, target) / DWELL_TARGET
bonus      = target / DWELL_TARGET  (僅在 listened >= target 時)
points     = basePoints + bonus
```

`DWELL_TARGET = 30`（秒）為基準單位。`target = durations[trackId] ?? DWELL_TARGET`。

### 結果對比

| 曲長 | 聽 50% | 聽完 | 舊系統聽完 |
|------|--------|------|-----------|
| 30s (mock) | 0.5 pt | 2 pt | 1 pt |
| 60s | 1.0 pt | 4 pt | 1 pt |
| 3min | 3.0 pt | 12 pt | 1 pt |

Bonus 設計為「完整聽完 = base 翻倍」——簡單且直覺，不需要另一套公式。

## Rejected Alternatives

1. **`completeness * 1` 比例制**：仍以 1pt 為錨點，長曲不值錢（60s 曲聽完仍只給 1pt）。
2. **`Math.max(0, target/DWELL_TARGET - 1)` 額外 bonus**：30s 以下無 bonus、30s 曲 bonus=0 太平，缺乏正強化。
3. **Sqrt 或 log 縮放**：數學複雜，難以向玩家解釋。

## Calibration Note

新系統點數絕對值比舊系統大很多（完整聽 3 首 3 分鐘曲 = 36pt vs. 舊系統 3pt）。
若 stat 數值感覺過高，在 `derivePlayerStats` 加一個 `SCALE` 常數即可等比縮放，不需改公式。

## Files Changed

- `src/stats.ts` — `derivePlayerStats`
- `src/__tests__/stats.test.ts` — 更新期望值 + 新增 duration bonus test
