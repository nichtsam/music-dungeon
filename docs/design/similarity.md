# Similarity Filtering Design

## Problem

With real API data, many exits lead to near-identical tracks (remasters, duplicate uploads), turning exploration into a loop of the same song. The original candidate filter only had a lower bound: `DOOR_THRESHOLD = 0.72`.

## Decisions

### 1. Similarity ceiling: `DOOR_CEILING = 0.95`

Candidates scoring above the ceiling are treated as duplicates and skipped — no door, no portal.

### 2. Normalized title deduplication

Lowercase, strip `.mp3` suffix, trim. Among candidates sharing a title with the current room or with each other, only the highest-scoring one is kept. Jamendo frequently has the same track under multiple IDs with scores that don't reach the ceiling.

Both filters apply inside `generateExits`'s `eligible` filter in `dungeon.ts`, consistently for doors and portals. The entrance fallback (guaranteeing at least one exit) bypasses both — having a path takes priority over diversity.

## Relationship to Core Principle

No effect on listening/dwell mechanics — only changes *which tracks become neighbors*, not the listening requirement.

## Rejected Options

- **Ceiling only, no dedup:** duplicate uploads often score around 0.8x, below the ceiling — dedup is needed to catch them.
- **Ceiling at 0.90:** risk of clipping legitimately similar (but distinct) good tracks; starting conservative at 0.95 and tightening after real-data observation.
- **Diversity sampling algorithm** (select by score/style distribution): complexity doesn't match demo scope; hard ceiling + dedup covers the problem first.

## Side Effects (Expected)

Mock fixture variants like `(Reprise)` / `(Night Mix)` score ~0.96 similarity to their originals and are clipped by the ceiling — this is the intended behavior.

## Tuning Notes

- 2026-07-15: initial value 0.95. Update here after real-API distribution data.
