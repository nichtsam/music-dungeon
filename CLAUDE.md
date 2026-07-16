# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Hack-day demo: free-text search finds a starting track via the Cyanite API, then every track is a dungeon room whose exits lead to similar tracks. 2D room exploration + 3D map views (Tab/M toggles).

## Commands

```sh
VITE_MOCK=1 npm run dev   # mock mode — 20 fixture tracks, no API needed
npm run dev               # real API mode; needs CYANITE_API_URL / CYANITE_API_KEY in .env.local
npm run build             # tsc -b && vite build
npm test                  # vitest run
npm run test:watch
npx vitest run src/__tests__/dungeon.test.ts   # single test file
```

Do not start the dev server yourself — Sam runs it. Real-API shapes in `api.ts` follow the spec at github.com/cyanite-ai/mml-hackatune-26 (REST, `https://rest-api.cyanite.ai/v1`, `x-api-key` header).

## Architecture

Data flow: components → `store.ts` (zustand) → `api.ts` → real API or `mock.ts` (`VITE_MOCK=1`). Two services, separately configurable: search/similarity/models (`CYANITE_API_URL/KEY`, proxied at `/api`) and music fetch (`AUDIO_API_URL/KEY`, proxied at `/audio`, default Jamendo public storage). The Vite dev proxy (`vite.config.ts`) injects each `x-api-key` server-side so keys never reach the browser. `AudioPlayer` (app-level) streams the current room's mp3 via `audioUrl()`; it pauses while the map is open (map tabs will get their own music) and renders nothing for mock tracks.

- **`dungeon.ts`** — pure dungeon model. Rooms live on a 3D lattice keyed `"x,y,z"`. Core invariant: **structure is immutable once generated** — a cell's `exits` are written exactly once, on first entry. Each track is placed in exactly one cell (`placed` map); a similar track already placed elsewhere becomes a one-way portal instead of a new room. Doors are reciprocal (a neighbor's door facing you gives you the matching door back). Similarity score gates exits both ways: weak matches (`DOOR_THRESHOLD`) make dead ends, near-identical ones (`DOOR_CEILING`) and same-titled candidates are skipped as duplicate uploads (see `docs/design/similarity.md`). Door labels come from mood/BPM deltas between track model vectors.
- **`store.ts`** — all app state, persisted to localStorage (`music-dungeon-v2`) on every change; `hydrate()` restores mid-run. `enterRoom` fetches similar tracks + models, then calls `generateExits`. `ViewMode`: `"entrance" | "dungeon" | "map" | "menu"`. Meta-progression fields `totalDwell` and `attunementBonus` survive `resetDungeon`; `savedHP`/`savedStamina` carry HP/stamina across rooms within a run; `lockUntil` is the combat room re-entry gate timestamp.
- **`roomLayout.ts`** — single source of room geometry: tile placements on a 42×42 grid using the 0x72 DungeonTileset II sprite sheet (`sprites.ts`, coords hand-picked, rendered via `background-position`).
- **`hooks/`** — `useGameLoop` drives the RAF animation loop (player pos, stamina, HP, enemies, projectiles — all ref-based to avoid re-renders); `useRoomScale` tracks viewport scale; `useFloorFlourish` / `useTilePattern` handle procedural floor decorations.
- **`components/`** — `Room2D` (2D room + player movement via `useGameLoop`), `MapOverlay` switches between four map modes: `FloorMap` (2D floor plan), `Structure3D` (lattice cubes), `Attunements3D` (force-directed similarity graph via `lib/springLayout`, deterministic — hash-seeded, no randomness), `StatsPanel` (player stats). Additional: `CombatOverlay` (canvas-rendered enemies + projectiles + lightning), `GameOver` (end-run screen: rooms explored, newly attuned tracks, echoes >50% dwell), `PauseMenu` (Esc; volume slider persisted via store), `Entrance` (search box + start flow), `Minimap` (small floor preview), `TrackHUD` / `TrackDetail` / `TrackDetailPanel` (current track info + inspector). `map3d.ts` holds shared CSS-3D helpers; note the color-mix-instead-of-filter trick to avoid Safari 3D flattening.
- **`stats.ts`** — pure progression model. A track is "attuned" once its room dwell reaches `DWELL_TARGET`; each attuned track grants 1 stat point split by BPM (fast → agility = sprint speed, slow → stamina = sprint duration). Stats are never persisted — always derived from `dwell` + `tracks`. Design rationale: `docs/design/attunement.md`. Hard rule: no mechanic may shorten listening/dwell requirements.
- **`combat.ts`** — room type assignment (`roomTypeFor`: combat 80% / treasure 10% / rest 10% via `hashKey` seed), enemy spawn/movement/collision (`Charger` rushes player, `Shooter` fires projectiles), auto-attack loop. `initialDifficultyFromStats(stats)` computes a geometric mean across 4 axes (attack/HP/speed/sustain) to offset `dungeonMs` at run start so veteran players face a scaled baseline. Combat rooms lock re-entry for 30 s (`lockUntil` in store).
- **`theme.ts`** — top mood tag → room palette as CSS custom properties. Also `moodEffect()` → gameplay modifier string (e.g. "Enemy HP ×2") used in combat rooms.

Determinism matters throughout: per-room procedural choices use `hashKey` (djb2) on the cell key, never `Math.random`, so rooms look identical across sessions.

Design decisions live in `docs/design/` as topic files (`attunement.md`, `combat.md`, `similarity.md`) — append new decisions there rather than creating new files. See `docs/gameplay.md` for player-facing mechanics reference.

## Testing conventions

Tests live in `src/__tests__/*.test.ts` (vitest, node environment — pure logic only, no DOM). Additionally, `dungeon.ts` carries dev-only `console.assert` smoke checks in an `import.meta.env.DEV` block that run in the browser on load.
