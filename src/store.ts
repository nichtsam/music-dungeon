import { create } from "zustand";
import {
  primeModelsCache,
  promptSearch,
  similarTracks,
  trackModels,
  type TrackModels,
} from "./api";
import {
  generateExits,
  keyOf,
  type RoomCell,
  type TrackInfo,
} from "./dungeon";

export type View = "entrance" | "dungeon" | "map" | "menu";
export type MapMode = "floor" | "structure" | "attunements" | "stats";

interface DungeonState {
  cells: Record<string, RoomCell>; // key "x,y,z"
  placed: Record<string, string>; // trackId -> cellKey; a track appears once
  tracks: Record<string, TrackInfo>;
  currentKey: string | null;
  visitedKeys: string[];
  discovered: Record<string, string[]>; // cellKey -> revealed portal toKeys
  searched: Record<string, number[]>; // cellKey -> searched suspect-spot indices
  dwell: Record<string, number>; // cellKey -> seconds spent in the room
  durations: Record<string, number>; // trackId -> audio duration in seconds
  runSeed: string; // randomised per run so room types vary between runs
  lockUntil: Record<string, number>; // cellKey -> dungeonMs timestamp when lock expires
  gameOver: boolean;
  // runtime game state — flushed every 5s from useGameLoop
  savedHP: number | null;       // null = init to maxHP on first combat tick
  savedStamina: number | null;  // null = init to maxStam on first tick
  dungeonMs: number;            // total elapsed dungeon time; reference clock for lockUntil
  // meta-progression — persisted
  attunementBonus: Record<string, number>; // cellKey -> dwell multiplier (treasure rooms)
  totalDwell: Record<string, number>; // trackId -> best dwell seconds across all runs
  treeNodes: Record<string, TrackInfo>; // source of truth: all ever-visited tracks, by trackId
  treeEdges: Array<{ fromTrackId: string; toTrackId: string; score: number }>;
  view: View;
  mapMode: MapMode;
  loading: boolean;
  error: string | null;
  setView: (v: View) => void;
  setMapMode: (m: MapMode) => void;
  addDwell: (cellKey: string, seconds: number) => void;
  setDuration: (trackId: string, seconds: number) => void;
  setLockUntil: (cellKey: string, until: number) => void;
  setGameOver: (over: boolean) => void;
  saveProgress: (hp: number | null, stamina: number | null, dungeonMs: number) => void;
  setBonusRoom: (cellKey: string, mult: number) => void;
  resetDungeon: () => void;
  enterDungeon: (query: string) => Promise<void>;
  enterRoom: (key: string) => Promise<void>;
  discover: (cellKey: string, toKey: string) => void;
  markSearched: (cellKey: string, spotIdx: number) => void;
  reset: () => void;
}

const STORAGE_KEY = "music-dungeon-v2";

function hydrate(): Partial<DungeonState> {
  try {
    localStorage.removeItem("music-dungeon"); // v1 state has no coordinates
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const s = JSON.parse(raw);
    if (!s.currentKey || !s.cells?.[s.currentKey]) return {};
    // If the current room never finished loading exits (mid-load refresh),
    // drop the dungeon — the player would be stuck with no doors.
    if (!s.cells[s.currentKey].exits) return {};
    for (const t of Object.values(s.tracks ?? {}) as TrackInfo[])
      if (t.models) primeModelsCache(t.id, t.models);
    return { ...s, view: "menu" as View };
  } catch {
    return {};
  }
}

const EMPTY = {
  cells: {},
  placed: {},
  tracks: {},
  currentKey: null,
  visitedKeys: [],
  discovered: {},
  searched: {},
  dwell: {},
  durations: {},
  runSeed: "",
  lockUntil: {},
  gameOver: false,
  savedHP: null,
  savedStamina: null,
  dungeonMs: 0,
  attunementBonus: {},
  totalDwell: {},
  treeNodes: {} as Record<string, TrackInfo>,
  treeEdges: [] as Array<{ fromTrackId: string; toTrackId: string; score: number }>,
  view: "entrance" as View,
  mapMode: "floor" as MapMode,
  loading: false,
  error: null,
};

