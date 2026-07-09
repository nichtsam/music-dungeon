# Music Dungeon

Search 2.0 hack-day demo: free-text search finds a starting track, then every
track is a dungeon room whose exits lead to similar tracks. Explore the
similarity graph in 2D; press **Tab** to see the explored dungeon as a 3D
force-directed map.

## Run

```sh
npm install
VITE_MOCK=1 npm run dev   # mock mode — 20 fixture tracks, no API needed
```

Real API mode (M4): put credentials in `.env.local`, then `npm run dev`.

```
CYANITE_API_URL=http://localhost:9030   # or stage
CYANITE_API_KEY=...
```

The Vite dev proxy (`vite.config.ts`) injects `x-api-key` and avoids CORS —
the key never reaches the browser bundle.

## Controls

- WASD / arrows — move; walk into a door, ladder, or trapdoor to change rooms
- Click an exit — same thing
- Tab / M — toggle the 3D map
- ↩ new dungeon — reset (exploration persists in localStorage otherwise)
