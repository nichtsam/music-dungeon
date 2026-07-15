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

- **`dungeon.ts`** — pure dungeon model. Rooms live on a 3D lattice keyed `"x,y,z"`. Core invariant: **structure is immutable once generated** — a cell's `exits` are written exactly once, on first entry. Each track is placed in exactly one cell (`placed` map); a similar track already placed elsewhere becomes a one-way portal instead of a new room. Doors are reciprocal (a neighbor's door facing you gives you the matching door back). Similarity score gates exits both ways: weak matches (`DOOR_THRESHOLD`) make dead ends, near-identical ones (`DOOR_CEILING`) and same-titled candidates are skipped as duplicate uploads (see `docs/design/2026-07-15-similarity-ceiling.md`). Door labels come from mood/BPM deltas between track model vectors.
- **`store.ts`** — all app state, persisted to localStorage (`music-dungeon-v2`) on every change; `hydrate()` restores mid-run. `enterRoom` fetches similar tracks + models, then calls `generateExits`.
- **`roomLayout.ts`** — single source of room geometry: tile placements on a 42×42 grid using the 0x72 DungeonTileset II sprite sheet (`sprites.ts`, coords hand-picked, rendered via `background-position`).
- **`components/`** — `Room2D` (2D room + player movement via `hooks/useGameLoop`), `MapOverlay` switches between four map modes: `FloorMap` (2D floor plan), `Structure3D` (lattice cubes), `Attunements3D` (force-directed similarity graph via `lib/springLayout`, deterministic — hash-seeded, no randomness), `StatsPanel` (player stats). `map3d.ts` holds shared CSS-3D helpers; note the color-mix-instead-of-filter trick to avoid Safari 3D flattening.
- **`stats.ts`** — pure progression model. A track is "attuned" once its room dwell reaches `DWELL_TARGET`; each attuned track grants 1 stat point split by BPM (fast → agility = sprint speed, slow → stamina = sprint duration). Stats are never persisted — always derived from `dwell` + `tracks`. Design rationale: `docs/design/`. Hard rule: no mechanic may shorten listening/dwell requirements.
- **`theme.ts`** — top mood tag → room palette as CSS custom properties.

Determinism matters throughout: per-room procedural choices use `hashKey` (djb2) on the cell key, never `Math.random`, so rooms look identical across sessions.

## Testing conventions

Tests live in `src/__tests__/*.test.ts` (vitest, node environment — pure logic only, no DOM). Additionally, `dungeon.ts` carries dev-only `console.assert` smoke checks in an `import.meta.env.DEV` block that run in the browser on load.
