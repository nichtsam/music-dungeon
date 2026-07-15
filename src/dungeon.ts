// Grid dungeon model. Rooms live on a 3D lattice; doors connect adjacent
// cells and are two-way. Structure is immutable once generated: a cell's
// exits are written exactly once. A similar track that's already placed
// elsewhere becomes a one-way secret door (portal) instead of a new room.
import type { ScoredTrack, TrackModels } from "./api";

export type Vec3 = [number, number, number];
export type ExitSlot = "north" | "east" | "south" | "west" | "up" | "down";

export const DIRS: Record<ExitSlot, Vec3> = {
  north: [0, -1, 0],
  south: [0, 1, 0],
  east: [1, 0, 0],
  west: [-1, 0, 0],
  up: [0, 0, 1],
  down: [0, 0, -1],
};
const SLOTS = Object.keys(DIRS) as ExitSlot[];

export const keyOf = (p: Vec3) => p.join(",");
export const parseKey = (k: string) => k.split(",").map(Number) as Vec3;
const shift = (p: Vec3, s: ExitSlot): Vec3 =>
  [p[0] + DIRS[s][0], p[1] + DIRS[s][1], p[2] + DIRS[s][2]];

export interface CellExit {
  kind: "door" | "portal"; // portal = one-way, doesn't occupy a wall
  slot: ExitSlot | "portal";
  toKey: string;
  toTitle: string;
  score: number;
  label: string;
}

export interface RoomCell {
  pos: Vec3;
  trackId: string;
  exits?: CellExit[]; // written exactly once, on first entry
}

export interface TrackInfo {
  id: string;
  title: string;
  externalId?: string | null; // jamendo id fallback for audio playback
  models?: TrackModels;
  duration?: number; // audio duration in seconds, cached from AudioPlayer
}

const MAX_EXITS = 6;
const MAX_PORTALS = 2;
// ponytail: threshold tuned against the mock score distribution; revisit with real API data
export const DOOR_THRESHOLD = 0.72;
// ponytail: ceiling tuned by feel on real API data alongside DOOR_THRESHOLD
export const DOOR_CEILING = 0.95; // above = duplicate/remaster, not a neighbor
const normTitle = (t: string) => t.toLowerCase().replace(/\.mp3$/, "").trim();

