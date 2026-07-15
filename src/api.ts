// Cyanite REST API wrapper. Shapes per github.com/cyanite-ai/mml-hackatune-26.
// VITE_MOCK=1 (or no proxy target) serves fixtures from mock.ts instead.
import * as mock from "./mock";

export interface TrackRef {
  id: string;
  title: string;
  externalId?: string | null;
}

export interface ScoredTrack {
  score: number; // 0..1
  track: TrackRef;
}

export interface TrackModels {
  moods: Record<string, number>; // MoodSimpleV2 scores 0..1
  bpm: number | null; // BpmV2
  genre: string | null; // top MainGenreV2 tag
  duration?: number; // seconds; set by AudioPlayer in real mode, derived from BPM in mock
}

const MOCK = import.meta.env.VITE_MOCK === "1";

async function req(path: string, init?: RequestInit): Promise<any> {
  const r = await fetch(`/api${path}`, init);
  if (!r.ok) throw new Error(`API ${r.status} on ${path}`);
  return r.json();
}

function post(path: string, body: unknown): Promise<any> {
  return req(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function promptSearch(
  query: string,
  limit = 5,
): Promise<ScoredTrack[]> {
  if (MOCK) return mock.promptSearch(query, limit);
  const res = await post(`/v1/library-tracks/prompt-search?limit=${limit}`, {
    query,
  });
  return res.items;
}

export async function similarTracks(
  id: string,
  limit = 10,
): Promise<ScoredTrack[]> {
  if (MOCK) return mock.similarTracks(id, limit);
  const res = await post(
    `/v1/library-tracks/${id}/similar-tracks?limit=${limit}`,
    {},
  );
  return res.items;
}

const modelsCache = new Map<string, TrackModels>();

export async function trackModels(id: string): Promise<TrackModels> {
  const hit = modelsCache.get(id);
  if (hit) return hit;
  const models = MOCK ? await mock.trackModels(id) : await fetchModels(id);
  modelsCache.set(id, models);
  return models;
}

// seed the cache from persisted state so reloads don't re-spend models quota
export function primeModelsCache(id: string, models: TrackModels): void {
  modelsCache.set(id, models);
}

async function fetchModels(id: string): Promise<TrackModels> {
  // GET /library-tracks/{id}/models -> {items: [{version, ...}]}
  const res = await req(
    `/v1/library-tracks/${id}/models?model=MoodSimpleV2&model=BpmV2&model=MainGenreV2`,
  );
  const byName: Record<string, any> = {};
  for (const m of res.items ?? []) byName[m.version] = m;
  const genres: Record<string, number> = byName.MainGenreV2?.scores ?? {};
  const topGenre =
    Object.entries(genres).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    moods: byName.MoodSimpleV2?.scores ?? {},
    bpm: byName.BpmV2?.tag ?? null,
    genre: byName.MainGenreV2?.tags?.[0] ?? topGenre,
  };
}

// jamendo id lives in title ("12345.mp3") or externalId; mock tracks have neither
export function audioUrl(t: {
  title?: string;
  externalId?: string | null;
}): string | null {
  const jam =
    t.externalId ?? (t.title?.endsWith(".mp3") ? t.title.slice(0, -4) : null);
  return jam ? `/audio/download/track/${jam}/mp32/` : null;
}