export const useDungeon = create<DungeonState>((set, get) => ({
  ...EMPTY,
  ...hydrate(),

  setView: (view) => set({ view }),

  setMapMode: (mapMode) => set({ mapMode }),

  addDwell: (cellKey, seconds) =>
    set((s) => {
      const add = seconds * (s.attunementBonus[cellKey] ?? 1);
      return { dwell: { ...s.dwell, [cellKey]: (s.dwell[cellKey] ?? 0) + add } };
    }),

  setDuration: (trackId, seconds) =>
    set((s) => ({
      durations: { ...s.durations, [trackId]: seconds },
      treeNodes: s.treeNodes[trackId]
        ? { ...s.treeNodes, [trackId]: { ...s.treeNodes[trackId], duration: seconds } }
        : s.treeNodes,
    })),

  discover: (cellKey, toKey) =>
    set((s) => ({
      discovered: {
        ...s.discovered,
        [cellKey]: [...(s.discovered[cellKey] ?? []), toKey],
      },
    })),

  markSearched: (cellKey, spotIdx) =>
    set((s) => ({
      searched: {
        ...s.searched,
        [cellKey]: [...(s.searched[cellKey] ?? []), spotIdx],
      },
    })),

  setLockUntil: (cellKey, until) =>
    set((s) => ({ lockUntil: { ...s.lockUntil, [cellKey]: until } })),

  setGameOver: (over) => set({ gameOver: over }),

  saveProgress: (hp, stamina, dungeonMs) =>
    set((s) => ({
      savedHP: hp ?? s.savedHP,
      savedStamina: stamina ?? s.savedStamina,
      dungeonMs,
    })),

  setBonusRoom: (cellKey, mult) =>
    set((s) => ({ attunementBonus: { ...s.attunementBonus, [cellKey]: mult } })),

  // Snapshot dwell into totalDwell, preserve the attunement tree, reset run state.
  resetDungeon: () => {
    const s = get();
    const snapshot: Record<string, number> = { ...s.totalDwell };
    for (const [trackId, cellKey] of Object.entries(s.placed)) {
      snapshot[trackId] = Math.max(s.dwell[cellKey] ?? 0, s.totalDwell[trackId] ?? 0);
    }
    localStorage.removeItem(STORAGE_KEY);
    set({ ...EMPTY, totalDwell: snapshot, treeNodes: s.treeNodes, treeEdges: s.treeEdges, view: "entrance" as View, savedHP: null, savedStamina: null, dungeonMs: 0, lockUntil: {} });
  },

  reset: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ ...EMPTY });
  },

  enterDungeon: async (query) => {
    set({ loading: true, error: null });
    try {
      const results = await promptSearch(query, 1);
      const top = results[0];
      if (!top) throw new Error("No tracks matched that description.");
      const key = keyOf([0, 0, 0]);
      set({
        cells: { [key]: { pos: [0, 0, 0], trackId: top.track.id } },
        placed: { [top.track.id]: key },
        tracks: {
          [top.track.id]: {
            id: top.track.id,
            title: top.track.title,
            externalId: top.track.externalId,
          },
        },
        runSeed: Math.random().toString(36).slice(2, 9),
        view: "dungeon",
      });
      await get().enterRoom(key);
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  enterRoom: async (key) => {
    const { cells, visitedKeys } = get();
    const cell = cells[key];
    if (!cell) return;
    set({
      currentKey: key,
      visitedKeys: visitedKeys.includes(key)
        ? visitedKeys
        : [...visitedKeys, key],
      loading: !cell.exits,
      error: null,
    });
    if (cell.exits) return; // structure immutable: generated once, stable forever

    try {
      const [similar, selfModels] = await Promise.all([
        similarTracks(cell.trackId, 10),
        trackModels(cell.trackId).catch(() => undefined),
      ]);
      const neighborModels: Record<string, TrackModels | undefined> =
        Object.fromEntries(
          await Promise.all(
            similar.map(async (it) => [
              it.track.id,
              await trackModels(it.track.id).catch(() => undefined),
            ]),
          ),
        );
      const s = get();
      const fresh = s.cells[key];
      if (!fresh || fresh.exits) return; // reset happened mid-flight, or double-fire

      const { exits, newCells, newPlaced } = generateExits(
        key, s.cells, s.placed, s.tracks, similar, selfModels, neighborModels,
      );
      const tracks = { ...s.tracks };
      tracks[cell.trackId] = {
        ...tracks[cell.trackId],
        models: tracks[cell.trackId]?.models ?? selfModels,
      };
      for (const it of similar)
        tracks[it.track.id] ??= {
          id: it.track.id,
          title: it.track.title,
          externalId: it.track.externalId,
          models: neighborModels[it.track.id],
        };
      // Grow the attunement tree: only add the track the player just visited.
      // s.durations[cell.trackId] may already be set if AudioPlayer fired before the API returned.
      const newTreeNodes: Record<string, TrackInfo> = {
        ...s.treeNodes,
        [cell.trackId]: {
          ...tracks[cell.trackId],
          duration: s.durations[cell.trackId] ?? selfModels?.duration,
        },
      };

      // Add edges between this track and any already-visited neighbors (no dangling edges).
      const allCells = { ...s.cells, ...newCells, [key]: { ...fresh, exits } };
      const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);
      const existingPairs = new Set(s.treeEdges.map(e => pairKey(e.fromTrackId, e.toTrackId)));
      const newEdges: typeof s.treeEdges = [];
      for (const ex of exits) {
        const toTrackId = allCells[ex.toKey]?.trackId;
        if (!toTrackId || toTrackId === cell.trackId) continue;
        if (!newTreeNodes[toTrackId]) continue; // only visited-to-visited
        const pk = pairKey(cell.trackId, toTrackId);
        if (!existingPairs.has(pk)) {
          newEdges.push({ fromTrackId: cell.trackId, toTrackId, score: ex.score });
          existingPairs.add(pk);
        }
      }

      set({
        cells: allCells,
        placed: { ...s.placed, ...newPlaced },
        tracks,
        loading: false,
        treeNodes: newTreeNodes,
        treeEdges: newEdges.length ? [...s.treeEdges, ...newEdges] : s.treeEdges,
      });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
}));

useDungeon.subscribe((s) => {
  const { cells, placed, tracks, currentKey, visitedKeys, discovered, searched, dwell, durations, runSeed, attunementBonus, totalDwell, treeNodes, treeEdges, gameOver, lockUntil, savedHP, savedStamina, dungeonMs } = s;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ cells, placed, tracks, currentKey, visitedKeys, discovered, searched, dwell, durations, runSeed, attunementBonus, totalDwell, treeNodes, treeEdges, gameOver, lockUntil, savedHP, savedStamina, dungeonMs }),
  );
});
