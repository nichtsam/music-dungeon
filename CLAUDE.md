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

Do not start the dev server yourself — Sam runs it. Real-API integration (M4) is paused; the app currently runs on mocks, and real-API response shapes in `api.ts` are guesses marked for verification.

## Architecture

Data flow: components → `store.ts` (zustand) → `api.ts` → real API or `mock.ts` (`VITE_MOCK=1`). The Vite dev proxy (`vite.config.ts`) injects `x-api-key` server-side so the key never reaches the browser.

- **`dungeon.ts`** — pure dungeon model. Rooms live on a 3D lattice keyed `"x,y,z"`. Core invariant: **structure is immutable once generated** — a cell's `exits` are written exactly once, on first entry. Each track is placed in exactly one cell (`placed` map); a similar track already placed elsewhere becomes a one-way portal instead of a new room. Doors are reciprocal (a neighbor's door facing you gives you the matching door back). Similarity score gates exits (`DOOR_THRESHOLD`); weak matches make dead ends. Door labels come from mood/BPM deltas between track model vectors.
- **`store.ts`** — all app state, persisted to localStorage (`music-dungeon-v2`) on every change; `hydrate()` restores mid-run. `enterRoom` fetches similar tracks + models, then calls `generateExits`.
- **`roomLayout.ts`** — single source of room geometry: tile placements on a 42×42 grid using the 0x72 DungeonTileset II sprite sheet (`sprites.ts`, coords hand-picked, rendered via `background-position`).
- **`components/`** — `Room2D` (2D room + player movement via `hooks/useGameLoop`), `MapOverlay` switches between three map modes: `FloorMap` (2D floor plan), `Structure3D` (lattice cubes), `Nest3D` (force-directed similarity graph via `lib/springLayout`, deterministic — hash-seeded, no randomness). `map3d.ts` holds shared CSS-3D helpers; note the color-mix-instead-of-filter trick to avoid Safari 3D flattening.
- **`theme.ts`** — top mood tag → room palette as CSS custom properties.

Determinism matters throughout: per-room procedural choices use `hashKey` (djb2) on the cell key, never `Math.random`, so rooms look identical across sessions.

## Testing conventions

Tests live in `src/__tests__/*.test.ts` (vitest, node environment — pure logic only, no DOM). Additionally, `dungeon.ts` carries dev-only `console.assert` smoke checks in an `import.meta.env.DEV` block that run in the browser on load.
