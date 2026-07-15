# Music Dungeon

The core idea is to improve music exploration through engaging gameplay. You
start from your own vibe, and the game explores similar music from there. The
design encourages you to listen as much as possible, and forces you to listen
at least a little — so that the exploration just passes without you noticing,
avoiding the fatigue that usually comes with music discovery.

On top of that, the game uses each track's own musical characteristics to
create variety — mood, tempo, energy all quietly shape the gameplay of that
room, so each song's personality shows up in the experience without being
spelled out.

Content is limited and the balance isn't great, but I think it's a concept
with a lot of potential.

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
