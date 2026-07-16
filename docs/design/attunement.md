# Attunement Design

## Core Principle (Hard Rule)

**The game rewards listening more, never less.** Every growth mechanic must amplify exploration (faster sprints, longer sprints, wider visibility). **No mechanic may shorten the time required to listen or attune.** Shortening attunement rewards skipping music — a direct contradiction of the game's purpose.

## What Attunement Means

- **Ideal definition:** listening to a complete track earns one attunement.
- **Current proxy:** room dwell time (`dwell >= DWELL_TARGET`, 30 seconds) stands in for actual playback completion. Once real playback completion is wired up, `DWELL_TARGET` becomes the track's actual duration.
- Attunement happens automatically — no player action required. The Attunements view visualizes growth; the Stats tab shows per-track contributions.

## Accumulation: Linear + Duration Bonus

Points accumulate proportionally to time listened, with a bonus for completing the full track:

```
basePoints = min(listened, target) / DWELL_TARGET
bonus      = target / DWELL_TARGET    (only when listened >= target)
points     = basePoints + bonus
```

`target = durations[trackId] ?? DWELL_TARGET` (falls back to 30s when duration is unknown).

**Effect:** bonus makes "listen to completion = double base points" — simple and intuitive, no second formula. Longer tracks earn more, rewarding patience over room-hopping.

| Track length | Listen 50% | Listen fully |
|---|---|---|
| 30s (mock) | 0.5 pt | 2 pt |
| 60s | 1.0 pt | 4 pt |
| 3min | 3.0 pt | 12 pt |

**Calibration note:** absolute point values are much larger than the old binary system (1 pt per track). If stat values feel inflated, add a `SCALE` constant in `derivePlayerStats` — no formula changes needed.

## Stats

Never persisted — always derived from `dwell` + `tracks`. Stat changes take effect immediately on old saves without migration.

| Stat | Formula |
|---|---|
| **Agility** | sprint speed multiplier `2.0 + agility × 0.1` |
| **Stamina** | sprint max duration `1.5 + stamina × 0.5` seconds |
| **maxHP** | `50 + stamina × 10` |
| **attackDmg** | `10 + (agility + stamina) × 1.25` |
| **attackRate** | `max(0.3s, 0.8s − agility × 0.04s)` (cooldown) |
| **hpRegenRate** | `0.5 + stamina × 0.4` HP/s |

Sprint base duration is intentionally short (1.5s) so each slow-song attunement is perceptible. Stamina drains while moving + sprinting; regenerates when sprint is released (~8s to full); requires 15% to re-engage after empty.

### BPM Split

Each attunement earns exactly 1 total point, split by BPM — fast songs feed Agility, slow songs feed Stamina:

```ts
agilityShare(bpm) = bpm == null ? 0.5 : clamp((bpm - 60) / 120, 0, 1)
```

| BPM | Agility | Stamina |
|---|---|---|
| 180+ | +1.0 | 0 |
| 120 | +0.5 | +0.5 |
| 60- | 0 | +1.0 |
| null (unknown) | +0.5 | +0.5 |

## Rejected Options

- **Resonance (accelerated attunement):** shortening `DWELL_TARGET` rewards skipping music. Permanently off the table.
- **Revealing locked node info in Attunements view:** the view is abstract similarity space, not a navigation aid. Seeing mood/BPM of unvisited nodes provides no actionable information.
- **Click-to-attune:** auto-attunement reduces friction; the Attunements view focuses on reading progress, not triggering it.
- **Mood-vector stat split:** BPM split is intuitive (fast/slow maps directly to agility/stamina). Mood is reserved for future dimensions (e.g. combat modifiers).
- **`completeness × 1pt` proportional:** long tracks (60s) would still only earn 1pt completed — doesn't reward investment in longer songs.
- **Sqrt / log scaling:** mathematically complex and difficult to explain to players.
