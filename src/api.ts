// Cyanite private-alpha API wrapper. Shapes per cyanite2.0 public-documentation/docs/search.mdx.
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
  genre: string | null; // top GenreV7 tag
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
  const res = await post(
    `/v1/private-alpha/library-tracks/prompt-search?limit=${limit}`,
    { query },
  );
  return res.items;
}

export async function similarTracks(
  id: string,
  limit = 10,
): Promise<ScoredTrack[]> {
  if (MOCK) return mock.similarTracks(id, limit);
  const res = await post(
    `/v1/private-alpha/library-tracks/${id}/similar-tracks?limit=${limit}`,
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

// ponytail: response shape guessed from model names; verify + fix in M4 against real API
async function fetchModels(id: string): Promise<TrackModels> {
  const res = await req(
    `/v1/library-tracks/${id}/models?model=MoodSimpleV2&model=BpmV2&model=GenreV7`,
  );
  const byName: Record<string, any> = {};
  for (const m of res.items ?? res.models ?? []) byName[m.model ?? m.name] = m;
  const genres: Record<string, number> = byName.GenreV7?.scores ?? {};
  const topGenre =
    Object.entries(genres).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    moods: byName.MoodSimpleV2?.scores ?? {},
    bpm: byName.BpmV2?.tag ?? null,
    genre: byName.GenreV7?.tag ?? topGenre,
  };
}
