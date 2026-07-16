# Volume Control — Design Spec

**Date:** 2026-07-16  
**Scope:** Add persistent volume slider to PauseMenu (Esc menu).

## What

A range slider (0–1) in PauseMenu lets the player adjust music volume. Setting persists across sessions via localStorage (Zustand store).

## Architecture

### Store (`store.ts`)

Add to `DungeonState`:
```ts
volume: number;          // 0–1, default 1.0
setVolume: (v: number) => void;
```

Persist `volume` alongside other state in the `localStorage` serialization (already happens automatically via the subscribe handler).

Hydrate: include `volume` in the hydrated fields (with `?? 1` fallback).

### AudioPlayer (`components/AudioPlayer.tsx`)

Subscribe to `volume` from store. Sync to `audioRef.current.volume` via `useEffect`:
```ts
useEffect(() => { if (ref.current) ref.current.volume = volume; }, [volume]);
```
Also set `ref.current.volume = volume` immediately on mount (after the audio element is available).

### PauseMenu (`components/PauseMenu.tsx`)

Add slider between title and action buttons:
```tsx
<input type="range" min={0} max={1} step={0.01} value={volume} onChange={e => setVolume(Number(e.target.value))} />
```
Label: "🔊 Volume" with numeric display optional.

## Data flow

`PauseMenu slider` → `setVolume` → `store.volume` → `AudioPlayer useEffect` → `audio.volume`

## What's not changing

- No separate settings screen
- No per-track volume
- Map audio (future) will inherit same volume when implemented

## Testing

1. Open PauseMenu (Esc), drag slider to 0 → music mutes.
2. Drag to 0.5 → music at half volume.
3. Refresh page → volume persists.
4. `VITE_MOCK=1` mode: AudioPlayer renders nothing for mock tracks, but store still persists volume correctly.
