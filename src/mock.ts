// Mock fixtures — 20 fake tracks with coherent mood vectors so similarity
// behaves semantically (dark tracks neighbor dark tracks, clusters emerge in 3D map).
// Shapes mirror search.mdx responses exactly.
import type { ScoredTrack, TrackModels } from "./api";

interface MockTrack {
  id: string;
  title: string;
  moods: Record<string, number>; // sparse, 0..1
  bpm: number;
  genre: string;
}

const T = (
  n: number,
  title: string,
  genre: string,
  bpm: number,
  moods: Record<string, number>,
): MockTrack => ({ id: `libtr_mock${String(n).padStart(3, "0")}`, title, genre, bpm, moods });

const TRACKS: MockTrack[] = [
  T(1, "Neon Rain", "electronicDance", 110, { dark: 0.7, calm: 0.5, sad: 0.4 }),
  T(2, "Midnight Transit", "ambient", 90, { dark: 0.8, calm: 0.7, ethereal: 0.4 }),
  T(3, "Wet Asphalt", "electronicDance", 100, { dark: 0.6, sad: 0.6, calm: 0.4 }),
  T(4, "Sodium Lights", "ambient", 85, { dark: 0.5, ethereal: 0.7, calm: 0.6 }),
  T(5, "Last Train Home", "jazz", 95, { sad: 0.7, romantic: 0.5, calm: 0.5 }),
  T(6, "Glass Skyline", "pop", 118, { uplifting: 0.6, energetic: 0.5, happy: 0.4 }),
  T(7, "Solar Flare", "electronicDance", 128, { energetic: 0.9, epic: 0.5, uplifting: 0.4 }),
  T(8, "Circuit Breaker", "electronicDance", 140, { energetic: 0.8, aggressive: 0.6 }),
  T(9, "Iron Choir", "metal", 145, { aggressive: 0.9, dark: 0.6, epic: 0.5 }),
  T(10, "Ashfall", "metal", 130, { aggressive: 0.7, dark: 0.8, sad: 0.3 }),
  T(11, "Morning Meadow", "folkCountry", 100, { happy: 0.8, calm: 0.6, uplifting: 0.5 }),
  T(12, "Porch Swing", "folkCountry", 92, { happy: 0.6, calm: 0.8, romantic: 0.3 }),
  T(13, "First Light", "classical", 70, { calm: 0.9, ethereal: 0.6, uplifting: 0.3 }),
  T(14, "Stargazer", "ambient", 60, { ethereal: 0.9, calm: 0.8 }),
  T(15, "Velvet Hour", "rnb", 88, { romantic: 0.8, calm: 0.5, sexy: 0.6 }),
  T(16, "Slow Burn", "rnb", 95, { romantic: 0.7, sexy: 0.7, dark: 0.3 }),
  T(17, "Summit Push", "electronicDance", 125, { epic: 0.8, energetic: 0.7, uplifting: 0.6 }),
  T(18, "Banner Sky", "classical", 105, { epic: 0.9, uplifting: 0.5, ethereal: 0.3 }),
  T(19, "Alley Cats", "jazz", 120, { happy: 0.5, energetic: 0.6 }),
  T(20, "Hollow Signal", "ambient", 75, { dark: 0.9, ethereal: 0.5, sad: 0.5 }),
];

// deterministic variants (no Math.random — stable across reloads): 20 bases -> 60 tracks,
// so the no-repeat grid placement doesn't exhaust the library after a few rooms
const clamp01 = (n: number) => Math.max(0, Math.min(1, Math.round(n * 100) / 100));
const SUFFIX = [" (Reprise)", " (Night Mix)"];
const BASES = [...TRACKS];
for (const [i, base] of BASES.entries())
  for (let v = 0; v < 2; v++)
    TRACKS.push(
      T(
        100 + i * 2 + v,
        base.title + SUFFIX[v],
        base.genre,
        base.bpm + (v ? -9 : 12) + (i % 5),
        Object.fromEntries(
          Object.entries(base.moods).map(([m, s], j) => [
            m,
            clamp01(s + (((i * 7 + j * 13 + v * 5) % 11) - 5) / 25),
          ]),
        ),
      ),
    );

const byId = new Map(TRACKS.map((t) => [t.id, t]));
const MOODS = [
  "aggressive", "calm", "dark", "energetic", "epic",
  "ethereal", "happy", "romantic", "sad", "sexy", "uplifting",
];

function similarity(a: MockTrack, b: MockTrack): number {
  let dot = 0, na = 0, nb = 0;
  for (const m of MOODS) {
    const x = a.moods[m] ?? 0, y = b.moods[m] ?? 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  const cos = na && nb ? dot / Math.sqrt(na * nb) : 0;
  const bpmProx = 1 - Math.min(Math.abs(a.bpm - b.bpm) / 80, 1);
  return 0.75 * cos + 0.25 * bpmProx;
}

const asResult = (t: MockTrack, score: number): ScoredTrack => ({
  score: Math.round(score * 100) / 100,
  track: { id: t.id, title: t.title, externalId: null },
});

const delay = <T,>(v: T): Promise<T> =>
  new Promise((res) => setTimeout(() => res(v), 150));

export function promptSearch(query: string, limit: number): Promise<ScoredTrack[]> {
  const q = query.toLowerCase();
  // keyword -> mood affinity; naive but enough for a demo entrance
  const hints: Record<string, string[]> = {
    dark: ["dark", "night", "rain", "alone", "lonely", "noir"],
    sad: ["sad", "melancholy", "lonely", "rain"],
    calm: ["calm", "chill", "relax", "study", "focus", "code"],
    energetic: ["energy", "workout", "run", "fast", "code"],
    epic: ["epic", "cinematic", "movie", "sci-fi", "trailer"],
    happy: ["happy", "sunny", "summer", "fun"],
    romantic: ["love", "romantic", "date"],
    ethereal: ["space", "dream", "float", "ambient"],
    aggressive: ["angry", "aggressive", "intense"],
    uplifting: ["hope", "uplifting", "rise"],
  };
  const scored = TRACKS.map((t) => {
    let s = 0.1;
    for (const [mood, words] of Object.entries(hints))
      if (words.some((w) => q.includes(w))) s += t.moods[mood] ?? 0;
    return asResult(t, Math.min(s, 0.99));
  }).sort((a, b) => b.score - a.score);
  return delay(scored.slice(0, limit));
}

export function similarTracks(id: string, limit: number): Promise<ScoredTrack[]> {
  const self = byId.get(id);
  if (!self) return Promise.reject(new Error(`mock: unknown track ${id}`));
  const scored = TRACKS.filter((t) => t.id !== id)
    .map((t) => asResult(t, similarity(self, t)))
    .sort((a, b) => b.score - a.score);
  return delay(scored.slice(0, limit));
}

export function trackModels(id: string): Promise<TrackModels> {
  const t = byId.get(id);
  if (!t) return Promise.reject(new Error(`mock: unknown track ${id}`));
  return delay({ moods: t.moods, bpm: t.bpm, genre: t.genre });
}
