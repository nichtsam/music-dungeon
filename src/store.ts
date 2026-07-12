import { create } from "zustand";
import { promptSearch, similarTracks, trackModels, type TrackModels } from "./api";
import {
  generateExits,
  keyOf,
  type RoomCell,
  type TrackInfo,
} from "./dungeon";

export type View = "entrance" | "dungeon" | "map";
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
  view: View;
  mapMode: MapMode;
  loading: boolean;
  error: string | null;
  setView: (v: View) => void;
  setMapMode: (m: MapMode) => void;
  addDwell: (cellKey: string, seconds: number) => void;
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
    return { ...s, view: "dungeon" as View };
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
    set((s) => ({
      dwell: { ...s.dwell, [cellKey]: (s.dwell[cellKey] ?? 0) + seconds },
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
          [top.track.id]: { id: top.track.id, title: top.track.title },
        },
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
          models: neighborModels[it.track.id],
        };
      set({
        cells: {
          ...s.cells,
          ...newCells,
          [key]: { ...fresh, exits },
        },
        placed: { ...s.placed, ...newPlaced },
        tracks,
        loading: false,
      });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
}));

useDungeon.subscribe((s) => {
  const { cells, placed, tracks, currentKey, visitedKeys, discovered, searched, dwell } = s;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ cells, placed, tracks, currentKey, visitedKeys, discovered, searched, dwell }),
  );
});