// small deterministic hash (djb2) for per-room procedural choices
export function hashKey(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

export interface GenResult {
  exits: CellExit[];
  newCells: Record<string, RoomCell>;
  newPlaced: Record<string, string>;
}

// reciprocal doors: a generated neighbor with a door facing us gives us the
// matching door back. Also used by Room2D as an escape hatch when exit
// generation fails mid-flight (API error) — the player is never trapped.
export function reciprocalDoors(
  key: string,
  cells: Record<string, RoomCell>,
  tracks: Record<string, TrackInfo>,
  selfModels: TrackModels | undefined,
): { doors: CellExit[]; freeSlots: ExitSlot[] } {
  const pos = parseKey(key);
  const doors: CellExit[] = [];
  const freeSlots: ExitSlot[] = [];
  for (const slot of SLOTS) {
    const nKey = keyOf(shift(pos, slot));
    const n = cells[nKey];
    if (!n) {
      freeSlots.push(slot);
      continue;
    }
    const facing = n.exits?.find((e) => e.kind === "door" && e.toKey === key);
    if (facing)
      doors.push({
        kind: "door",
        slot,
        toKey: nKey,
        toTitle: tracks[n.trackId]?.title ?? n.trackId,
        score: facing.score,
        label: doorLabel(selfModels, tracks[n.trackId]?.models, facing.score),
      });
  }
  return { doors, freeSlots };
}

export function generateExits(
  key: string,
  cells: Record<string, RoomCell>,
  placed: Record<string, string>,
  tracks: Record<string, TrackInfo>,
  similar: ScoredTrack[],
  selfModels: TrackModels | undefined,
  neighborModels: Record<string, TrackModels | undefined>,
): GenResult {
  const pos = parseKey(key);
  const selfId = cells[key].trackId;

  // 1. reciprocal doors; occupied neighbors without one stay sealed forever.
  const { doors, freeSlots } = reciprocalDoors(key, cells, tracks, selfModels);
  const exits: CellExit[] = doors;

  // 2. walk the similar list: placed track -> portal, new track -> placement.
  // Similarity gates the door count both ways: weak matches make no exits
  // (dead ends), near-identical ones (duplicate uploads, remasters) are
  // skipped for variety — as are same-titled candidates, keeping the best.
  const selfTitle = normTitle(tracks[selfId]?.title ?? "");
  const seenTitles = new Set(selfTitle ? [selfTitle] : []);
  const eligible = similar.filter((it) => {
    if (it.score < DOOR_THRESHOLD || it.score > DOOR_CEILING) return false;
    const t = normTitle(it.track.title);
    if (t && seenTitles.has(t)) return false;
    if (t) seenTitles.add(t);
    return true;
  });
  const list =
    key === "0,0,0" && eligible.length === 0
      ? similar.slice(0, 1) // the dungeon always offers one way forward
      : eligible;
  const targeted = new Set(exits.map((e) => e.toKey));
  const placements: ScoredTrack[] = [];
  let portals = 0;
  for (const it of list) {
    if (exits.length + placements.length >= MAX_EXITS) break;
    if (it.track.id === selfId) continue;
    if (placements.some((p) => p.track.id === it.track.id)) continue;
    const existingKey = placed[it.track.id];
    if (existingKey) {
      if (targeted.has(existingKey) || portals >= MAX_PORTALS) continue;
      targeted.add(existingKey);
      portals++;
      exits.push({
        kind: "portal",
        slot: "portal",
        toKey: existingKey,
        toTitle: it.track.title,
        score: it.score,
        label: doorLabel(selfModels, neighborModels[it.track.id], it.score),
      });
    } else if (placements.length < freeSlots.length) {
      placements.push(it);
    }
  }

  // 3. assign placements to free slots: brightest up, darkest down, rest by score
  const byValence = [...placements].sort(
    (a, b) =>
      valence(neighborModels[b.track.id]) - valence(neighborModels[a.track.id]),
  );
  const assignment = new Map<string, ExitSlot>();
  const remainingSlots = new Set(freeSlots);
  if (remainingSlots.has("up") && byValence.length >= 3) {
    assignment.set(byValence[0].track.id, "up");
    remainingSlots.delete("up");
  }
  if (remainingSlots.has("down") && byValence.length >= 3) {
    const lo = byValence[byValence.length - 1];
    assignment.set(lo.track.id, "down");
    remainingSlots.delete("down");
  }
  const h = hashKey(key);
  const horiz = (["north", "east", "south", "west"] as ExitSlot[]).filter(
    (s) => remainingSlots.has(s),
  );
  const rot = h % Math.max(1, horiz.length);
  const wallOrder: ExitSlot[] = [
    ...horiz.slice(rot),
    ...horiz.slice(0, rot),
    ...(["up", "down"] as ExitSlot[]).filter((s) => remainingSlots.has(s)),
  ];
  for (const p of placements) {
    if (!assignment.has(p.track.id)) assignment.set(p.track.id, wallOrder.shift()!);
  }

  const newCells: Record<string, RoomCell> = {};
  const newPlaced: Record<string, string> = {};
  for (const p of placements) {
    const slot = assignment.get(p.track.id)!;
    const nPos = shift(pos, slot);
    const nKey = keyOf(nPos);
    newCells[nKey] = { pos: nPos, trackId: p.track.id };
    newPlaced[p.track.id] = nKey;
    exits.push({
      kind: "door",
      slot,
      toKey: nKey,
      toTitle: p.track.title,
      score: p.score,
      label: doorLabel(selfModels, neighborModels[p.track.id], p.score),
    });
  }

  return { exits, newCells, newPlaced };
}

// --- direction labels from mood deltas -------------------------------------

const MOOD_WORDS: Record<string, [pos: string, neg: string]> = {
  dark: ["darker", "brighter"],
  energetic: ["more energetic", "mellower"],
  happy: ["happier", "moodier"],
  calm: ["calmer", "restless"],
  aggressive: ["harder", "softer"],
  epic: ["more epic", "humbler"],
  ethereal: ["dreamier", "more grounded"],
  romantic: ["more romantic", "cooler"],
  sad: ["sadder", "lighter"],
  sexy: ["sultrier", "cleaner"],
  uplifting: ["more uplifting", "heavier"],
};

const MOOD_THRESHOLD = 0.12;
const BPM_THRESHOLD = 15;

export function doorLabel(
  cur: TrackModels | undefined,
  nb: TrackModels | undefined,
  score: number,
): string {
  const fallback = `${Math.round(score * 100)}% similar`;
  if (!cur || !nb) return fallback;
  let best: { word: string; mag: number } | null = null;
  for (const [mood, [pos, neg]] of Object.entries(MOOD_WORDS)) {
    const d = (nb.moods[mood] ?? 0) - (cur.moods[mood] ?? 0);
    if (Math.abs(d) >= MOOD_THRESHOLD && (!best || Math.abs(d) > best.mag))
      best = { word: d > 0 ? pos : neg, mag: Math.abs(d) };
  }
  if (cur.bpm && nb.bpm) {
    const d = nb.bpm - cur.bpm;
    // BPM competes on a normalized scale: 40 BPM apart ~ full mood swing
    if (Math.abs(d) >= BPM_THRESHOLD && (!best || Math.abs(d) / 40 > best.mag))
      best = { word: d > 0 ? "faster" : "slower", mag: Math.abs(d) / 40 };
  }
  return best ? `${best.word} · ${Math.round(score * 100)}%` : fallback;
}

// brightness valence: stairs lead up toward light, trapdoors down into gloom
export const valence = (m?: TrackModels) =>
  m
    ? (m.moods.happy ?? 0) + (m.moods.uplifting ?? 0) -
      (m.moods.dark ?? 0) - (m.moods.sad ?? 0)
    : 0;

if (import.meta.env.DEV) {
  const mk = (id: string, score: number): ScoredTrack => ({
    score,
    track: { id, title: id },
  });
  const M = (moods: Record<string, number>, bpm = 100): TrackModels => ({
    moods, bpm, genre: null,
  });
  console.assert(
    doorLabel(M({ dark: 0.2 }), M({ dark: 0.6 }), 0.8) === "darker · 80%" &&
      doorLabel(M({}), M({}), 0.8) === "80% similar",
    "doorLabel smoke check failed",
  );

  // entrance: 6 free slots, 5 similar unplaced -> 5 doors, brightest up, darkest down
  const cells: Record<string, RoomCell> = {
    "0,0,0": { pos: [0, 0, 0], trackId: "self" },
  };
  const placed: Record<string, string> = { self: "0,0,0" };
  const sims = ["a", "b", "c", "d", "e"].map((id, i) => mk(id, 0.95 - i * 0.03));
  const nbm = { a: M({ happy: 0.9 }), e: M({ dark: 0.9 }) };
  const g1 = generateExits("0,0,0", cells, placed, {}, sims, M({}), nbm);
  console.assert(
    g1.exits.length === 5 &&
      g1.exits.find((e) => e.slot === "up")?.toTitle === "a" &&
      g1.exits.find((e) => e.slot === "down")?.toTitle === "e",
    "generateExits placement smoke check failed",
    g1.exits,
  );

  // reciprocity: enter any horizontal neighbor of the entrance -> it must have
  // a door back the opposite direction; portal to an already-placed track; dedup
  const OPPO: Record<ExitSlot, ExitSlot> = {
    north: "south", south: "north", east: "west", west: "east", up: "down", down: "up",
  };
  const cells2 = { ...cells, ...g1.newCells };
  for (const [k, c] of Object.entries(cells2)) if (k === "0,0,0") c.exits = g1.exits;
  const placed2 = { ...placed, ...g1.newPlaced };
  const adjExit = g1.exits.find((e) => e.slot !== "up" && e.slot !== "down")!;
  const adjKey = adjExit.toKey;
  const adjId = cells2[adjKey].trackId;
  const g2 = generateExits(
    adjKey, cells2, placed2, { self: { id: "self", title: "self" } },
    [mk("e", 0.95), mk("self", 0.9), mk("z", 0.5)], M({}), {},
  );
  const back = g2.exits.find((e) => e.toKey === "0,0,0");
  console.assert(
    back?.kind === "door" && back.slot === OPPO[adjExit.slot as ExitSlot],
    "reciprocal door smoke check failed", g2.exits, adjId,
  );
  console.assert(
    g2.exits.filter((e) => e.kind === "portal").length === 1 &&
      g2.exits.find((e) => e.kind === "portal")?.toKey === placed2.e,
    "portal smoke check failed", g2.exits,
  );

  // score gating: below-threshold similars produce no exits (dead end)...
  const g3 = generateExits(
    adjKey, cells2, placed2, {}, [mk("w1", 0.5), mk("w2", 0.4)], M({}), {},
  );
  console.assert(
    g3.exits.every((e) => e.kind === "door" && e.toKey === "0,0,0"),
    "threshold dead-end smoke check failed", g3.exits,
  );
  // ...except at the entrance, which always offers one way forward
  const g4 = generateExits(
    "0,0,0", { "0,0,0": { pos: [0, 0, 0], trackId: "self" } }, { self: "0,0,0" },
    {}, [mk("w1", 0.5), mk("w2", 0.4)], M({}), {},
  );
  console.assert(g4.exits.length === 1, "entrance fallback smoke check failed", g4.exits);
}
