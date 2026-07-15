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

Real API mode: copy `.env.example` to `.env.local`, fill in the key, then
`npm run dev`.

```
CYANITE_API_URL=https://rest-api.cyanite.ai            # search/similarity/models
CYANITE_API_KEY=...
AUDIO_API_URL=https://prod-1.storage.jamendo.com       # music fetch (public, key optional)
AUDIO_API_KEY=
```

The Vite dev proxy (`vite.config.ts`) routes `/api` to the search API and
`/audio` to the music API, injecting each `x-api-key` server-side — keys never
reach the browser bundle. In real mode each room plays its track (Jamendo mp3
stream); mock tracks have no audio.

## Controls

- WASD / arrows — move; walk into a door, ladder, or trapdoor to change rooms
- Click an exit — same thing
- Tab / M — toggle the 3D map
- ↩ new dungeon — reset (exploration persists in localStorage otherwise)
